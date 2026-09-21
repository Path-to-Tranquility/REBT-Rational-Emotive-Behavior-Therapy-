// Browser speech is mocked: run with node --test test-voice.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(supported = true) {
  class Element {
    constructor(id, type = 'textarea', required = true) {
      Object.assign(this, { id, type, required, value: '', textContent: id, listeners: {} });
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute() {}
    getAttribute() { return null; }
    after() {}
    scrollIntoView() {}
  }
  const html = fs.readFileSync('voice.html', 'utf8');
  const fields = [...html.matchAll(/<(textarea|input)\b([^>]+)>/g)]
    .filter(match => match[1] === 'textarea' || match[2].includes('type="number"'))
    .map(match => new Element(match[2].match(/id="([^"]+)"/)[1], match[1] === 'textarea' ? 'textarea' : 'number', match[2].includes('required')));
  const elements = {};
  ['rebt', 'status', 'voice-status', 'voice-preview', 'start-voice', 'stop-voice', 'done-voice', 'keep-answer', 'redo-answer', 'retry-voice', 'entry_date', 'submit'].forEach(id => { elements[id] = new Element(id); });
  const form = elements.rebt;
  form.querySelector = () => elements.submit;
  form.querySelectorAll = query => query === 'input, textarea' ? [...fields, elements.entry_date] : fields;
  form.reportValidity = () => fields.every(field => !field.required || field.value !== '');
  form.reset = () => fields.forEach(field => { field.value = ''; });
  const document = {
    querySelector: query => query.startsWith('label') ? { textContent: query } : elements[query.slice(1)],
    getElementById: () => null,
    createElement: () => new Element('button'),
    addEventListener() {}
  };
  const spoken = [];
  const timers = new Map();
  let timerId = 0;
  let latest;
  let saves = 0;
  class Recognition {
    constructor() { latest = this; }
    start() { if (this.onstart) this.onstart(); }
    stop() { this.onend(); }
    abort() { this.onend(); }
  }
  const context = vm.createContext({
    document, window: { SpeechRecognition: supported ? Recognition : null, SpeechSynthesisUtterance: function(text) { this.text = text; },
      speechSynthesis: { speak: u => spoken.push(u), cancel: () => { spoken.length = 0; } }, addEventListener() {} },
    SpeechSynthesisUtterance: function(text) { this.text = text; },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    FormData: class { *[Symbol.iterator]() { for (const field of fields) yield [field.id, field.value]; } },
    fetch: async () => { saves++; return { ok: true, json: async () => ({message: 'Saved.'}) }; }
  });
  vm.runInContext(fs.readFileSync('voice.js', 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  function flush() { while (spoken.length) spoken.shift().onend(); }
  function say(text) {
    const result = [{ transcript: text }]; result.isFinal = true;
    const session = latest;
    session.onresult({resultIndex: 0, results: [result]});
    session.onend();
  }
  return { run, fields, elements, flush, say, spoken, timers, saves: () => saves, session: () => latest };
}

test('short conversational prompts hand off to listening and finish after a brief pause', () => {
  const app = setup();
  for (let i = 0; i < app.fields.length; i++) {
    app.run(`index = ${i}; askQuestion()`);
    assert.equal(app.spoken.length, 1, 'each question fits one utterance');
    assert.ok(app.spoken[0].text.length < 120);
    assert.equal(app.spoken[0].rate, 1.1);
  }
  app.run('index = 0; guided = true; askQuestion()');
  app.flush();
  const result = [{ transcript: 'My delivery was late' }];
  result.isFinal = true;
  app.session().onresult({ resultIndex: 0, results: [result] });
  const timer = [...app.timers.values()][0];
  assert.equal(timer.delay, 1500);
  timer.callback();
  assert.equal(app.run('phase'), 'review');
  assert.match(app.spoken[0].text, /Does that match/);
  app.flush(); app.say('yes');
  assert.equal(app.run('index'), 1);
  assert.equal(app.saves(), 0);
});

test('narrates, confirms, redoes, and requires final permission before CSV save', async () => {
  const app = setup();
  app.fields[0].value = 'Original';
  app.run('guided = true; askQuestion()');
  assert.ok(app.session(), 'microphone warms up during narration');
  app.flush(); app.say('First draft');
  assert.equal(app.fields[0].value, 'First draft');
  assert.equal(app.run('phase'), 'review');
  app.flush(); app.say('redo');
  assert.equal(app.fields[0].value, 'Original');
  app.flush(); app.say('Corrected answer');
  app.flush(); app.say('maybe save later');
  assert.equal(app.run('phase'), 'review');
  assert.equal(app.saves(), 0);
  app.run('accept()');
  for (let i = 1; i < app.fields.length; i++) {
    app.flush();
    if (app.fields[i].type === 'number') {
      app.say('eleven');
      assert.equal(app.run('phase'), 'answer');
      app.flush(); app.say('five');
      assert.equal(app.fields[i].value, '5');
    } else app.say(app.fields[i].required ? 'My answer' : 'skip');
    app.flush(); app.say('save');
  }
  assert.equal(app.run('phase'), 'final');
  assert.equal(app.saves(), 0, 'keeping individual answers must not save CSV');
  app.flush(); app.say('do not save');
  assert.equal(app.saves(), 0, 'ambiguous or negative speech is not permission');
  app.run('finalReview()');
  app.flush();
  app.run('decide("save entry")');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.saves(), 1);
  assert.equal(app.run('phase'), 'idle');
});

test('stop restores unconfirmed answer and ignores stale callbacks', () => {
  const app = setup();
  app.fields[0].value = 'Kept answer';
  app.run('askQuestion()'); app.flush(); app.say('Unconfirmed change'); app.flush();
  const old = app.session();
  app.run('stop()');
  assert.equal(app.fields[0].value, 'Kept answer');
  old.onend();
  assert.equal(app.run('phase'), 'idle');
  assert.equal(app.saves(), 0);
});

test('natural confirmations interrupt narration exactly once', () => {
  for (const phrase of ['yes', 'correct', 'yup', 'Yep!', 'that’s right', 'yes please', 'yeah correct']) {
    const app = setup();
    app.run('guided = true; askQuestion()'); app.flush(); app.say('My answer');
    const narration = app.spoken[0];
    const session = app.session();
    app.say(phrase);
    assert.equal(app.run('index'), 1, phrase);
    assert.equal(app.run('phase'), 'answer');
    narration.onend(); session.onend();
    assert.equal(app.run('index'), 1, 'old callbacks cannot advance twice');
    assert.equal(app.saves(), 0);
  }
});

test('negative replies interrupt confirmation and restore the previous answer', () => {
  for (const phrase of ['redo', 'no', 'na', 'nah', 'nope', 'not at all', 'not really', 'not correct', 'yes but that is wrong', 'try again', 'No, thank you']) {
    const app = setup();
    app.fields[0].value = 'Previous answer';
    app.run('guided = true; askQuestion()'); app.flush(); app.say('Draft');
    app.say(phrase);
    assert.equal(app.run('index'), 0, phrase);
    assert.equal(app.run('phase'), 'answer', phrase);
    assert.equal(app.fields[0].value, 'Previous answer');
  }
});

test('unclear replies keep listening, interim replies do not commit, and ended sessions restart', () => {
  const app = setup();
  app.run('guided = true; askQuestion()'); app.flush(); app.say('My answer');
  const session = app.session();
  const interim = [{ transcript: 'yes' }]; interim.isFinal = false;
  session.onresult({resultIndex: 0, results: [interim]});
  assert.equal(app.run('phase'), 'review');
  const unclear = [{ transcript: 'maybe' }]; unclear.isFinal = true;
  session.onresult({resultIndex: 0, results: [unclear]});
  assert.equal(app.session(), session);
  assert.equal(app.run('phase'), 'review');
  session.onend();
  const restart = [...app.timers.values()].find(timer => timer.delay === 250);
  assert.ok(restart);
  restart.callback();
  assert.notEqual(app.session(), session);
  session.onend();
  app.say('yup');
  assert.equal(app.run('index'), 1);
});

test('microphone errors do not advance and unsupported browsers retain button confirmation', () => {
  const app = setup();
  app.run('askQuestion()'); app.flush();
  app.session().onerror({error: 'not-allowed'}); app.session().onend();
  assert.match(app.elements['voice-status'].textContent, /permission was denied/);
  assert.equal(app.run('phase'), 'answer');
  assert.equal(app.saves(), 0);
  const fallback = setup(false);
  fallback.fields.forEach(field => { field.value = field.type === 'number' ? '5' : 'Typed answer'; });
  fallback.run('finalReview()');
  assert.equal(fallback.elements['keep-answer'].hidden, false);
  assert.equal(fallback.saves(), 0);
});


test('microphone is ready before the question ends and stays open for the answer', () => {
  const app = setup();
  app.run('askQuestion()');
  const session = app.session();
  assert.ok(session);
  assert.equal(app.elements['done-voice'].disabled, true);
  const echo = [{ transcript: 'What happened?' }]; echo.isFinal = false;
  session.onresult({resultIndex: 0, results: [echo]});
  app.flush();
  assert.equal(app.session(), session, 'no microphone restart at end of question');
  assert.equal(app.elements['done-voice'].disabled, false);
  echo.isFinal = true;
  const answer = [{ transcript: 'My parcel was late' }]; answer.isFinal = true;
  session.onresult({resultIndex: 0, results: [echo, answer]});
  session.stop();
  assert.equal(app.fields[0].value, 'My parcel was late');
});
