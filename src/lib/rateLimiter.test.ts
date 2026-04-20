import { describe, expect, it } from "vitest";
import { InMemorySlidingWindowRateLimiter } from "./rateLimiter";

describe("InMemorySlidingWindowRateLimiter", () => {
  it("allows up to limit within the window and rejects the rest", () => {
    const limiter = new InMemorySlidingWindowRateLimiter({ limit: 5, windowMs: 60_000 });
    const now = 1_000_000;

    const decisions = Array.from({ length: 10 }, () => limiter.decide("u1", now));
    const allowed = decisions.filter((d) => d.allowed).length;
    const rejected = decisions.filter((d) => !d.allowed).length;

    expect(allowed).toBe(5);
    expect(rejected).toBe(5);
    expect(decisions[5].retryAfterMs).toBeGreaterThan(0);
  });

  it("expires requests after the window elapses", () => {
    const limiter = new InMemorySlidingWindowRateLimiter({ limit: 5, windowMs: 60_000 });
    const t0 = 1_000_000;

    for (let i = 0; i < 5; i++) expect(limiter.decide("u1", t0 + i).allowed).toBe(true);
    expect(limiter.decide("u1", t0 + 10).allowed).toBe(false);

    // After 60s, the old timestamps are out of window.
    expect(limiter.decide("u1", t0 + 60_001).allowed).toBe(true);
  });

  it("keeps per-user isolation", () => {
    const limiter = new InMemorySlidingWindowRateLimiter({ limit: 5, windowMs: 60_000 });
    const now = 1_000_000;

    for (let i = 0; i < 5; i++) expect(limiter.decide("u1", now).allowed).toBe(true);
    for (let i = 0; i < 5; i++) expect(limiter.decide("u2", now).allowed).toBe(true);
    expect(limiter.decide("u1", now).allowed).toBe(false);
    expect(limiter.decide("u2", now).allowed).toBe(false);
  });
});

