import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 페이지뷰 기록
export async function POST(req: NextRequest) {
  const { path, userId } = await req.json();
  await prisma.pageView.create({
    data: {
      path: path || "/",
      ip: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
      userId: userId || undefined,
    },
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}

// 페이지뷰 통계 조회
export async function GET(req: NextRequest) {
  const total = await prisma.pageView.count();
  const today = await prisma.pageView.count({
    where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  });

  const topPages = await prisma.pageView.groupBy({
    by: ["path"],
    _count: { path: true },
    orderBy: { _count: { path: "desc" } },
    take: 10,
  });

  const hourlyRaw = await prisma.$queryRawUnsafe<{ hour: number; count: number }[]>(
    `SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*)::int as count 
     FROM "PageView" WHERE created_at >= NOW() - INTERVAL '24 hours' 
     GROUP BY hour ORDER BY hour`
  ).catch(() => []);

  return NextResponse.json({
    total, today,
    topPages: topPages.map((p) => ({ path: p.path, count: p._count.path })),
    hourly: hourlyRaw || [],
  });
}
