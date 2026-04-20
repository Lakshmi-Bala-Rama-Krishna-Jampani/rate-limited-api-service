import { NextResponse } from "next/server";
import { limiter } from "@/lib/limiterInstance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const nowMs = Date.now();
  const users = limiter.getStatsSnapshot(nowMs);
  const { limit, windowMs } = limiter.getLimitConfig();

  return NextResponse.json(
    {
      ok: true,
      now: new Date(nowMs).toISOString(),
      limit,
      window_ms: windowMs,
      user_count: limiter.getUserCount(),
      users,
    },
    { status: 200 },
  );
}

