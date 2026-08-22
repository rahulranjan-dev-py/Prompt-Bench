// Verifies the Groq <-> Anthropic translation in electron/providers.js.
//
// This exists because api.groq.com is unreachable from the environment this was
// written in, so the integration has never been exercised end to end. Fixtures
// cannot prove Groq accepts the request, but they can prove the translation
// matches the shape PromptBench.jsx parses - which is the half that is actually
// this repo's to get right.
//
// Run locally with: node scripts/check-providers.cjs
const fs = require('node:fs');
const path = require('node:path');
const P = require('../electron/providers.js');

const failures = [];
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) failures.push(`${label}\n      expected ${e}\n      got      ${a}`);
  else console.log(`PASS  ${label}`);
};

/* ---- request translation ------------------------------------------ */

const rendererRequest = {
  model: 'claude-sonnet-4-6',
  max_tokens: 1000,
  messages: [{ role: 'user', content: 'Turn this into a prompt' }],
};

check('model comes from config, not the renderer',
  P.toGroqRequest(rendererRequest, 'openai/gpt-oss-20b').model, 'openai/gpt-oss-20b');

check('falls back to the provider default when unset',
  P.toGroqRequest(rendererRequest, null).model, P.DEFAULT_MODEL.groq);

check('max_tokens is carried through',
  P.toGroqRequest(rendererRequest, 'm').max_tokens, 1000);

check('string content passes through unchanged',
  P.toGroqRequest(rendererRequest, 'm').messages,
  [{ role: 'user', content: 'Turn this into a prompt' }]);

// An Anthropic content array would stringify to "[object Object]" if not
// flattened - silently corrupting the prompt rather than failing loudly.
check('array content is flattened, not stringified',
  P.toGroqRequest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] }, 'm').messages,
  [{ role: 'user', content: 'ab' }]);

/* ---- response translation ------------------------------------------ */

const groqOk = {
  model: 'openai/gpt-oss-120b',
  choices: [{ message: { role: 'assistant', content: '{"framework":"rtf"}' }, finish_reason: 'stop' }],
};
const groqTruncated = {
  choices: [{ message: { role: 'assistant', content: 'cut off here' }, finish_reason: 'length' }],
};

check('content becomes an Anthropic text block',
  P.fromGroqResponse(groqOk).content, [{ type: 'text', text: '{"framework":"rtf"}' }]);

check('finish_reason stop -> end_turn',
  P.fromGroqResponse(groqOk).stop_reason, 'end_turn');

// The component shows "was cut short" off this exact value.
check('finish_reason length -> max_tokens',
  P.fromGroqResponse(groqTruncated).stop_reason, 'max_tokens');

check('a malformed response degrades to empty text, not a throw',
  P.fromGroqResponse({}).content, [{ type: 'text', text: '' }]);

/* ---- the contract PromptBench.jsx actually depends on -------------- */

// Replicates callClaude's parsing (src/PromptBench.jsx). If a translated
// response survives this, the component can consume it.
const parseLikeComponent = (data) => ({
  text: data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
  truncated: data.stop_reason === 'max_tokens',
});

check("the component's own parsing yields the text",
  parseLikeComponent(P.fromGroqResponse(groqOk)), { text: '{"framework":"rtf"}', truncated: false });

check("the component's own parsing detects truncation",
  parseLikeComponent(P.fromGroqResponse(groqTruncated)), { text: 'cut off here', truncated: true });

// Guard against the contract moving: if the component stops filtering on
// b.type === "text" or stops testing stop_reason === "max_tokens", the
// translation above is silently wrong and this notices.
const component = fs.readFileSync(path.join(__dirname, '..', 'src', 'PromptBench.jsx'), 'utf8');
for (const marker of ['b.type === "text"', 'stop_reason === "max_tokens"']) {
  if (component.includes(marker)) console.log(`PASS  component still relies on: ${marker}`);
  else failures.push(`component no longer contains ${marker} - the translation contract has moved`);
}

/* ---- errors --------------------------------------------------------- */

check('Groq error text is surfaced verbatim',
  P.groqErrorMessage({ error: { message: 'model `x` has been decommissioned' } }, 400),
  'Groq: model `x` has been decommissioned');

check('an unparseable error still says something useful',
  P.groqErrorMessage(null, 502), 'Groq request failed (HTTP 502).');

if (failures.length) {
  console.error(`\nProvider checks FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll provider translation checks passed.');
