// Renderer for the settings window. Talks to the main process only through
// window.settingsAPI, exposed by settings-preload.js over contextBridge.
const $ = (id) => document.getElementById(id);

const HINTS = {
  anthropic: {
    provider: 'Keys from console.anthropic.com. Billed separately from a Claude subscription, so Pro or Max does not cover it.',
    model: 'Leave blank to use whatever the app requests.',
  },
  groq: {
    provider: 'Free key from console.groq.com, no card required.',
    model: 'Press Load models to list what this key can actually use - the default may not be available on every plan.',
  },
  gemini: {
    provider: 'Free key from aistudio.google.com/apikey. Note Google\u2019s free tier may use your prompts to improve its products; the paid tiers do not.',
    model: 'Press Load models to list what this key can actually use.',
  },
};

let defaults = {};

function applyHints() {
  const p = $('provider').value;
  $('providerHint').textContent = HINTS[p].provider;
  $('modelHint').textContent = HINTS[p].model;
  $('model').placeholder = defaults[p] || 'provider default';
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
}

(async () => {
  const cfg = await window.settingsAPI.load();
  defaults = cfg.defaults || {};
  $('provider').value = cfg.provider || 'anthropic';
  $('apiKey').value = cfg.apiKey || '';
  $('model').value = cfg.model || '';
  $('path').textContent = cfg.path;
  applyHints();
  $('apiKey').focus();
})();

$('provider').addEventListener('change', applyHints);

$('save').addEventListener('click', async () => {
  const key = $('apiKey').value.trim();
  if (!key) return setStatus('Paste a key first, or press Remove key.', 'err');

  setStatus('Saving…');
  const res = await window.settingsAPI.save({
    provider: $('provider').value,
    apiKey: key,
    model: $('model').value.trim(),
  });

  // The main window reloads on success so the AI features appear straight
  // away - window.hasAI is resolved once per window load, so without a reload
  // the key would not take effect until the app was restarted.
  if (res.ok) setStatus('Saved. The main window has reloaded.', 'ok');
  else setStatus(res.error || 'Could not save.', 'err');
});

$('clear').addEventListener('click', async () => {
  const res = await window.settingsAPI.save({ provider: $('provider').value, apiKey: '', model: '' });
  if (res.ok) { $('apiKey').value = ''; setStatus('Key removed. The AI features are hidden again.', 'ok'); }
  else setStatus(res.error || 'Could not save.', 'err');
});

// Guessing a model id is what made a wrong default painful, so this asks the
// provider what the key is entitled to rather than anyone assuming.
$('loadModels').addEventListener('click', async () => {
  const btn = $('loadModels');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  setStatus('Asking the provider which models this key can use…');

  const res = await window.settingsAPI.models({
    provider: $('provider').value,
    apiKey: $('apiKey').value.trim(),
  });

  btn.disabled = false;
  btn.textContent = 'Load models';

  if (!res.ok) return setStatus(res.error || 'Could not list models.', 'err');

  const list = $('modelList');
  list.innerHTML = '';
  for (const id of res.models) {
    const opt = document.createElement('option');
    opt.value = id;
    list.appendChild(opt);
  }
  // Prefill only if empty, so a deliberate choice is never overwritten.
  if (!$('model').value.trim()) $('model').value = res.models[0];
  $('model').focus();
  setStatus(`${res.models.length} models available. Click the field to pick one.`, 'ok');
});

$('cancel').addEventListener('click', () => window.settingsAPI.close());
