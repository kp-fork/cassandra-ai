import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrendingFromRedis } from "@/lib/redis-cache";

export async function GET() {
  // 1. Redis에서 먼저 조회
  const redisTrending = await getTrendingFromRedis();
  if (redisTrending) {
    return NextResponse.json(redisTrending);
  }

  // 2. DB 폴백
  const trending = await prisma.searchLog.groupBy({
    by: ["query"],
    _count: { query: true },
    where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    orderBy: { _count: { query: "desc" } },
    take: 30,
  });

  const filtered = trending
    .filter((t) => t.query.length >= 3)
    .slice(0, 10)
    .map((t) => ({ query: t.query, count: t._count.query }));

  return NextResponse.json(filtered);
}
