// Provider translation, kept free of any Electron import so it can be tested
// under plain node. See scripts/check-providers.cjs.
//
// Groq and Gemini both expose an OpenAI-compatible chat-completions dialect, so
// they share one translation and differ only in base URL and default model.
// Verified by probe: Gemini's shim answers on /v1beta/openai/chat/completions
// and /v1beta/openai/models, and accepts `Authorization: Bearer`.

const PROVIDER = {
  anthropic: {
    label: 'Anthropic',
    dialect: 'anthropic',            // uses @anthropic-ai/sdk, not the shim below
    envVar: 'ANTHROPIC_API_KEY',
    // null = send whatever model the renderer asked for.
    defaultModel: null,
    keysUrl: 'console.anthropic.com',
  },
  groq: {
    label: 'Groq',
    dialect: 'openai',
    envVar: 'GROQ_API_KEY',
    base: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    keysUrl: 'console.groq.com',
  },
  gemini: {
    label: 'Gemini',
    dialect: 'openai',
    envVar: 'GEMINI_API_KEY',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    keysUrl: 'aistudio.google.com/apikey',
  },
};

const PROVIDERS = Object.keys(PROVIDER);

// Kept as a flat map because the settings window renders it directly.
const DEFAULT_MODEL = Object.fromEntries(
  PROVIDERS.map((p) => [p, PROVIDER[p].defaultModel])
);

const chatUrl = (provider) => `${PROVIDER[provider].base}/chat/completions`;
const modelsUrl = (provider) => `${PROVIDER[provider].base}/models`;

// Anthropic-shaped request -> OpenAI chat-completions body.
//
// `max_tokens` rather than `max_completion_tokens`: OpenAI renamed it, but
// `max_tokens` remains the field every OpenAI-compatible provider accepts.
function toOpenAIRequest(body, model, provider = 'groq') {
  return {
    model: model || DEFAULT_MODEL[provider],
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
// The component reads `data.content.filter(b => b.type === 'text')` and
// `data.stop_reason === 'max_tokens'`, so those two fields are the contract.
function fromOpenAIResponse(json) {
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

// Both providers nest the human-readable reason at error.message - Groq returns
// OpenAI's {error:{message,type}} and Gemini returns Google's
// {error:{code,message,status}}. Surfacing their own words matters: a model the
// key cannot use is the likeliest failure and only they can name it.
function errorMessage(json, status, provider) {
  // Gemini's chat endpoint wraps its error in a JSON array - [{error:{...}}] -
  // while its models endpoint returns a bare object, and Groq returns a bare
  // object throughout. Unwrapping first is what keeps the provider's own words
  // reaching the user instead of a bare status code.
  const body = Array.isArray(json) ? json[0] : json;
  const msg = body?.error?.message;
  const who = PROVIDER[provider]?.label ?? provider;
  return msg ? `${who}: ${msg}` : `${who} request failed (HTTP ${status}).`;
}

// OpenAI-style { data: [{ id }] }. Sorted so the list is stable and scannable
// rather than in whatever order the provider happened to return.
function parseModelList(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((m) => (typeof m?.id === 'string' ? m.id : null))
    .filter(Boolean)
    // Gemini prefixes ids with "models/" in some responses; the chat endpoint
    // accepts them either way, but the bare id is what a person recognises.
    .map((id) => id.replace(/^models\//, ''))
    .sort();
}

module.exports = {
  PROVIDER,
  PROVIDERS,
  DEFAULT_MODEL,
  chatUrl,
  modelsUrl,
  toOpenAIRequest,
  fromOpenAIResponse,
  errorMessage,
  parseModelList,
};
