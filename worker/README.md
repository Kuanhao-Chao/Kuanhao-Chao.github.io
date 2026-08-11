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

Free. The Workers **Free** plan includes 10,000 Neurons/day. **Measured against the deployed
Worker**, a question costs **5.1 neurons** (short answer) to **10.3** (a long one, ~60 words) —
the streamed frames report `usage.neurons` directly, so this is metered, not estimated. That is
roughly **1,000–2,000 questions a day at no charge**.

> An earlier version of this file estimated ~40 neurons and ~250 questions/day from the published
> per-token prices. Real usage is about eight times cheaper; the figures above replace it.

Exceeding the allowance fails the request rather than billing you; the terminal then falls back to
its offline answer, so the worst case is a slightly worse answer, never a surprise invoice.

Also measured: **351 ms to first byte**, 876 ms for a complete long answer, `finish_reason: stop`
(nothing truncated at `max_tokens: 500`), and `/no_think` working — the reasoning channel carried
two characters.

### What happens when the allowance runs out

`src/scripts/terminal.ts` holds a **session-wide circuit breaker**, `modelDownUntil`:

| response | meaning | what the shell does |
|---|---|---|
| `503` | `env.AI.run` failed — what a Neuron-exhausted account looks like | stops calling the endpoint **for the session** |
| `429` | throttled by the limiter below | backs off for **60 s**, matching the limiter's period, then tries again |
| two other failures in a row | a blip, a dead endpoint | stops for the session |

The 429 case is deliberately not a session latch: being throttled means "come back in a minute",
not "come back tomorrow", so a visitor who asks a burst of questions gets the model back on its own
rather than being downgraded until they reload. The deadline is module-scoped rather than
per-mount, so it survives the remount each view transition performs.

There are two deadlines rather than one: **8 s to the first body chunk** and 20 s for the whole
stream. Measured first-byte latency is 351 ms, so 8 s is a stall detector, not a limit on normal
answers.

When an endpoint is configured but the answer came from the index anyway, the shell prints a dim
`— answered from the offline index —`. With no endpoint configured it stays quiet: the offline brain
is simply how `ask` works, and there is no fault to report.

## Deploy

```sh
cd worker
npx wrangler login     # once
npx wrangler deploy
```

Wrangler prints the deployed URL. It is **live** at `https://khchao-ask.khchao.workers.dev`, wired
into `askEndpoint` in `src/data/site.ts` and into `connect-src` in `src/components/BaseHead.astro`.
Blank the former and the site falls back to the offline brain with no errors and nothing to clean up.

Changing `wrangler.toml` — including the rate limit — needs a redeploy to take effect.

## Guards

| Guard | Where |
|---|---|
| Origin allowlist | `ALLOWED_ORIGINS` — a courtesy check; `Origin` is spoofable outside a browser |
| Per-IP rate limit | `[[ratelimits]]`, 12 requests/minute — a speed bump, not a wall (see below) |
| Input caps | question ≤ 500 chars, context ≤ 9,000 chars, output ≤ 500 tokens |
| Scope | a system prompt that answers only from the supplied context and refuses to invent facts |

**The daily Neuron ceiling is the real boundary, not the rate limit.** An earlier version of this
table claimed the opposite, and was wrong twice over.

First, the binding was configured in the pre-GA `[[unsafe.bindings]]` form and did nothing at all:
`wrangler deploy` reported it as `env.ASK_LIMIT (ratelimit) — Unsafe Metadata`, and ten requests in
a minute against a limit of six all returned 200. Under `[[ratelimits]]` the same line now reads
`env.ASK_LIMIT (12 requests/60s) — Rate Limit`. **That binding line is the quickest way to tell
whether the limiter is real.**

Second, even correctly configured it is loose, exactly as Cloudflare documents ("permissive,
eventually consistent, and intentionally designed to not be used as an accurate accounting
system", counted per-location). Measured against the live Worker at `limit = 12`:

| burst | result |
|---|---|
| 25 sequential | 24 allowed, first `429` on the 25th |
| 30 in parallel | 16 allowed, 14 got `429` |

So it catches a fast scraper and barely notices a slow one. It is a speed bump. What actually caps
the damage is that the Free plan stops serving at 10,000 Neurons/day and never bills.

**Known residual risk:** retrieval happens in the browser, so the client supplies the context. A
determined caller could use this as a small free LLM. The daily Neuron ceiling bounds that
absolutely — the cost of abuse is a day of degraded `ask`, never money. If it is ever actually
abused, move retrieval into the Worker — fetch and
cache `https://khchao.com/terminal.json` here and ignore any client-supplied context.

## Local run

```sh
npx wrangler dev        # http://localhost:8787
curl -s localhost:8787 -X POST \
  -H 'origin: http://localhost:4321' -H 'content-type: application/json' \
  -d '{"question":"what is LiftOn?","context":"LiftOn is a genome annotation lift-over tool."}'
```
