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
| `window.storage.get/set` | host storage API | `electron/preload.js` → IPC → `%APPDATA%\prompt-bench\storage.json` |
| `fetch('https://api.anthropic.com/v1/messages')` with **no auth header** | credentials injected by the host | `src/host-bridge.js` → IPC → `@anthropic-ai/sdk` in the main process |

The Electron shell **emulates that host environment**, so the component needed
almost nothing changed. Three consequences worth knowing:

- **Your API key never enters the renderer.** The request is made from the main
  process, so the key cannot be extracted from the packaged app or read in
  DevTools. The renderer's CSP is `connect-src 'self'` because it needs no
  outbound network access at all.
- **Your prompt library persists.** In a plain browser `window.storage` is
  undefined and the component shows "Saving isn't available in this window".
- **The app works without an API key.** See below.

### The app is standalone; AI is optional

Only two features need the Anthropic API — *"Turn this into a prompt"* and
*"Sharpen with AI"*. Everything else is local computation: the eleven
structures, filling slots, text carrying over between structures, assembling
the prompt, the XML mode, copying, and the saved library. The app's own tagline
— *pick a structure, fill the slots, copy the prompt* — describes a loop that
never touches the network.

So the two AI features are **shown only when a key is configured**. With no key
the app installs and works with zero setup, rather than offering buttons that
fail when pressed. `window.hasAI` carries that decision, resolved by the shell
before the page paints and mirroring the `!!window.storage` check the component
already used to decide whether saving exists.

### How far it diverges from the Artifacts original

Four small edits, all of the same kind: one `hasAI` constant, and three
`{hasAI && (…)}` wrappers around the AI button, the mode switcher, and one line
of help text. Nothing else was touched, so re-exporting the component from
Artifacts and diffing it stays a small, readable job.

---

## Project layout

```
Prompt-Bench/
├─ package.json          npm scripts, dependencies, electron-builder config
├─ vite.config.js        React plugin; base:'./' (required for file:// loads)
├─ index.html            Vite HTML entry; mounts #root
├─ electron/
│  ├─ main.js            windows, menu, storage IPC, provider proxy, CSP
│  ├─ providers.js       Groq <-> Anthropic request/response translation
│  ├─ preload.js         contextBridge: exposes window.storage + electronAPI
│  ├─ settings.html      the API-key window (shell-owned, not part of the app)
│  ├─ settings.js        its renderer
│  └─ settings-preload.js  its own narrow contextBridge surface
├─ src/
│  ├─ main.jsx           React entry; mounts <App/>
│  ├─ host-bridge.js     patches window.fetch → IPC (must be renderer-side)
│  ├─ App.jsx            shell; renders <PromptBench/>
│  ├─ PromptBench.jsx    the workbench component (4 small gating edits)
│  └─ styles.css         minimal reset only
├─ build/
│  ├─ icon.ico           app + installer icon, embedded by electron-builder
│  └─ icon-master.png    1024px source the .ico is generated from
├─ scripts/
│  ├─ check-main.cjs     asserts the SDK bindings electron/main.js relies on
│  ├─ check-providers.cjs asserts the Groq translation matches what the component parses
│  ├─ check-build.mjs    asserts dist/ asset paths are relative
│  ├─ smoke.cjs          launches the real app and asserts the wiring
│  ├─ make-icon.py       regenerates icon.ico (manual; needs Pillow)
│  └─ zip-installer.mjs  wraps the installer in a .zip during `npm run dist`
└─ .github/workflows/
   ├─ ci.yml             Windows CI across Node 22 and 24
   └─ release.yml        builds + publishes a Release on a v* tag
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
npm install
```

`npm install` fetches the Electron binary (~150 MB), so give it a minute.

**3. Launch the app**

```powershell
npm run dev
```

A desktop window opens with DevTools detached alongside it. **No API key is
needed to get this far** — the app runs, prompts compose, and the library saves
to disk. Only the control that calls Claude needs one.

**4. Set your Anthropic API key** — only for the Claude call

```powershell
setx ANTHROPIC_API_KEY "sk-ant-your-key-here"
```

> This is the step that catches people out. `setx` saves the variable
> permanently but only applies it to **newly opened** terminals — the window you
> type it into will not see it. Close it, open a new PowerShell, `cd
> Prompt-Bench`, and run `npm run dev` again. Skip this entirely and the app
> still runs; only the Claude call fails.

**Or set it inside the app** — the easiest route, and the only one that needs no
file editing at all:

> **File → API key…** (or `Ctrl+,`)

Pick a provider, paste the key, press *Save and reload*. The main window reloads
and the AI features appear immediately. *Remove key* takes them away again.

The window writes `%APPDATA%\prompt-bench\config.json`, and shows you that path,
so the file route stays available:

```json
{ "apiKey": "sk-ant-your-key-here" }
```

Note the folder is lowercase `prompt-bench`: the packaged app's bundled
`package.json` carries no `productName`, so Electron's `app.getName()` returns
the `name` field. Windows paths are case-insensitive, so either spelling
navigates there, but that is the real name on disk.

### Using Groq instead of Anthropic

Groq has a free tier and, unlike some free tiers, states it does not train on
API inputs or outputs. Set `provider`:

```json
{
  "provider": "groq",
  "apiKey": "gsk_your-key-here",
  "model": "openai/gpt-oss-120b"
}
```

`model` is optional but worth setting: **Groq retires models regularly** — the
obvious guess, `llama-3.3-70b-versatile`, is already deprecated. List currently
active ids at `https://api.groq.com/openai/v1/models`, and if a model has been
retired Groq's own error text is passed through verbatim so you can see which.

`electron/providers.js` translates between Groq's OpenAI-style dialect and the
Anthropic shape the component parses, so `PromptBench.jsx` never learns which
provider answered.

`config.json` takes precedence over environment variables. That inverts the
earlier rule deliberately: otherwise a stale `ANTHROPIC_API_KEY` left in the
environment would silently override an explicit `"provider": "groq"`.

> **Untested against the live API.** `api.groq.com` was unreachable from the
> environment this was built in, so the Groq path has never completed a real
> request. Routing, translation and error handling are verified
> (`scripts/check-providers.cjs`, and the app demonstrably sends its request to
> Groq rather than Anthropic) — but the first successful Groq completion will be
> yours.

An environment variable is the wrong mechanism for an app launched from a
shortcut: it inherits Explorer's *cached* environment, so `setx` frequently
doesn't reach it until you sign out and back in — and there's no terminal in
which to notice. The config file has no such problem, and is re-read on every
request, so editing it takes effect without restarting.

`ANTHROPIC_API_KEY` wins if both are set. Keys come from
[console.anthropic.com](https://console.anthropic.com) — API access is billed
separately from a Claude subscription, so Pro or Max does not cover it.

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
| API bridge | Compose a prompt and press the run/test control (needs step 4) | Main-process proxy + your API key |

If saving shows *"Saving isn't available in this window"*, the preload script
did not load — check the DevTools console for a preload error.

If the API call fails, the component shows one generic message — *"That didn't
come back cleanly"* — for every cause: no key, a rejected key, a rate limit, or
a genuinely unparseable reply. The real reason is reported in three places:

- a **dialog**, for credential problems specifically, since an installed app has
  no console and this is a setup error worth interrupting for;
- the **DevTools console** (`Ctrl+Shift+I`) — `[Prompt-Bench] Claude request
  failed (401): …`;
- the **terminal**, when running from source.

To interrogate it directly, run this in the DevTools console:

```js
await window.electronAPI.sendMessages({model:"claude-sonnet-4-6",max_tokens:16,
  messages:[{role:"user",content:"hi"}]})
```

That bypasses the component entirely and returns the unfiltered result.

---

## Other commands

```powershell
npm run dev:web    # browser-only at http://localhost:5173 (no saving, no API key)
npm run start      # production smoke test: build + load dist/ over file://
npm run dist       # build a Windows .exe installer into release/
```

`npm run dist` produces three things in `release/`, and needs a Windows
toolchain — run it on Windows, or let the release workflow below do it for you:

| File | What it is |
|---|---|
| `Prompt-Bench Setup <version>.exe` | the NSIS installer (~79 MB) |
| `Prompt-Bench-<version>-Setup.zip` | that installer, zipped |
| `Prompt-Bench-<version>-win.zip` | the portable app (~108 MB) |

**Only the two zips are published.** A bare `.exe` download is blocked or
heavily warned about by browsers and Windows; an archive is not. `scripts/zip-installer.mjs`
does the wrapping, and runs as part of `npm run dist` rather than from the
release workflow — a step that only ever executes during a real release is a
step nobody finds out is broken until a release is in flight.

> **Unsigned.** No code-signing certificate is configured, so Windows SmartScreen
> shows "Windows protected your PC" on first run — choose *More info → Run
> anyway*. To sign it, set `win.certificateFile` in `package.json`.

The icon in `build/icon.ico` is embedded in both the executable and the
installer. It is generated, not hand-drawn — `scripts/make-icon.py` builds all
seven sizes (16 → 256) from one master, using the palette declared in
`PromptBench.jsx` itself: `--signal` for the ground, `--panel` and `--live` for
the three slots. To change it, edit that script and re-run it:

```powershell
pip install Pillow
python3 scripts/make-icon.py
```

It is not part of `npm run dist` — the committed `.ico` is what builds use.

---

## Releases

Two downloads on the [Releases page](../../releases), both archives:

- **`...-Setup.zip`** — unzip, run Setup. Installs with a Start menu entry,
  desktop shortcut and uninstaller.
- **`...-win.zip`** — unzip anywhere and run `Prompt-Bench.exe`. Nothing is
  installed; runs from a USB stick.

Your saved library lives in `%APPDATA%\prompt-bench` either way, so the two
share state if you use both.

`.github/workflows/release.yml` does the work. First bump the version — the
installer filename and its embedded metadata both follow `package.json`:

```powershell
npm version 0.2.0 --no-git-tag-version
git commit -am "Release v0.2.0"
git push
```

Then trigger it, either way:

**From the browser.** Actions → *Release* → **Run workflow**, and type the tag
(`v0.2.0`). No local git needed at all — the workflow creates the tag itself,
pointing at the commit it ran from.

**Or by pushing a tag.**

```powershell
git tag v0.2.0
git push origin v0.2.0
```

Either path builds on **windows-latest** — natively, with the real toolchain
rather than under Wine — re-runs the main-process checks, and publishes a Release
with the installer attached.

Three things make it refuse rather than ship something wrong:

- the tag must look like `v1.2.3`
- the tag must match the `package.json` version, so a `v0.2.0` release can never
  ship a `0.1.0` installer — a mismatch nobody can see once the file is downloaded
- the release must not already exist, checked before building rather than after

---

## Code signing

Releases are **unsigned by default**, and the release workflow signs only when
credentials are configured — with none set it produces exactly the unsigned
build it always has, so nothing breaks while you decide.

### What to buy, and what not to

**Buy [Azure Artifact Signing](https://azure.microsoft.com/en-us/products/artifact-signing)**
(formerly Trusted Signing) — $9.99/month for up to 5,000 signatures. It is
cloud-based, so it works from CI with no hardware attached to anything.

**Do not buy a traditional OV certificate expecting to use it here.** Since June
2023 the CA/Browser Forum requires OV private keys to live on a hardware token
or HSM, so the old "put a `.pfx` in a secret" approach is not available for a
newly issued certificate — the key physically cannot leave the token.

**Do not pay extra for EV.** Since March 2024 EV no longer grants instant
SmartScreen trust; EV and OV now build reputation the same way, through download
volume. The premium buys nothing you need.

Note that signing does **not** remove the SmartScreen warning immediately.
Reputation accrues per publisher as downloads accumulate — signing is what lets
that reputation start building at all.

### Configuring it

Set six repository secrets (*Settings → Secrets and variables → Actions*). Three
are genuinely secret; the rest identify your signing account:

| Secret | What it is |
|---|---|
| `AZURE_TENANT_ID` | Entra ID tenant of the service principal |
| `AZURE_CLIENT_ID` | The service principal |
| `AZURE_CLIENT_SECRET` | Its secret |
| `AZURE_SIGN_ENDPOINT` | e.g. `https://eus.codesigning.azure.net` — must match your account's region |
| `AZURE_SIGN_ACCOUNT` | Code signing account name |
| `AZURE_SIGN_PROFILE` | Certificate profile name |

The next release then signs automatically, reports the signature status in the
log, and gets release notes that no longer describe it as unsigned. If signing
was configured but did not take, the release **fails** rather than publishing
something advertised as signed that is not.

Setup requires business verification with Microsoft, which takes time — start it
before you need it.

### Two caveats

- electron-builder marks Azure signing **beta** in the version pinned here.
- The signed path **cannot be exercised from a Linux machine.** electron-builder
  shells out to Windows signing tools and, on a Linux host, looks for a Parallels
  VM (`spawn prlctl ENOENT`). The config parses and the Azure path is entered —
  that much is verified — but producing a signed artifact requires a Windows
  host, which is what the release workflow uses.

---

## CI

`.github/workflows/ci.yml` runs on every PR into `main` and every push to it, on **windows-latest** —
the platform this app actually targets, which also exercises the README's own
install path under PowerShell.

It runs against **Node 22 and 24**: 22 is the supported floor above, and 24 is
Active LTS, which is what step 1's `winget install OpenJS.NodeJS.LTS` installs
today. Node 20 is not tested — it reached end-of-life on 2026-03-24.

It covers a gap `vite build` cannot: the build never reads `electron/`, so a
syntax error or a broken SDK binding in the main process would ship undetected.

A second job packages the app — `npm run dist` on Node 24, the version
`release.yml` ships from. Packaging behaves differently under CI than it does
locally (electron-builder auto-publishes when it detects a CI environment), so
this is the only place that difference surfaces before a real release. It also
asserts `release/*.exe` matches exactly one file, because the release workflow
uploads whatever that glob returns.

Run the same checks locally:

```powershell
node --check electron/main.js
node --check electron/preload.js
node scripts/check-main.cjs    # SDK bindings electron/main.js depends on
node scripts/check-providers.cjs # Groq <-> Anthropic translation
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
