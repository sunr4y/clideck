const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { fileURLToPath } = require('node:url');
const { createOpenCodeLaunch } = require('../src/opencode-launch');
const { AgentSession } = require('../src/session');
const { getProvider } = require('../src/providers');

test('OpenCode streams changing assistant text to CliDeck while a turn is still running', async (t) => {
  const launch = createOpenCodeLaunch({ port: 4100, sessionId: 'open-preview' });
  t.after(launch.cleanup);
  const config = JSON.parse(readFileSync(launch.env.OPENCODE_CONFIG, 'utf8'));
  const bridgePath = fileURLToPath(config.plugin[0]);
  const source = readFileSync(bridgePath, 'utf8');
  const requests = [];
  const originalFetch = global.fetch;
  const originalEnv = {
    CLIDECK_NEXT_SESSION_ID: process.env.CLIDECK_NEXT_SESSION_ID,
    CLIDECK_NEXT_PORT: process.env.CLIDECK_NEXT_PORT,
    CLIDECK_URL: process.env.CLIDECK_URL,
  };
  process.env.CLIDECK_NEXT_SESSION_ID = 'open-preview';
  process.env.CLIDECK_NEXT_PORT = '4100';
  process.env.CLIDECK_URL = 'http://127.0.0.1:4100';
  global.fetch = async (url, options) => {
    requests.push({ url: new URL(url), payload: JSON.parse(options.body) });
    return { ok: true };
  };
  t.after(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const bridgeModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const bridge = await bridgeModule.CliDeckNextBridge({ client: {} });
  await bridge.event({ event: { type: 'session.created', properties: { info: { id: 'native-1' } } } });
  await bridge.event({ event: { type: 'session.status', properties: { sessionID: 'native-1', status: { type: 'busy' } } } });
  await bridge.event({ event: { type: 'message.part.updated', properties: {
    sessionID: 'native-1', part: { type: 'text', time: { start: 1 }, text: 'The task is progressing.' },
  } } });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const update = requests.find((request) => request.url.pathname.endsWith('/update'));
  assert.ok(update, `a live preview update should be sent before the turn ends; requests: ${requests.map(({ url }) => url.pathname).join(', ')}`);
  assert.equal(update.payload.text, 'The task is progressing.');

  const session = new AgentSession({ provider: getProvider('opencode'), port: 4100 });
  session.turnOpen = true;
  const events = [];
  session.on('event', (event) => events.push(event));
  session.handleHook('update', update.payload);
  assert.deepEqual(events.map((event) => event.type), ['agent.update']);
  assert.equal(events[0].text, 'The task is progressing.');
  assert.equal(session.turnOpen, true, 'preview updates must not mark the turn complete');
});
