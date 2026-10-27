// One-click test dashboard: `npm run dashboard`, open http://localhost:4400, press Run.
// Spawns Playwright with the live reporter and streams results to the browser (SSE).
// Zero dependencies — plain Node http.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.DASHBOARD_PORT || 4400);
const PW_CLI = createRequire(import.meta.url).resolve('@playwright/test/cli');
const REPORT_DIR = path.join(ROOT, 'playwright-report');
const PREFIX = '@@LIVE@@';

const clients = new Set();
let child = null;
let events = []; // replayed to dashboards that connect mid-run

const broadcast = (event) => {
  events.push(event);
  const data = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach((res) => res.write(data));
};

function startRun({ project = 'chromium', spec = '', headed = false }) {
  if (child) return false;
  events = [];
  const args = [PW_CLI, 'test', '--reporter=./tests/reporters/live-reporter.js,html'];
  if (project !== 'all') args.push(`--project=${project}`);
  if (spec) args.push(spec);
  if (headed) args.push('--headed', '--workers=1');

  broadcast({ type: 'started', at: Date.now(), args: args.slice(2) });
  child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.startsWith(PREFIX)) {
        try { broadcast(JSON.parse(line.slice(PREFIX.length))); } catch { /* ignore partial line */ }
      } else if (line.trim()) {
        broadcast({ type: 'log', line });
      }
    }
  });
  child.stderr.on('data', (chunk) => broadcast({ type: 'log', line: String(chunk).trim() }));
  child.on('close', (code) => {
    broadcast({ type: 'exit', code, reportUrl: '/report/index.html' });
    child = null;
  });
  return true;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webm': 'video/webm', '.zip': 'application/zip', '.svg': 'image/svg+xml' };

async function serveFile(res, file) {
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found — run the tests first.');
  }
}

const readBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/') return serveFile(res, path.join(ROOT, 'dashboard', 'index.html'));

  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    events.forEach((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url.pathname === '/run' && req.method === 'POST') {
    const ok = startRun(await readBody(req));
    res.writeHead(ok ? 202 : 409, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ started: ok }));
  }

  if (url.pathname === '/stop' && req.method === 'POST') {
    if (child) child.kill('SIGINT');
    return res.writeHead(202).end();
  }

  if (url.pathname.startsWith('/report/')) {
    const rel = decodeURIComponent(url.pathname.slice('/report/'.length)) || 'index.html';
    const file = path.normalize(path.join(REPORT_DIR, rel));
    if (!file.startsWith(REPORT_DIR)) return res.writeHead(403).end();
    return serveFile(res, file);
  }

  res.writeHead(404).end();
}).listen(PORT, () => {
  console.log(`Test dashboard: http://localhost:${PORT}`);
});
