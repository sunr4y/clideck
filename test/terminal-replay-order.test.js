const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('session terminal is resized only after its replay buffer has been parsed', () => {
  const source = readFileSync(require.resolve('../public/js/ui/terminal.js'), 'utf8');
  const match = source.match(/function focusSession\(id\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'focusSession should exist');
  let replayDone;
  let refits = 0;
  const session = { outputBuf: 'alternate-screen replay' };
  const term = { reset() {}, focus() {} };
  const state = {
    closePromptDropdown() {}, applyActiveTheme() {},
    store: { activeId: 's1', sessions: new Map([['s1', session]]) },
    updateEmpty() {}, updateHeader() {}, term, sentDims: new Map(),
    writeTerminal(_data, _replay, done) { replayDone = done; },
    requestAnimationFrame(callback) { callback(); },
    fit() { refits++; }, renaming: false, updateScrollBtn() {}, probeVisiblePaths() {},
  };
  const declarations = Object.keys(state).map((key) => `const ${key} = state.${key};`).join('\n');
  new Function('state', 'id', `${declarations}\n${match[0]}\nfocusSession(id);`)(state, 's1');

  assert.equal(refits, 0, 'do not resize while xterm is still parsing the replay');
  replayDone();
  assert.equal(refits, 1, 'resize once xterm has finished parsing');
});
