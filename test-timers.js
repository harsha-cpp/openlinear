const test = require('node:test');
const assert = require('node:assert');

test('timers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let called = false;
  setTimeout(() => { called = true; }, 1000);
  t.mock.timers.tick(1000);
  assert.strictEqual(called, true);
});
