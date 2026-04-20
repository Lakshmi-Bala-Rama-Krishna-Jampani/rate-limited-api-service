import { NextResponse } from "next/server";
import { limiter } from "@/lib/limiterInstance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  user_id?: unknown;
  payload?: unknown;
};

function parseUserId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function setRateLimitHeaders(res: NextResponse, decision: { limit: number; remaining: number; windowMs: number; retryAfterMs: number | null }) {
  res.headers.set("X-RateLimit-Limit", String(decision.limit));
  res.headers.set("X-RateLimit-Remaining", String(decision.remaining));
  // Reset is seconds until window clears enough to accept at least 1 request.
  if (decision.retryAfterMs !== null) res.headers.set("X-RateLimit-Reset", String(Math.ceil(decision.retryAfterMs / 1000)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }

  const userId = parseUserId(body.user_id);
  if (!userId) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "`user_id` is required and must be a non-empty string (or a number).",
        },
      },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const wait = url.searchParams.get("wait") === "true";
  const maxWaitMs = Math.min(
    Number(url.searchParams.get("max_wait_ms") ?? "0") || 0,
    10_000,
  );

  let decision = limiter.decide(userId);
  if (wait && !decision.allowed && decision.retryAfterMs !== null && decision.retryAfterMs <= maxWaitMs) {
    await sleep(decision.retryAfterMs);
    decision = limiter.decide(userId);
  }

  if (!decision.allowed) {
    const res = NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded.",
        },
        rate_limit: decision,
      },
      { status: 429 },
    );
    if (decision.retryAfterMs !== null) {
      // Retry-After header is seconds; round up for safety.
      res.headers.set("Retry-After", String(Math.ceil(decision.retryAfterMs / 1000)));
    }
    setRateLimitHeaders(res, decision);
    return res;
  }

  // The assignment doesn't specify what to do with payload; we accept and echo back basic info.
  const res = NextResponse.json(
    {
      ok: true,
      user_id: userId,
      payload: body.payload ?? null,
      rate_limit: decision,
    },
    { status: 200 },
  );
  setRateLimitHeaders(res, decision);
  return res;
}

