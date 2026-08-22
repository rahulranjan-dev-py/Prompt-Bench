// Provider translation, kept free of any Electron import on purpose: this is
// the only part of the proxy that can be tested without launching an app, and
// api.groq.com is unreachable from the environment this was written in, so
// fixture tests are the only verification available. See scripts/check-providers.cjs.

const PROVIDERS = ['anthropic', 'groq'];

// The component hardcodes a Claude model id, which is meaningless to Groq, so
// each provider carries its own default and config.json can override it.
//
// Groq retires models regularly - llama-3.3-70b-versatile, the obvious guess,
// is already deprecated - so treat this as a starting point rather than a
// guarantee, and list current ids at https://api.groq.com/openai/v1/models.
const DEFAULT_MODEL = {
  anthropic: null, // null = honour whatever the renderer asked for
  groq: 'openai/gpt-oss-120b',
};

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Anthropic-shaped request -> OpenAI chat-completions body.
//
// `max_tokens` rather than `max_completion_tokens`: OpenAI renamed it, but
// `max_tokens` remains the field every OpenAI-compatible provider accepts, and
// this code cannot be tested against the live API to confirm the newer name.
// Compatibility beats currency where it cannot be checked.
function toGroqRequest(body, model) {
  return {
    model: model || DEFAULT_MODEL.groq,
    messages: (body.messages || []).map((m) => ({
      role: m.role,
      // The renderer only ever sends plain strings, but an Anthropic content
      // array would otherwise stringify to "[object Object]" and silently
      // corrupt the prompt, so flatten it properly.
      content: typeof m.content === 'string'
        ? m.content
        : (m.content || []).map((b) => b.text ?? '').join(''),
    })),
    max_tokens: body.max_tokens,
  };
}

// OpenAI chat-completions response -> the Anthropic shape PromptBench parses.
//
// The component reads `data.content.filter(b => b.type === 'text')` and
// `data.stop_reason === 'max_tokens'`, so those two fields are the contract.
function fromGroqResponse(json) {
  const choice = json?.choices?.[0];
  const text = choice?.message?.content ?? '';
  return {
    content: [{ type: 'text', text }],
    // OpenAI says "length" where Anthropic says "max_tokens"; the component
    // shows a "cut short" warning off this, so the mapping has to be right.
    stop_reason: choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    model: json?.model ?? null,
  };
}

// Groq returns { error: { message, type } }. Surfacing its own words matters:
// a retired model id is the most likely failure and only Groq can name it.
function groqErrorMessage(json, status) {
  const msg = json?.error?.message;
  if (msg) return `Groq: ${msg}`;
  return `Groq request failed (HTTP ${status}).`;
}

module.exports = {
  PROVIDERS,
  DEFAULT_MODEL,
  GROQ_ENDPOINT,
  toGroqRequest,
  fromGroqResponse,
  groqErrorMessage,
};
