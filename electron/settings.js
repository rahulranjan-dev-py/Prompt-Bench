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
    model: 'Leave blank for the default. Groq retires models regularly - current ids are listed at api.groq.com/openai/v1/models.',
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

$('cancel').addEventListener('click', () => window.settingsAPI.close());
