const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

async function loadNotify(testApi) {
  globalThis.__notifyTest = testApi;
  let source = readFileSync(join(__dirname, '../public/js/notify.js'), 'utf8');
  source = source.replace('import { store } from "./store.js";',
    'const { store, updateConfig, basename, firstLine, shortId, toast } = globalThis.__notifyTest;');
  source = source.replace('import { updateConfig } from "./ws.js";', '');
  source = source.replace('import { basename, firstLine, shortId } from "./util.js";', '');
  source = source.replace('import { toast } from "./ui/toast.js";', '');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('a backgrounded agent completion leaves a visible, actionable in-app notification', async (t) => {
  const listeners = new Map();
  const shown = [];
  const selected = [];
  const session = { id: 'worker-1', name: 'Gengar', cwd: 'C:/work/CardDelta', latestAgent: 'Finished the task.' };
  const store = {
    notify: {},
    sessions: new Map([[session.id, session]]),
    activeId: 'another-session',
    on: (event, listener) => listeners.set(event, listener),
    select: (id) => selected.push(id),
  };
  const api = await loadNotify({
    store,
    updateConfig: () => {},
    basename: (path) => path.split('/').pop(),
    firstLine: (text) => text.split('\n')[0],
    shortId: (id) => id,
    toast: { success: (opts) => shown.push(opts) },
  });
  t.after(() => { delete globalThis.__notifyTest; });

  api.initNotify();
  listeners.get('session:wentIdle')(session.id, 5000);

  assert.equal(shown.length, 1, 'completion should create an in-app visual notification');
  assert.match(shown[0].title, /Gengar/);
  assert.equal(shown[0].duration, 0, 'the notification should remain until seen');
  assert.equal(shown[0].action.label, 'Open agent');
  shown[0].action.onClick();
  assert.deepEqual(selected, [session.id]);
});
