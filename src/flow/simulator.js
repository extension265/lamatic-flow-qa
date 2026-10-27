// In-browser stand-in for Lamatic's executor. Deliberately non-deterministic for
// AI nodes (random phrasing, latency, token counts), like a real LLM would be.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));

export async function simulateNode(node, input) {
  const { kind, config = {} } = node.data;
  await sleep(150 + Math.random() * 450);
  switch (kind) {
    case 'generateText': {
      const opener = pick(['Certainly.', 'Here is what I found.', 'Sure —', 'Good question.']);
      const body = `${opener} You asked: "${text(input).slice(0, 120)}". ${pick(['A short answer follows.', 'Here is a concise reply.', 'Summarised below.'])}`;
      return { status: 'success', output: body, tokens: 40 + Math.floor(Math.random() * 60), model: config.model };
    }
    case 'generateJSON':
      return { status: 'success', output: JSON.stringify({ intent: pick(['question', 'greeting', 'complaint']), confidence: +(0.6 + Math.random() * 0.4).toFixed(2) }), tokens: 30 };
    case 'rag':
    case 'vectorSearch':
      return { status: 'success', output: { query: text(input), chunks: Array.from({ length: Number(config.topK) || 3 }, (_, i) => ({ id: `chunk-${i + 1}`, score: +(0.9 - i * 0.1).toFixed(2) })) } };
    case 'condition':
      return { status: 'success', output: { branch: text(input).length > 0 ? 'true' : 'false', value: input } };
    case 'wait':
      await sleep(Math.min(Number(config.ms) || 0, 3000));
      return { status: 'success', output: input };
    case 'slack':
      return { status: 'success', output: { delivered: true, channel: config.channel } };
    case 'apiRequest':
      return { status: 'success', output: { status: 200, body: { ok: true } } };
    case 'code':
    case 'response':
    default:
      return { status: 'success', output: input };
  }
}
