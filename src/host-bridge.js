// Reproduces the one Artifacts-runtime behaviour that contextBridge cannot:
// an authenticated fetch() to the Anthropic API.
//
// Why this lives in the renderer and not in preload.js:
// with contextIsolation enabled, preload runs in a separate JavaScript world.
// Patching window.fetch there would patch preload's fetch, and the React app
// would keep using its own untouched copy. contextBridge can hand objects
// across that boundary (which is how window.storage and window.electronAPI
// arrive), but it cannot replace a global the page already owns. So the patch
// has to be applied from inside the renderer world - here.
//
// Imported for its side effect at the top of src/main.jsx, before React
// mounts, so the shim is in place before PromptBench can call fetch().

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

if (typeof window !== 'undefined' && window.electronAPI) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));

    // Anything that is not the messages endpoint is passed straight through
    // untouched - this shim must not become a general network interceptor.
    if (!url.startsWith(ANTHROPIC_ENDPOINT)) {
      return originalFetch(input, init);
    }

    const body = JSON.parse(init?.body ?? '{}');
    const result = await window.electronAPI.sendMessages(body);

    // PromptBench does `if (!res.ok) throw` then `await res.json()`, so the
    // return value only has to satisfy those two. Returning a real Response
    // would mean re-serialising for no benefit.
    return {
      ok: result.ok,
      status: result.status,
      json: async () => (result.ok ? result.data : { error: result.error }),
    };
  };
} else if (typeof window !== 'undefined') {
  // Reached in browser-only mode (npm run dev:web), where there is no main
  // process to hold the API key. Everything except Run still works.
  console.warn(
    '[Prompt-Bench] Running outside Electron: no API key is available, so ' +
      'Run will fail. Use `npm run dev` for the full desktop app.'
  );
}
