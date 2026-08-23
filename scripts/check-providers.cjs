// Verifies the OpenAI-dialect <-> Anthropic translation in electron/providers.js.
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
  P.toOpenAIRequest(rendererRequest, 'openai/gpt-oss-20b').model, 'openai/gpt-oss-20b');

check('falls back to the provider default when unset',
  P.toOpenAIRequest(rendererRequest, null).model, P.DEFAULT_MODEL.groq);

check('max_tokens is carried through',
  P.toOpenAIRequest(rendererRequest, 'm').max_tokens, 1000);

check('string content passes through unchanged',
  P.toOpenAIRequest(rendererRequest, 'm').messages,
  [{ role: 'user', content: 'Turn this into a prompt' }]);

// An Anthropic content array would stringify to "[object Object]" if not
// flattened - silently corrupting the prompt rather than failing loudly.
check('array content is flattened, not stringified',
  P.toOpenAIRequest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] }, 'm').messages,
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
  P.fromOpenAIResponse(groqOk).content, [{ type: 'text', text: '{"framework":"rtf"}' }]);

check('finish_reason stop -> end_turn',
  P.fromOpenAIResponse(groqOk).stop_reason, 'end_turn');

// The component shows "was cut short" off this exact value.
check('finish_reason length -> max_tokens',
  P.fromOpenAIResponse(groqTruncated).stop_reason, 'max_tokens');

check('a malformed response degrades to empty text, not a throw',
  P.fromOpenAIResponse({}).content, [{ type: 'text', text: '' }]);

/* ---- the contract PromptBench.jsx actually depends on -------------- */

// Replicates callClaude's parsing (src/PromptBench.jsx). If a translated
// response survives this, the component can consume it.
const parseLikeComponent = (data) => ({
  text: data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
  truncated: data.stop_reason === 'max_tokens',
});

check("the component's own parsing yields the text",
  parseLikeComponent(P.fromOpenAIResponse(groqOk)), { text: '{"framework":"rtf"}', truncated: false });

check("the component's own parsing detects truncation",
  parseLikeComponent(P.fromOpenAIResponse(groqTruncated)), { text: 'cut off here', truncated: true });

// Guard against the contract moving: if the component stops filtering on
// b.type === "text" or stops testing stop_reason === "max_tokens", the
// translation above is silently wrong and this notices.
const component = fs.readFileSync(path.join(__dirname, '..', 'src', 'PromptBench.jsx'), 'utf8');
for (const marker of ['b.type === "text"', 'stop_reason === "max_tokens"']) {
  if (component.includes(marker)) console.log(`PASS  component still relies on: ${marker}`);
  else failures.push(`component no longer contains ${marker} - the translation contract has moved`);
}

/* ---- Gemini shares the dialect, so it must share the behaviour ------ */

check('gemini is a known provider', P.PROVIDERS.includes('gemini'), true);

check('gemini chat endpoint is the OpenAI shim',
  P.chatUrl('gemini'), 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');

check('groq chat endpoint unchanged',
  P.chatUrl('groq'), 'https://api.groq.com/openai/v1/chat/completions');

check('models endpoint derives from the same base',
  P.modelsUrl('gemini'), 'https://generativelanguage.googleapis.com/v1beta/openai/models');

// Google returns {error:{code,message,status}} where Groq returns OpenAI's
// {error:{message,type}} - both nest the readable reason at error.message.
check('a Google-shaped error is surfaced too',
  P.errorMessage({ error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT' } }, 400, 'gemini'),
  'Gemini: API key not valid');

check('gemini default model differs from groq',
  P.DEFAULT_MODEL.gemini !== P.DEFAULT_MODEL.groq, true);

/* ---- model list --------------------------------------------------- */

check('model ids are extracted and sorted',
  P.parseModelList({ data: [{ id: 'zebra' }, { id: 'alpha' }] }), ['alpha', 'zebra']);

// Gemini returns ids prefixed with models/; the bare id is what a person
// recognises, and the chat endpoint accepts either.
check('the models/ prefix is stripped',
  P.parseModelList({ data: [{ id: 'models/gemini-2.5-flash' }] }), ['gemini-2.5-flash']);

check('a junk model list degrades to empty, not a throw',
  P.parseModelList({ nope: true }), []);

/* ---- errors --------------------------------------------------------- */

check('Groq error text is surfaced verbatim',
  P.errorMessage({ error: { message: 'model `x` has been decommissioned' } }, 400, 'groq'),
  'Groq: model `x` has been decommissioned');

// Regression: Gemini's chat endpoint returns [{error:{...}}] where its models
// endpoint returns {error:{...}}. Missing this turned a precise "API key not
// valid" into a bare "request failed (HTTP 400)".
check('an array-wrapped error is unwrapped',
  P.errorMessage([{ error: { code: 400, message: 'Please pass a valid API key' } }], 400, 'gemini'),
  'Gemini: Please pass a valid API key');

check('an unparseable error still says something useful',
  P.errorMessage(null, 502, 'groq'), 'Groq request failed (HTTP 502).');

if (failures.length) {
  console.error(`\nProvider checks FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll provider translation checks passed.');
