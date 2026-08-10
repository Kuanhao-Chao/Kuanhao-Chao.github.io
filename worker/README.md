# khchao-ask

The free chatbot behind `ask` in the [/terminal/](https://khchao.com/terminal/) shell.

Runs **Qwen3 30B A3B** (`@cf/qwen/qwen3-30b-a3b-fp8`) on Cloudflare Workers AI.

## Why it lives in this repo

There is **no API key**. Workers AI is an ambient `AI` binding, so there is no secret to keep out of
version control — which is the only reason the earlier Claude-based design needed a separate repo.
This directory is outside the Pages artifact (only `dist/` is uploaded), so it ships nothing and is
never deployed by the site's own workflow. It **is** inside `scripts/audit-security.mjs`'s
`SCAN_ROOTS`, deliberately: "there is no key here" is a claim worth having a scanner enforce, and a
planted `sk-…` in this directory fails the build.

## Cost

Free. The Workers **Free** plan includes 10,000 Neurons/day, and this model costs 4,625 Neurons per
million input tokens and 30,475 per million output. A question sends ~6k input and ~400 output
tokens — about **40 Neurons, so roughly 250 questions a day at no charge**. Exceeding the allowance
on the Free plan fails the request rather than billing you; the terminal then falls back to its
offline answer, so the worst case is a slightly worse answer, never a surprise invoice.

### What happens when the allowance runs out

`src/scripts/terminal.ts` holds a **session-wide circuit breaker**. A `429` (rate limited) or `503`
(what this Worker returns when `env.AI.run` fails, which is the shape a Neuron-exhausted account
takes) latches `modelDown` immediately; any other failure gets one retry before latching. Every
later `ask` in that browser session then skips the endpoint entirely and answers from the in-browser
index with no network wait at all. The flag is module-scoped rather than per-mount, so it survives
the remount each view transition performs.

There are two deadlines rather than one: **6 s to the first body chunk** and 20 s for the whole
stream. A quota-blocked visitor therefore waits a few seconds exactly once, and never again.

When an endpoint is configured but the answer came from the index anyway, the shell prints a dim
`— answered from the offline index —`. With no endpoint configured it stays quiet: the offline brain
is simply how `ask` works, and there is no fault to report.

## Deploy

```sh
cd worker
npx wrangler login     # once
npx wrangler deploy
```

Wrangler prints the deployed URL. Give it to me and I'll set `askEndpoint` in `src/data/site.ts` and
widen `connect-src` in `src/components/BaseHead.astro` — until then the site simply uses the offline
brain, with no errors and nothing to clean up.

## Guards

| Guard | Where |
|---|---|
| Origin allowlist | `ALLOWED_ORIGINS` — a courtesy check; `Origin` is spoofable outside a browser |
| Per-IP rate limit | `[[unsafe.bindings]]` ratelimit, 6 requests/minute — **this** is the real boundary |
| Input caps | question ≤ 500 chars, context ≤ 9,000 chars, output ≤ 500 tokens |
| Scope | a system prompt that answers only from the supplied context and refuses to invent facts |

**Known residual risk:** retrieval happens in the browser, so the client supplies the context. A
determined caller could use this as a small free LLM. The rate limit and the daily Neuron ceiling
bound that absolutely. If it is ever actually abused, move retrieval into the Worker — fetch and
cache `https://khchao.com/terminal.json` here and ignore any client-supplied context.

## Local run

```sh
npx wrangler dev        # http://localhost:8787
curl -s localhost:8787 -X POST \
  -H 'origin: http://localhost:4321' -H 'content-type: application/json' \
  -d '{"question":"what is LiftOn?","context":"LiftOn is a genome annotation lift-over tool."}'
```
