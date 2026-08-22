// Electron main process. CommonJS on purpose: package.json has no
// "type": "module", so .js here is CJS, which is what Electron's own docs use.
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// The SDK ships dual ESM/CJS builds; depending on the version the client class
// is either the module itself or hangs off .default. This covers both.
const providers = require('./providers.js');

const anthropicSdk = require('@anthropic-ai/sdk');
const Anthropic = anthropicSdk.default ?? anthropicSdk;

// vite.config.js pins this port with strictPort, so it is safe to hardcode.
const DEV_SERVER_URL = 'http://localhost:5173';

// app.isPackaged is false when running from source and true inside a built app,
// which avoids needing cross-env to set NODE_ENV (awkward on Windows).
//
// The --prod flag exists because `electron .` run from source is ALWAYS
// unpackaged, so without it `npm run start` would quietly load the dev server
// instead of dist/ and you could never test the file:// path before packaging.
// A CLI flag rather than an env var keeps this working in PowerShell and cmd
// without adding a cross-env dependency.
const forceProd = process.argv.includes('--prod');
const isDev = !app.isPackaged && !forceProd;

/* ------------------------------------------------------------------ */
/*  window.storage — the persistence API PromptBench.jsx expects.      */
/*                                                                     */
/*  The component was written for Claude Artifacts, whose runtime      */
/*  provides window.storage.get/set. Outside that runtime the          */
/*  component degrades to "Saving isn't available in this window".     */
/*  Implementing the same shape here is what makes the desktop app     */
/*  actually persist your prompt library.                             */
/* ------------------------------------------------------------------ */

// On Windows this resolves to %APPDATA%\Prompt-Bench\storage.json, which
// survives app updates and uninstalls cleanly.
const storeFile = () => path.join(app.getPath('userData'), 'storage.json');

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(storeFile(), 'utf8'));
  } catch {
    return {}; // first run, or the file was removed
  }
}

async function writeStore(data) {
  // Write to a temp file then rename. Renaming is atomic, so a crash midway
  // through can never leave a half-written library on disk.
  const target = storeFile();
  const tmp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

// isGlobal is part of the Artifacts signature. A desktop app has a single
// local user, but namespacing keeps the two scopes from colliding.
const scopedKey = (key, isGlobal) => `${isGlobal ? 'global' : 'user'}:${key}`;

ipcMain.handle('storage:get', async (_event, key, isGlobal) => {
  const store = await readStore();
  // PromptBench reads r?.value, so the { value } wrapper is required.
  return { value: store[scopedKey(key, isGlobal)] ?? null };
});

ipcMain.handle('storage:set', async (_event, key, value, isGlobal) => {
  const store = await readStore();
  store[scopedKey(key, isGlobal)] = value;
  await writeStore(store);
  return true;
});

/* ------------------------------------------------------------------ */
/*  /v1/messages proxy                                                 */
/*                                                                     */
/*  PromptBench.jsx calls the Anthropic API with only a Content-Type    */
/*  header, because the Artifacts runtime injects credentials for it.   */
/*  Two reasons that call is proxied through the main process here:     */
/*    1. Security. The API key never enters the renderer bundle, so it  */
/*       cannot be read out of the packaged app's asar or DevTools.     */
/*    2. It works. The main process is Node, so there is no CORS        */
/*       preflight and the renderer's CSP stays connect-src 'self'.     */
/* ------------------------------------------------------------------ */

// Where an installed app is told to put its key. On Windows this resolves to
// %APPDATA%\Prompt-Bench\config.json.
const configFile = () => path.join(app.getPath('userData'), 'config.json');

// The config file exists because an environment variable is the wrong mechanism
// for an installed app: a packaged app launched from a shortcut inherits
// Explorer's cached environment, so `setx` often does not reach it until the
// user signs out and back in - and there is no terminal in which to notice.
//
// Synchronous on purpose. The renderer needs to know whether AI is available
// *before* it paints, so the features requiring it are never offered when they
// cannot work, and a synchronous answer is what lets preload hand the page a
// plain boolean instead of a promise the component would have to model. The
// file is a few dozen bytes; reading it per call costs nothing, and means
// editing it takes effect without restarting.
function readConfig() {
  try {
    const cfg = JSON.parse(fsSync.readFileSync(configFile(), 'utf8'));
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    // Absent, unreadable or malformed - indistinguishable from "not configured"
    // as far as every caller is concerned, and reported as such below.
    return {};
  }
}

// config.json wins over the environment. That inverts the precedence used
// before Groq support existed, and deliberately: with the old rule a stale
// ANTHROPIC_API_KEY left in the environment would silently override an explicit
// choice of provider in config.json, which is a trap with no upside. An
// explicit file beats an ambient variable.
function resolveCredentials() {
  const cfg = readConfig();

  const provider = providers.PROVIDERS.includes(String(cfg.provider).toLowerCase())
    ? String(cfg.provider).toLowerCase()
    : process.env.ANTHROPIC_API_KEY?.trim() ? 'anthropic'
    : process.env.GROQ_API_KEY?.trim() ? 'groq'
    : 'anthropic';

  const envName = provider === 'groq' ? 'GROQ_API_KEY' : 'ANTHROPIC_API_KEY';
  const fromFile = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
  const fromEnv = process.env[envName]?.trim() || '';

  const key = fromFile || fromEnv || null;
  const source = fromFile ? configFile()
    : fromEnv ? `the ${envName} environment variable`
    : null;

  const model = typeof cfg.model === 'string' && cfg.model.trim()
    ? cfg.model.trim()
    : providers.DEFAULT_MODEL[provider];

  return { provider, key, source, model, envName };
}

// Answers "should the AI features exist at all?". Sync so preload can resolve it
// before the page loads. Evaluated once per window, so adding a key takes effect
// on the next launch rather than mid-session.
ipcMain.on('ai:available', (event) => {
  event.returnValue = !!resolveCredentials().key;
});

let client = null;
let clientKey = null;
function getClient(apiKey) {
  // Rebuilt when the key changes, so editing config.json mid-session is picked
  // up instead of being masked by a cached client.
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

// A packaged app has no console, so a credential problem would otherwise be
// invisible: PromptBench.jsx discards the reason (`throw new Error("request
// failed")`) and shows one generic message for every failure. A native dialog
// is the only place an installed user will actually see this.
//
// Suppressed under --no-dialogs so the smoke test cannot hang on a modal that
// nothing is there to dismiss.
const suppressDialogs = process.argv.includes('--no-dialogs');
let credentialDialogShown = false;

function reportCredentialProblem(message) {
  console.error(`[Prompt-Bench] ${message}`);
  if (suppressDialogs || credentialDialogShown) return;
  credentialDialogShown = true; // once per session; the button is easy to re-press

  const [win] = BrowserWindow.getAllWindows();
  const options = {
    type: 'warning',
    title: 'Prompt-Bench needs an API key',
    message,
    detail:
      `Create this file:\n\n${configFile()}\n\ncontaining:\n\n{ "apiKey": "sk-ant-..." }\n\n` +
      'Then press the button again - no restart needed.\n\n' +
      'Keys come from console.anthropic.com. API access is billed separately ' +
      'from a Claude subscription, so a Pro or Max plan does not cover it.',
    buttons: ['OK'],
  };
  // Not awaited: the reply is irrelevant and blocking here would stall the IPC
  // handler the renderer is waiting on.
  if (win) dialog.showMessageBox(win, options);
  else dialog.showMessageBox(options);
}

// Groq speaks the OpenAI chat-completions dialect, so both the request and the
// response are translated in electron/providers.js. Raw fetch rather than an
// SDK: the shape is small and stable, and a second SDK would be a dependency
// carried for one HTTP call.
async function callGroq(body, key, model) {
  const res = await fetch(providers.GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(providers.toGroqRequest(body, model)),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const error = providers.groqErrorMessage(json, res.status);
    return { ok: false, status: res.status, error };
  }

  // Translated into the Anthropic shape, so PromptBench's own parsing works
  // untouched and never learns which provider answered.
  return { ok: true, status: 200, data: providers.fromGroqResponse(json) };
}

async function callAnthropic(body, key, source) {
  try {
    // body is forwarded verbatim, so the model, max_tokens and messages chosen
    // inside PromptBench.jsx are what get sent. The SDK adds x-api-key and
    // anthropic-version, which the component's original fetch lacked.
    const message = await getClient(key).messages.create(body);
    // Returned as-is: already the shape the component parses.
    return { ok: true, status: 200, data: message };
  } catch (err) {
    // Typed SDK errors, most specific first.
    let reason = err?.message ?? 'Unknown error';
    if (err instanceof Anthropic.AuthenticationError) {
      // Naming the source matters: "rejected" plus the wrong file is a much
      // shorter debugging path than "rejected" alone.
      reason = `API key rejected (loaded from ${source}).`;
      reportCredentialProblem(reason);
    } else if (err instanceof Anthropic.RateLimitError) {
      reason = 'Rate limited - wait and retry.';
    } else if (err instanceof Anthropic.BadRequestError) {
      reason = `Bad request: ${err.message}`;
    }
    return { ok: false, status: err?.status ?? 500, error: reason };
  }
}

// Channel name kept as 'anthropic:messages' rather than renamed: preload and
// src/host-bridge.js both reference it, and a rename buys nothing but a chance
// to break the bridge. What travels over it is provider-neutral either way.
ipcMain.handle('anthropic:messages', async (_event, body) => {
  const { provider, key, source, model, envName } = resolveCredentials();

  if (!key) {
    reportCredentialProblem(`No ${provider} API key found.`);
    return {
      ok: false,
      status: 401,
      error:
        `No ${provider} API key found. Set ${envName}, or create ${configFile()} ` +
        `containing {"provider":"${provider}","apiKey":"..."}.`,
    };
  }

  let result;
  try {
    result = provider === 'groq'
      ? await callGroq(body, key, model)
      : await callAnthropic(body, key, source);
  } catch (err) {
    // Network-level failure, which the SDK path handles internally but a bare
    // fetch does not - an unhandled throw here would reject the IPC call and
    // surface as an opaque renderer error rather than a readable message.
    result = { ok: false, status: 502, error: `Request failed: ${err?.message ?? err}` };
  }

  if (!result.ok) {
    // 401 from any provider is a credential problem, and the dialog is the only
    // place an installed user would ever see it.
    if (result.status === 401) reportCredentialProblem(`${result.error} (key loaded from ${source})`);
    console.error(`[Prompt-Bench] ${provider} request failed:`, result.error);
  }
  return result;
});

/* ------------------------------------------------------------------ */
/*  Settings window                                                    */
/*                                                                     */
/*  Owned entirely by the shell: src/PromptBench.jsx is not involved,   */
/*  so the component stays close to its Artifacts original. It exists   */
/*  because hiding the AI features when no key is configured also hid   */
/*  every hint that a key was possible - and the config path was only   */
/*  named in an error message the hidden features could not produce.    */
/* ------------------------------------------------------------------ */

let settingsWindow = null;

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 620,
    parent: mainWindow ?? undefined,
    modal: false,          // non-modal: the key often has to be fetched from a browser
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true, // the settings window has no menu of its own
    backgroundColor: '#E4E6E1',
    title: 'Prompt-Bench Settings',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

ipcMain.handle('settings:load', () => {
  const cfg = readConfig();
  const { provider } = resolveCredentials();
  return {
    provider,
    // Only ever the key from the file. An ANTHROPIC_API_KEY inherited from the
    // environment is not this window's to display or overwrite.
    apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : '',
    model: typeof cfg.model === 'string' ? cfg.model : '',
    path: configFile(),
    defaults: providers.DEFAULT_MODEL,
  };
});

ipcMain.handle('settings:save', async (_event, incoming) => {
  const provider = providers.PROVIDERS.includes(incoming?.provider) ? incoming.provider : 'anthropic';
  const apiKey = typeof incoming?.apiKey === 'string' ? incoming.apiKey.trim() : '';
  const model = typeof incoming?.model === 'string' ? incoming.model.trim() : '';

  // Merged into whatever is already there rather than replacing the file, so a
  // hand-added field nobody told this window about is not silently dropped.
  const cfg = { ...readConfig(), provider };
  if (apiKey) cfg.apiKey = apiKey; else delete cfg.apiKey;
  if (model) cfg.model = model; else delete cfg.model;

  try {
    await fs.mkdir(path.dirname(configFile()), { recursive: true });
    await fs.writeFile(configFile(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  } catch (err) {
    return { ok: false, error: `Could not write ${configFile()}: ${err.message}` };
  }

  // window.hasAI is resolved once per window load, so without reloading the
  // main window the key would not take effect until the app was restarted -
  // which is exactly the kind of silent nothing-happened this window exists
  // to eliminate.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  return { ok: true };
});

ipcMain.on('settings:close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'API key\u2026', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        // Kept reachable: the DevTools console is where the proxy reports why
        // a request failed.
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]));
}

/* ------------------------------------------------------------------ */
/*  Window                                                             */
/* ------------------------------------------------------------------ */

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,                 // revealed on ready-to-show to avoid a white flash
    backgroundColor: '#E4E6E1',  // PromptBench's --panel colour
    // Shown, not hidden behind Alt: the menu is the only place a user can
    // discover the API-key settings, and hiding it was the reason the config
    // file was undiscoverable in the first place.
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,    // renderer and preload get separate JS worlds
      nodeIntegration: false,    // your .jsx never gets Node privileges
      sandbox: true,             // OS-level renderer sandbox; contextBridge still works
    },
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  win.once('ready-to-show', () => win.show());

  // Send external links to the real browser rather than opening an
  // unsandboxed Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // file:// load - this is why vite.config.js must set base: './'.
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// A second launch of the installed .exe focuses the existing window instead of
// starting a rival instance with its own handle on storage.json.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // CSP is applied in production only: Vite's dev server needs an inline
    // React Fast Refresh script and a websocket, which a strict policy blocks.
    if (!isDev) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              [
                "default-src 'self'",
                "script-src 'self'",
                // PromptBench injects its stylesheet as an inline <style>, and
                // that stylesheet @imports a Google font.
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com data:",
                "img-src 'self' data:",
                // Deliberately 'self': the Anthropic call goes over IPC from the
                // main process, so the renderer needs no outbound network access.
                "connect-src 'self'",
              ].join('; '),
            ],
          },
        });
      });
    }

    buildMenu();
    createWindow();
  });

  // Windows-only target, so there is no macOS 'activate' branch to handle.
  app.on('window-all-closed', () => app.quit());
}
