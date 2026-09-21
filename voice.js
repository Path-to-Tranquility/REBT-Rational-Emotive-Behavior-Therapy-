const form = document.querySelector('#rebt');
const status = document.querySelector('#status');
const saveButton = form.querySelector('[type=submit]');
const voiceStatus = document.querySelector('#voice-status');
const preview = document.querySelector('#voice-preview');
const startButton = document.querySelector('#start-voice');
const stopButton = document.querySelector('#stop-voice');
const doneButton = document.querySelector('#done-voice');
const keepButton = document.querySelector('#keep-answer');
const redoButton = document.querySelector('#redo-answer');
const retryButton = document.querySelector('#retry-voice');
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = Boolean(Recognition && window.speechSynthesis && window.SpeechSynthesisUtterance);
const fields = Array.from(form.querySelectorAll('textarea, input[type=number]'));
const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
let index = 0;
let guided = false;
let phase = 'idle';
let recognition = null;
let generation = 0;
let silenceTimer;
let utterance;
let original = null;
let saving = false;
const fieldButtons = [];

function setDate() {
  const now = new Date();
  document.querySelector('#entry_date').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function label(field) { return document.querySelector(`label[for="${field.id}"]`).textContent; }
function normalize(text) { return text.toLowerCase().trim().replace(/[.!?,]+$/g, '').trim(); }
function controls() {
  const busy = phase !== 'idle';
  startButton.disabled = !supported || busy;
  stopButton.disabled = !busy || saving;
  doneButton.disabled = phase !== 'answer' || !recognition;
  keepButton.hidden = redoButton.hidden = !['review', 'final'].includes(phase);
  keepButton.textContent = phase === 'final' ? 'Save entry to CSV' : 'Keep answer';
  redoButton.textContent = phase === 'final' ? 'Review questions again' : 'Redo answer';
  retryButton.hidden = !['answer', 'review', 'final'].includes(phase) || Boolean(recognition);
  retryButton.disabled = !supported;
  saveButton.disabled = busy;
  fieldButtons.forEach(button => { button.disabled = !supported || busy; });
  form.querySelectorAll('input, textarea').forEach(field => { field.readOnly = busy; });
}
// Invalidate callbacks before stopping audio, so cancelled sessions cannot advance or save.
function cancelAudio() {
  generation++;
  clearTimeout(silenceTimer);
  const previous = recognition;
  recognition = null;
  if (previous) previous.abort();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  utterance = null;
  preview.textContent = '';
}
function narrate(text, next) {
  cancelAudio();
  voiceStatus.textContent = text;
  controls();
  if (!supported) return;
  const token = generation;
  // Short chunks avoid long read-backs being cut off by some speech engines.
  const chunks = text.match(/.{1,180}(?:\s|$)|.{1,180}/g) || [text];
  function speakNext() {
    if (token !== generation) return;
    if (!chunks.length) { utterance = null; if (next) next(); return; }
    utterance = new SpeechSynthesisUtterance(chunks.shift());
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.onend = speakNext;
    utterance.onerror = () => {
      if (token !== generation) return;
      voiceStatus.textContent = 'Could not read aloud. Use the buttons below, or select Retry voice.';
      controls();
    };
    window.speechSynthesis.speak(utterance);
  }
  speakNext();
}
function listen(mode) {
  cancelAudio();
  const token = generation;
  const session = new Recognition();
  recognition = session;
  session.lang = 'en-US';
  session.continuous = mode === 'answer';
  session.interimResults = true;
  let transcript = '';
  let error = '';
  const finalResults = new Map();
  controls();
  voiceStatus.textContent = mode === 'answer'
    ? 'Listening for your answer. Pause for 3 seconds when finished, or select Done answering.'
    : (phase === 'final' ? 'Listening: say “save entry” or “redo”.' : 'Listening: say “save” to keep this answer, or “redo”.');
  session.onresult = event => {
    if (token !== generation) return;
    clearTimeout(silenceTimer);
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalResults.set(i, event.results[i][0].transcript.trim());
      else interim += event.results[i][0].transcript + ' ';
    }
    transcript = Array.from(finalResults.values()).join(' ').trim();
    preview.textContent = `Hearing: ${transcript} ${interim}`;
    if (mode === 'answer' && transcript && !interim.trim()) {
      silenceTimer = setTimeout(() => { if (token === generation) session.stop(); }, 3000);
    }
  };
  session.onerror = event => {
    const messages = {
      'not-allowed': 'Microphone permission was denied. Allow access in browser settings and retry.',
      'service-not-allowed': 'The speech service is blocked. Try a supported browser or use the buttons.',
      'audio-capture': 'No microphone is available. Check your microphone and retry.',
      'network': 'The speech service could not connect. Check your connection and retry.',
      'no-speech': 'No speech was detected. Select Retry voice, or use the buttons.'
    };
    error = messages[event.error] || 'Listening was interrupted. Select Retry voice, or use the buttons.';
  };
  session.onend = () => {
    if (token !== generation) return;
    clearTimeout(silenceTimer);
    recognition = null;
    preview.textContent = '';
    controls();
    if (error) { voiceStatus.textContent = error; return; }
    if (!transcript) { voiceStatus.textContent = 'No answer heard. Select Retry voice, or use the buttons.'; return; }
    if (mode === 'answer') reviewAnswer(transcript);
    else decide(transcript);
  };
  try { session.start(); } catch (error) {
    recognition = null;
    voiceStatus.textContent = 'Could not start listening. Select Retry voice or use the buttons.';
    controls();
  }
}
function askQuestion() {
  const field = fields[index];
  phase = 'answer';
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const hint = document.getElementById(field.getAttribute('aria-describedby'));
  const instructions = field.type === 'number'
    ? 'Rate your emotional distress from zero, none, to ten, strongest. Say one whole number.'
    : (hint ? hint.textContent : '');
  narrate(`${label(field)}. ${instructions} ${field.required ? '' : 'Say skip to leave this optional answer blank.'} Please tell me your answer after I finish speaking. Pause for three seconds when you are done.`, () => listen('answer'));
}
function reviewAnswer(text) {
  const field = fields[index];
  if (field.type === 'number') {
    const word = normalize(text);
    const number = numbers.includes(word) ? numbers.indexOf(word) : (/^(10|[0-9])$/.test(word) ? Number(word) : -1);
    if (number < 0) {
      narrate('I could not understand that rating. Please say one whole number from zero to ten.', () => listen('answer'));
      return;
    }
    text = String(number);
  }
  if (!field.required && normalize(text) === 'skip') text = '';
  original = field.value;
  field.value = text;
  phase = 'review';
  readAnswer();
}
function readAnswer() {
  narrate(`For ${label(fields[index])}, your answer is: ${fields[index].value || 'left blank'}. Do you want to save this answer in the form or redo it? Say save or redo. The CSV will be saved only after all questions and your final permission.`, () => listen('decision'));
}
function accept() {
  if (!['review', 'final'].includes(phase)) return;
  cancelAudio();
  if (phase === 'final') { saveEntry(); return; }
  original = null;
  if (guided && ++index < fields.length) askQuestion();
  else if (guided) finalReview();
  else {
    phase = 'idle';
    controls();
    voiceStatus.textContent = 'Answer kept in the form. Continue with another question or select Save entry to CSV.';
  }
}
function redo() {
  if (!['review', 'final'].includes(phase)) return;
  cancelAudio();
  if (phase === 'final') { guided = true; index = 0; }
  else if (original !== null) fields[index].value = original;
  original = null;
  askQuestion();
}
function decide(text) {
  const command = normalize(text);
  const accepted = phase === 'final' ? ['save entry', 'save', 'yes', 'yes save', 'yes save entry'] : ['save', 'keep', 'yes', 'save answer', 'keep answer'];
  if (accepted.includes(command)) accept();
  else if (['redo', 'no', 'redo answer'].includes(command)) redo();
  else {
    // Ambiguous speech is never treated as permission.
    voiceStatus.textContent = `Heard “${text}”. Please select Retry voice and say ${phase === 'final' ? 'save entry' : 'save'} or redo, or use the buttons.`;
    controls();
  }
}
function finalReview() {
  cancelAudio();
  phase = 'idle';
  controls();
  if (!form.reportValidity()) { voiceStatus.textContent = 'Complete the highlighted field before saving.'; return; }
  phase = 'final';
  const summary = fields.map(field => `${label(field)}: ${field.value || 'left blank'}.`).join(' ');
  narrate(`Here is your completed record for ${document.querySelector('#entry_date').value}. ${summary} May I save this entry to the CSV? Say save entry to save, or redo to go through the questions again. You can also select Stop voice to edit the form.`, () => listen('decision'));
}
async function saveEntry() {
  if (saving) return;
  saving = true;
  phase = 'saving';
  controls();
  status.className = '';
  status.textContent = 'Saving…';
  try {
    const response = await fetch('/entries', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form)))});
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    form.reset();
    setDate();
    status.textContent = result.message + ' You can add another entry.';
  } catch (error) {
    status.className = 'error';
    status.textContent = error instanceof TypeError || error instanceof SyntaxError
      ? 'Unable to confirm the save. Check that python app.py is running and check the CSV before retrying. Your answers are still here.'
      : error.message;
  } finally {
    saving = false;
    phase = 'idle';
    guided = false;
    controls();
    narrate(status.textContent);
  }
}
fields.forEach((field, position) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'speak';
  button.textContent = 'Read question and answer orally';
  button.setAttribute('aria-label', `Read question and answer orally: ${label(field)}`);
  field.after(button);
  fieldButtons.push(button);
  button.addEventListener('click', () => { index = position; guided = false; askQuestion(); });
});
startButton.addEventListener('click', () => { index = 0; guided = true; askQuestion(); });
doneButton.addEventListener('click', () => { if (recognition) { clearTimeout(silenceTimer); recognition.stop(); doneButton.disabled = true; } });
keepButton.addEventListener('click', accept);
redoButton.addEventListener('click', redo);
retryButton.addEventListener('click', () => {
  if (phase === 'answer') askQuestion();
  else if (phase === 'review') readAnswer();
  else if (phase === 'final') finalReview();
});
function stop() {
  if (saving) return;
  cancelAudio();
  if (original !== null) fields[index].value = original;
  original = null;
  phase = 'idle';
  guided = false;
  controls();
  voiceStatus.textContent = 'Voice stopped. Confirmed answers remain in the form; the unconfirmed answer was discarded. You can edit the form or start a question again.';
}
stopButton.addEventListener('click', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden && phase !== 'idle') stop(); });
window.addEventListener('pagehide', cancelAudio);
form.addEventListener('submit', event => { event.preventDefault(); if (phase === 'idle') finalReview(); });
setDate();
controls();
voiceStatus.textContent = supported
  ? 'Ready. Select Start guided voice form. Today’s date is filled automatically; edit it before starting if needed.'
  : 'Guided speech is unavailable in this browser. Try Chrome with microphone access, or type answers and use the on-screen save confirmation.';
