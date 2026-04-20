import { InMemorySlidingWindowRateLimiter } from "./rateLimiter";

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const limiter = new InMemorySlidingWindowRateLimiter({
  limit: readNumberEnv("RATE_LIMIT_MAX_PER_WINDOW", 5),
  windowMs: readNumberEnv("RATE_LIMIT_WINDOW_MS", 60_000),
});

