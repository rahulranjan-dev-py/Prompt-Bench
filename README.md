# Prompt-Bench

A Windows 11 desktop app wrapping `PromptBench.jsx` — a prompt-engineering
workbench built around eleven prompt structures (RTF, TAG, RACE, CO-STAR,
CRISPE, RISEN and the rest).

Built with **Electron + React + Vite**.

---

## Why Electron, and what the shell actually does

`src/PromptBench.jsx` was written for **Claude Artifacts**, whose runtime
provides two things a plain browser does not:

| What the component calls | Artifacts provides | This app provides |
|---|---|---|
| `window.storage.get/set` | host storage API | `electron/preload.js` → IPC → `%APPDATA%\Prompt-Bench\storage.json` |
| `fetch('https://api.anthropic.com/v1/messages')` with **no auth header** | credentials injected by the host | `src/host-bridge.js` → IPC → `@anthropic-ai/sdk` in the main process |

The Electron shell **emulates that host environment**, which is why
`src/PromptBench.jsx` is byte-for-byte identical to the original file — it has
zero modifications. Two consequences worth knowing:

- **Your API key never enters the renderer.** The request is made from the main
  process, so the key cannot be extracted from the packaged app or read in
  DevTools. The renderer's CSP is `connect-src 'self'` because it needs no
  outbound network access at all.
- **Your prompt library persists.** In a plain browser `window.storage` is
  undefined and the component shows "Saving isn't available in this window".

---

## Project layout

```
Prompt-Bench/
├─ package.json          npm scripts, dependencies, electron-builder config
├─ vite.config.js        React plugin; base:'./' (required for file:// loads)
├─ index.html            Vite HTML entry; mounts #root
├─ electron/
│  ├─ main.js            window creation, storage IPC, Anthropic proxy, CSP
│  └─ preload.js         contextBridge: exposes window.storage + electronAPI
└─ src/
   ├─ main.jsx           React entry; mounts <App/>
   ├─ host-bridge.js     patches window.fetch → IPC (must be renderer-side)
   ├─ App.jsx            shell; renders <PromptBench/>
   ├─ PromptBench.jsx    YOUR FILE — unmodified
   └─ styles.css         minimal reset only
```

---

## Setup on Windows 11

Run these in **PowerShell**, in order.

**1. Install Node.js** (skip if `node -v` already prints v22 or higher)

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell afterwards so `node` is on your PATH.

**2. Get the code and install dependencies**

```powershell
git clone https://github.com/rahulranjan-dev-py/Prompt-Bench.git
cd Prompt-Bench
git checkout claude/windows-desktop-jsx-app-dapiej
npm install
```

**3. Set your Anthropic API key**

```powershell
setx ANTHROPIC_API_KEY "sk-ant-your-key-here"
```

> `setx` writes the variable permanently but only applies it to **newly opened**
> terminals. Close this PowerShell window and open a new one before step 4, or
> the app will report "ANTHROPIC_API_KEY is not set".

**4. Launch the app**

```powershell
npm run dev
```

A desktop window opens with DevTools detached alongside it.

---

## Verifying it works

You should see a desktop window titled **Prompt-Bench** showing a pale
grey-green workbench UI in the Archivo typeface, with a row of framework tabs
(RTF, TAG, RACE, …) and input slots that change as you switch between them.

Check each of these:

| Check | How | Confirms |
|---|---|---|
| React mounted | The framework tabs render and switching tabs changes the fields | `PromptBench.jsx` is rendering |
| Field carry-over | Type into **Role** under RTF, switch to RACE | Component state works |
| Storage bridge | Save a prompt to the library, fully close the app, reopen it — the prompt is still listed | `window.storage` → disk persistence |
| API bridge | Compose a prompt and press the run/test control | Main-process proxy + your API key |

If saving shows *"Saving isn't available in this window"*, the preload script
did not load — check the DevTools console for a preload error.

If the API call fails, look at the **PowerShell window**, not DevTools: the main
process logs the precise reason there (`[Prompt-Bench] Anthropic request
failed: …`), including whether the key was rejected or you were rate limited.

---

## Other commands

```powershell
npm run dev:web    # browser-only at http://localhost:5173 (no saving, no API key)
npm run start      # production smoke test: build + load dist/ over file://
npm run dist       # build a Windows .exe installer into release/
```

`npm run dist` must be run on Windows — building an NSIS installer needs Windows
tooling. The installer lands in `release/`.

---

## CI

`.github/workflows/ci.yml` runs on every PR into `main`, on **windows-latest** —
the platform this app actually targets, which also exercises the README's own
install path under PowerShell.

It runs against **Node 22 and 24**: 22 is the supported floor above, and 24 is
Active LTS, which is what step 1's `winget install OpenJS.NodeJS.LTS` installs
today. Node 20 is not tested — it reached end-of-life on 2026-03-24.

It covers a gap `vite build` cannot: the build never reads `electron/`, so a
syntax error or a broken SDK binding in the main process would ship undetected.

Run the same checks locally:

```powershell
node --check electron/main.js
node --check electron/preload.js
node scripts/check-main.cjs    # SDK bindings electron/main.js depends on
npm run build
node scripts/check-build.mjs   # asset paths must be relative for file://
npx electron scripts/smoke.cjs # launches the app and asserts the wiring
```

`scripts/check-build.mjs` guards the blank-window failure mode specifically: a
build can succeed and still emit absolute asset paths that resolve to the drive
root under `file://`, producing an empty window with nothing in the console.

`scripts/smoke.cjs` goes further and launches the real app. It pushes `--prod`
and requires the real `electron/main.js`, so what it exercises is the shipped
window, preload, IPC handlers and CSP rather than a re-implementation. It
asserts that `window.storage` and `window.electronAPI` cross the contextBridge,
that the `fetch` shim is installed, that the component actually rendered, that
storage round-trips to disk, and that a missing API key fails with a 401 rather
than hanging. It needs no API key.

A broken `contextBridge` does not stop the component rendering — it degrades to
"Saving isn't available in this window" — so this is the only check in the set
that would catch it.

> Run it after `npm run build`, since `--prod` loads `dist/`. On Linux, prefix
> it with `xvfb-run -a`; Windows needs no display setup.

## Notes

- **Model.** `PromptBench.jsx` requests `claude-sonnet-4-6`. The proxy forwards
  the request body verbatim, so changing the model string in that file is all it
  takes to switch models.
- **Fonts.** The component `@import`s Archivo and JetBrains Mono from Google
  Fonts, so first paint needs a network connection. To make the app fully
  offline, vendor the two font files into `src/` and replace the `@import`.
