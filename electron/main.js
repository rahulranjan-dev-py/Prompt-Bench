// Electron main process. CommonJS on purpose: package.json has no
// "type": "module", so .js here is CJS, which is what Electron's own docs use.
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

// The SDK ships dual ESM/CJS builds; depending on the version the client class
// is either the module itself or hangs off .default. This covers both.
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

// Checked in order. The environment variable wins, so a developer running from
// a terminal can override. The config file exists because an environment
// variable is the wrong mechanism for an installed app: a packaged app launched
// from a shortcut inherits Explorer's cached environment, so `setx` often does
// not reach it until the user signs out and back in - and there is no terminal
// in which to notice. Read per request, so editing the file takes effect
// without restarting the app.
async function readApiKey() {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'the ANTHROPIC_API_KEY environment variable' };

  try {
    const cfg = JSON.parse(await fs.readFile(configFile(), 'utf8'));
    const fromFile = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
    if (fromFile) return { key: fromFile, source: configFile() };
  } catch {
    // Absent, unreadable or malformed - indistinguishable from "not configured"
    // as far as the caller is concerned, and reported as such below.
  }

  return { key: null, source: null };
}

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

ipcMain.handle('anthropic:messages', async (_event, body) => {
  const { key, source } = await readApiKey();

  if (!key) {
    reportCredentialProblem('No Anthropic API key found.');
    return {
      ok: false,
      status: 401,
      error:
        'No Anthropic API key found. Set ANTHROPIC_API_KEY, or create ' +
        `${configFile()} containing {"apiKey":"sk-ant-..."}.`,
    };
  }

  try {
    // body is forwarded verbatim from the renderer, so the model, max_tokens
    // and messages chosen inside PromptBench.jsx are what get sent. The SDK
    // adds x-api-key and anthropic-version, which the original fetch lacked.
    const message = await getClient(key).messages.create(body);
    // Returned as-is: this is the same shape the raw endpoint returns, so
    // PromptBench's own .content / .stop_reason parsing works untouched.
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
    console.error('[Prompt-Bench] Anthropic request failed:', reason);
    return { ok: false, status: err?.status ?? 500, error: reason };
  }
});

/* ------------------------------------------------------------------ */
/*  Window                                                             */
/* ------------------------------------------------------------------ */

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,                 // revealed on ready-to-show to avoid a white flash
    backgroundColor: '#E4E6E1',  // PromptBench's --panel colour
    autoHideMenuBar: true,       // hides the default Windows menu bar; Alt reveals it
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,    // renderer and preload get separate JS worlds
      nodeIntegration: false,    // your .jsx never gets Node privileges
      sandbox: true,             // OS-level renderer sandbox; contextBridge still works
    },
  });

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

    createWindow();
  });

  // Windows-only target, so there is no macOS 'activate' branch to handle.
  app.on('window-all-closed', () => app.quit());
}
