// End-to-end smoke test for the Electron shell.
//
// Run with:  npx electron scripts/smoke.cjs
//
// This file IS the Electron main process. It pushes --prod, then requires the
// real electron/main.js, so the app under test is the shipped one: the real
// window options, the real preload, the real IPC handlers and the real
// production CSP. Nothing here re-implements any of that, so the test cannot
// drift away from what actually runs.
//
// Deliberately not driven over the DevTools protocol: that needs a WebSocket
// client (not a global before Node 22), a debugging port, target polling and
// process-tree cleanup. Running inside Electron needs none of it, and
// executeJavaScript reaches the page world where contextBridge puts things.
//
// Requires `npm run build` first, since --prod loads dist/ over file://.
// On Linux, run it under xvfb. Windows and macOS need no display setup.

const { app, BrowserWindow } = require('electron');

// main.js reads process.argv at module load, so this must precede the require.
process.argv.push('--prod');
require('../electron/main.js');

const TIMEOUT_MS = 60_000;

// Assertions run in the renderer's page world. Each is [label, expression,
// expected]. Anything async is awaited by executeJavaScript.
const CHECKS = [
  ['window.storage exposed', `typeof window.storage`, 'object'],
  ['storage.get is a function', `typeof window.storage.get`, 'function'],
  ['storage.set is a function', `typeof window.storage.set`, 'function'],
  ['electronAPI.sendMessages exposed', `typeof window.electronAPI.sendMessages`, 'function'],
  ['window.fetch was patched', `window.fetch.toString().includes('native code') === false`, true],
  ['PromptBench root rendered', `!!document.querySelector('.pb')`, true],
  ['PromptBench rendered content', `document.querySelector('.pb').innerText.length > 200`, true],
  [
    'storage round-trips to disk',
    `(async () => {
       await window.storage.set('smoke:test', 'it-persisted', false);
       const r = await window.storage.get('smoke:test', false);
       return r && r.value;
     })()`,
    'it-persisted',
  ],
  [
    'library key is readable',
    `(async () => {
       const r = await window.storage.get('bench:library', false);
       return r === null ? 'NULL_RESULT' : typeof r;
     })()`,
    'object',
  ],
  [
    // No API key in CI, so the deterministic assertion is that the proxy is
    // reachable over IPC and fails for the right reason rather than hanging
    // or throwing. This needs no secret and is stable on every runner.
    'proxy reports a missing key correctly',
    `(async () => {
       const r = await window.electronAPI.sendMessages({
         model: 'claude-sonnet-4-6',
         max_tokens: 16,
         messages: [{ role: 'user', content: 'ping' }],
       });
       return [r.ok, r.status, /ANTHROPIC_API_KEY/.test(r.error || '')].join('|');
     })()`,
    'false|401|true',
  ],
];

const cspViolations = [];

function finish(code) {
  // app.exit skips the graceful-shutdown path, so a lingering handle in the
  // renderer cannot leave CI hanging until the job timeout.
  app.exit(code);
}

const failTimer = setTimeout(() => {
  console.error(`\nFAIL  window did not finish loading within ${TIMEOUT_MS}ms`);
  finish(1);
}, TIMEOUT_MS);

app.on('browser-window-created', (_event, win) => {
  // A strict CSP that silently blocks the app's own stylesheet or script would
  // otherwise still pass every assertion below.
  win.webContents.on('console-message', (_e, _level, message) => {
    if (/refused to|content security policy/i.test(message)) cspViolations.push(message);
  });

  win.webContents.once('did-finish-load', async () => {
    clearTimeout(failTimer);
    let failed = 0;

    try {
      for (const [label, expression, expected] of CHECKS) {
        let actual;
        try {
          actual = await win.webContents.executeJavaScript(expression);
        } catch (err) {
          actual = `THREW: ${err.message}`;
        }
        const ok = actual === expected;
        if (!ok) failed++;
        console.log(
          `${ok ? 'PASS' : 'FAIL'}  ${label}` +
            (ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
        );
      }

      if (cspViolations.length > 0) {
        failed++;
        console.log('FAIL  CSP blocked resources the app needs:');
        for (const v of cspViolations) console.log(`        ${v}`);
      } else {
        console.log('PASS  no CSP violations');
      }
    } catch (err) {
      console.error(`FAIL  smoke test threw: ${err.stack || err.message}`);
      failed++;
    }

    console.log(failed === 0 ? '\nSmoke test PASSED' : `\nSmoke test FAILED (${failed})`);
    finish(failed === 0 ? 0 : 1);
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    clearTimeout(failTimer);
    console.error(`FAIL  window failed to load ${url} (${code} ${desc})`);
    finish(1);
  });
});

// main.js calls app.quit() when the single-instance lock is already held. That
// would otherwise look like a silent pass instead of a test that never ran.
app.on('will-quit', (event) => {
  if (BrowserWindow.getAllWindows().length === 0) {
    event.preventDefault();
    console.error('FAIL  app quit before creating a window (single-instance lock held?)');
    finish(1);
  }
});
