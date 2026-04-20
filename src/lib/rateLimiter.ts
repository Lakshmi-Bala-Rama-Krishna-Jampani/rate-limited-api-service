export type UserId = string;

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  windowMs: number;
  inWindowCount: number;
  retryAfterMs: number | null;
};

export type UserStats = {
  userId: UserId;
  total: number;
  allowed: number;
  rejected: number;
  inWindowCount: number;
  windowMs: number;
  lastSeenAt: string | null;
};

type UserEntry = {
  timestampsMs: number[];
  head: number; // index of the first in-window timestamp
  stats: {
    total: number;
    allowed: number;
    rejected: number;
  };
  lastSeenMs: number | null;
};

export type InMemoryRateLimiterOptions = {
  limit: number;
  windowMs: number;
  /**
   * Best-effort GC of inactive users to avoid unbounded memory growth.
   * If omitted, cleanup runs opportunistically with conservative defaults.
   */
  gc?: {
    inactiveAfterMs: number;
    minIntervalMs: number;
  };
};

/**
 * Sliding-window limiter implemented with per-user timestamp lists.
 *
 * Concurrency note (Node.js):
 * - This implementation performs all mutations synchronously (no awaits).
 * - That keeps "check + update" atomic within the event loop tick, so parallel
 *   HTTP requests cannot interleave mid-decision.
 */
export class InMemorySlidingWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly gc: Required<NonNullable<InMemoryRateLimiterOptions["gc"]>>;
  private readonly users = new Map<UserId, UserEntry>();
  private lastGcAtMs = 0;

  constructor(opts: InMemoryRateLimiterOptions) {
    if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
      throw new Error("limit must be a positive number");
    }
    if (!Number.isFinite(opts.windowMs) || opts.windowMs <= 0) {
      throw new Error("windowMs must be a positive number");
    }

    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.gc = {
      inactiveAfterMs: opts.gc?.inactiveAfterMs ?? 10 * 60_000, // 10 minutes
      minIntervalMs: opts.gc?.minIntervalMs ?? 60_000, // 1 minute
    };
  }

  decide(userId: UserId, nowMs = Date.now()): RateLimitDecision {
    this.maybeGc(nowMs);

    const entry = this.getOrCreateUser(userId);
    entry.lastSeenMs = nowMs;
    entry.stats.total += 1;

    const cutoff = nowMs - this.windowMs;
    const ts = entry.timestampsMs;
    let head = entry.head;

    // Prune from the logical head (O(1) amortized, avoids Array.shift()).
    while (head < ts.length && ts[head] <= cutoff) head += 1;
    if (head > 1024 && head * 2 > ts.length) {
      // Periodically compact to prevent unbounded growth of the underlying array.
      entry.timestampsMs = ts.slice(head);
      entry.head = 0;
      head = 0;
    } else {
      entry.head = head;
    }

    const inWindowCount = entry.timestampsMs.length - entry.head;

    if (inWindowCount >= this.limit) {
      entry.stats.rejected += 1;
      const oldestInWindow = entry.timestampsMs[entry.head];
      const retryAfterMs = Math.max(0, oldestInWindow + this.windowMs - nowMs);
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        windowMs: this.windowMs,
        inWindowCount,
        retryAfterMs,
      };
    }

    entry.timestampsMs.push(nowMs);
    entry.stats.allowed += 1;

    const newInWindowCount = entry.timestampsMs.length - entry.head;
    return {
      allowed: true,
      limit: this.limit,
      remaining: this.limit - newInWindowCount,
      windowMs: this.windowMs,
      inWindowCount: newInWindowCount,
      retryAfterMs: null,
    };
  }

  getStatsSnapshot(nowMs = Date.now()): UserStats[] {
    this.maybeGc(nowMs);

    const out: UserStats[] = [];
    for (const [userId, entry] of this.users.entries()) {
      const cutoff = nowMs - this.windowMs;
      const ts = entry.timestampsMs;
      let head = entry.head;
      while (head < ts.length && ts[head] <= cutoff) head += 1;
      entry.head = head;
      const inWindowCount = ts.length - head;

      out.push({
        userId,
        total: entry.stats.total,
        allowed: entry.stats.allowed,
        rejected: entry.stats.rejected,
        inWindowCount,
        windowMs: this.windowMs,
        lastSeenAt: entry.lastSeenMs ? new Date(entry.lastSeenMs).toISOString() : null,
      });
    }

    out.sort((a, b) => a.userId.localeCompare(b.userId));
    return out;
  }

  getUserCount(): number {
    return this.users.size;
  }

  getLimitConfig(): { limit: number; windowMs: number } {
    return { limit: this.limit, windowMs: this.windowMs };
  }

  private getOrCreateUser(userId: UserId): UserEntry {
    const existing = this.users.get(userId);
    if (existing) return existing;

    const created: UserEntry = {
      timestampsMs: [],
      head: 0,
      stats: { total: 0, allowed: 0, rejected: 0 },
      lastSeenMs: null,
    };
    this.users.set(userId, created);
    return created;
  }

  private maybeGc(nowMs: number) {
    if (nowMs - this.lastGcAtMs < this.gc.minIntervalMs) return;
    this.lastGcAtMs = nowMs;

    const cutoff = nowMs - this.gc.inactiveAfterMs;
    for (const [userId, entry] of this.users.entries()) {
      if ((entry.lastSeenMs ?? 0) <= cutoff) this.users.delete(userId);
    }
  }
}

