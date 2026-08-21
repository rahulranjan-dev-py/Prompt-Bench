// Verifies the main process's runtime assumptions about @anthropic-ai/sdk.
//
// electron/main.js resolves the client class through `.default ?? module`
// (the SDK ships dual ESM/CJS builds) and does `err instanceof
// Anthropic.AuthenticationError` inside its catch block. If a future SDK
// version changes either, the failure is ugly and late: a TypeError thrown
// from inside an error handler, only on the unhappy path, only at runtime.
// `vite build` cannot catch this because it never touches electron/.
//
// Run locally with: node scripts/check-main.cjs
const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.default ?? sdk;

const failures = [];

if (typeof Anthropic !== 'function') {
  failures.push('@anthropic-ai/sdk did not resolve to a constructor via `.default ?? module`.');
}

// Every error class electron/main.js branches on.
for (const name of ['AuthenticationError', 'RateLimitError', 'BadRequestError']) {
  if (typeof Anthropic?.[name] !== 'function') {
    failures.push(`Anthropic.${name} is missing - electron/main.js references it in its catch block.`);
  }
}

try {
  const client = new Anthropic({ apiKey: 'placeholder-not-used' });
  if (typeof client.messages?.create !== 'function') {
    failures.push('client.messages.create is missing - the proxy in electron/main.js calls it.');
  }
} catch (err) {
  failures.push(`Constructing the client threw: ${err.message}`);
}

if (failures.length > 0) {
  console.error('Main-process checks FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('PASS  @anthropic-ai/sdk resolves and exposes every binding electron/main.js uses.');
