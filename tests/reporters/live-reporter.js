// Custom Playwright reporter: streams one JSON event per line to stdout so the
// dashboard (dashboard/server.js) can show tests running live.
const PREFIX = '@@LIVE@@';

const emit = (event) => process.stdout.write(`${PREFIX}${JSON.stringify(event)}\n`);
const idOf = (test) => test.id;
const fileOf = (test) => test.location.file.split(/[\\/]tests[\\/]e2e[\\/]/).pop();
const titleOf = (test) => test.titlePath().slice(3).join(' › '); // drop root, project, file

export default class LiveReporter {
  onBegin(config, suite) {
    const tests = suite.allTests().map((t) => ({
      id: idOf(t),
      title: titleOf(t),
      file: fileOf(t),
      project: t.parent.project()?.name ?? '',
    }));
    emit({ type: 'begin', total: tests.length, workers: config.workers, tests });
  }

  onTestBegin(test, result) {
    emit({ type: 'testBegin', id: idOf(test), retry: result.retry });
  }

  onStepBegin(test, result, step) {
    if (step.category === 'test.step' || step.category === 'expect' || step.category === 'pw:api') {
      emit({ type: 'step', id: idOf(test), title: step.title });
    }
  }

  onTestEnd(test, result) {
    emit({
      type: 'testEnd',
      id: idOf(test),
      status: result.status,              // passed | failed | timedOut | skipped | interrupted
      outcome: test.outcome(),            // expected | unexpected | flaky | skipped
      retry: result.retry,
      duration: result.duration,
      error: result.error ? stripAnsi(result.error.message || String(result.error)).slice(0, 1500) : null,
    });
  }

  onEnd(result) {
    emit({ type: 'end', status: result.status, duration: result.duration });
  }

  printsToStdio() { return false; }
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}
