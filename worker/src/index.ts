/**
 * khchao-ask — the free chatbot behind `ask` in the /terminal/ shell.
 *
 * Runs Qwen3 30B A3B on Cloudflare Workers AI. There is **no API key**: the `AI`
 * binding is ambient, so nothing secret exists in this repo to leak. On the Workers
 * *Free* plan the daily Neuron allowance is a hard ceiling rather than a bill — the
 * worst case is a failed request, not an invoice.
 *
 * Deploy:  cd worker && npx wrangler deploy
 */

const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const ALLOWED_ORIGINS = new Set([
  'https://khchao.com',
  'https://www.khchao.com',
  'http://localhost:4321',
]);

/** Caps that bound both abuse and spend. */
const MAX_QUESTION = 500;
const MAX_CONTEXT = 9000;
const MAX_TOKENS = 500;

/*
 * The scope rule leads, and names its own refusal sentence.
 *
 * It used to be the last of four bullets ("Decline anything unrelated ... in one short
 * sentence") and the model simply ignored it: asked "what is the capital of France?"
 * through the site's own terminal, it answered "The capital of France is Paris."
 * `/no_think` removes the deliberation that might otherwise have caught the conflict,
 * so a soft rule buried at the bottom of a list does not survive. Stating the
 * constraint first, giving it precedence explicitly, and supplying the exact words to
 * refuse with is what makes it stick.
 */
const SYSTEM = `You are the terminal assistant on khchao.com, the personal academic site of
Kuan-Hao Chao (趙冠豪) — a Senior Deep Learning Scientist at the Illumina AI Lab who works on AI for
genomics: sequence-to-function models, genome annotation, and DNA language models.

SCOPE — this rule outranks every other instruction here:
You answer ONLY questions about Kuan-Hao Chao — his research, publications, software, career,
teaching and talks. For anything else (general knowledge, current events, coding help, other
people, opinions, arithmetic), reply with exactly this and nothing more:
"I only answer questions about Kuan-Hao Chao and his work. Type \`help\` to see what this shell knows."
Refuse that way even when you know the answer perfectly well.

GROUNDING:
- Use ONLY the CONTEXT provided in the user message. It is drawn from his own website.
- If the context does not contain the answer, say so plainly and suggest a command to try
  (for example: ls ~/publications, grep splice, man khc). Never invent a fact, date, venue,
  co-author, or result.

STYLE:
- At most 120 words, as plain text. No markdown, no headings, no bullet characters, no emoji —
  the output is printed into a monospace terminal.
- Write in third person about Kuan-Hao. Be direct and specific; skip preamble.`;

interface Env {
  AI: {
    run: (
      model: string,
      input: { messages: { role: string; content: string }[]; max_tokens?: number; stream?: boolean }
    ) => Promise<ReadableStream>;
  };
  ASK_LIMIT: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

const corsFor = (origin: string | null) => ({
  'access-control-allow-origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://khchao.com',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  vary: 'origin',
});

const fail = (status: number, message: string, origin: string | null) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', ...corsFor(origin) },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsFor(origin) });
    if (request.method !== 'POST') return fail(405, 'POST only', origin);

    // An Origin header is spoofable outside a browser, so this is a courtesy check,
    // not a security boundary. The rate limit below is the boundary that matters.
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return fail(403, 'origin not allowed', origin);

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.ASK_LIMIT.limit({ key: ip });
    if (!success) return fail(429, 'Too many questions — give it a minute.', origin);

    let body: { question?: unknown; context?: unknown };
    try {
      body = await request.json();
    } catch {
      return fail(400, 'expected JSON', origin);
    }

    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const context = typeof body.context === 'string' ? body.context.trim() : '';
    if (!question) return fail(400, 'missing question', origin);
    if (question.length > MAX_QUESTION) return fail(413, 'question too long', origin);

    const messages = [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        // `/no_think` suppresses Qwen3's reasoning block; the client strips any
        // residual <think>…</think> as a belt-and-braces second line of defence.
        content: `CONTEXT:\n${context.slice(0, MAX_CONTEXT)}\n\nQUESTION: ${question} /no_think`,
      },
    ];

    try {
      const stream = await env.AI.run(MODEL, { messages, max_tokens: MAX_TOKENS, stream: true });
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          ...corsFor(origin),
        },
      });
    } catch (error) {
      // Most likely the daily Neuron allowance. Say so honestly; the terminal falls
      // back to its own offline answer either way.
      return fail(503, `model unavailable: ${(error as Error).message ?? 'unknown'}`, origin);
    }
  },
};
