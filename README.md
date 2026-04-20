## Rate-Limited API Service

Backend service that provides:

- `POST /request` — accepts `{ user_id, payload }` and enforces a per-user rate limit
- `GET /stats` — returns per-user request statistics

Rate limiting:

- **Max 5 requests per user per minute**
- Returns **HTTP 429** with `Retry-After` when exceeded
- Data stored **in-memory** (no DB)

## Running locally

Install deps:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

The service runs at `http://localhost:3000`.

## Test / quality checks

```bash
npm test
npm run lint
npm run build
```

## API

### POST `/request`

Request body:

```json
{
  "user_id": "u1",
  "payload": { "any": "json" }
}
```

Example:

```bash
curl -i -X POST http://localhost:3000/request \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","payload":{"hello":"world"}}'
```

Successful response (200) includes `rate_limit` info (remaining quota, etc).

When limited (429), response includes:

- `error.code = "RATE_LIMITED"`
- `rate_limit.retryAfterMs`
- `Retry-After` header (seconds)
- `X-RateLimit-*` headers (limit/remaining/reset)

Optional retry behavior (bounded):

- Add `?wait=true&max_wait_ms=2000` to allow the server to wait up to 2s and retry once when limited.

### GET `/stats`

Example:

```bash
curl -s http://localhost:3000/stats
```

Returns per-user counters (`total`, `allowed`, `rejected`) and the current `inWindowCount`.

## Design decisions

- **Sliding window limiter**: each user stores a list of request timestamps; on each call we prune timestamps older than 60s and decide allow/reject.
- **Concurrency correctness under parallel calls**: the limiter decision is **fully synchronous** (no awaits), so the check+update is atomic within a Node.js event loop tick.
- **Performance-conscious**: pruning uses a logical head index (no `Array.shift()`), with periodic compaction.
- **Production-considerate memory behavior**: includes best-effort garbage collection of inactive users to avoid unbounded growth.

Key files:

- `src/lib/rateLimiter.ts` — limiter + stats (in-memory)
- `src/app/request/route.ts` — `POST /request`
- `src/app/stats/route.ts` — `GET /stats`

## Configuration

Optional env vars:

- `RATE_LIMIT_MAX_PER_WINDOW` (default `5`)
- `RATE_LIMIT_WINDOW_MS` (default `60000`)

## Testing

```bash
npm test
```

## Limitations (and what I’d improve with more time)

- **In-memory state isn’t shared across instances**: if deployed with multiple replicas (or serverless cold starts), each instance has its own limiter state. With more time, I’d back this with **Redis** (atomic INCR + TTL, or a Lua script for sliding window/token bucket).
- **Next.js dev hot reload resets memory**: restarting the server resets stats/limits. In production (`next build && next start`) this is stable within a process.
- **More robustness**: structured logging, metrics (`/metrics` for Prometheus), request IDs, and load tests.
