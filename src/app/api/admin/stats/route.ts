import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  const kst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const todayStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 60 * 60 * 1000);

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [
    totalPageviews, todayPageviews, topPages,
    uniqueTotal, uniqueToday,
    totalLogins, todayLogins, todayLoginUsers,
    totalRef, todayRef, topRefs,
    topStocks,
    totalUsers,
  ] = await Promise.all([
    safe(() => prisma.pageView.count(), 0),
    safe(() => prisma.pageView.count({ where: { createdAt: { gte: todayStart } } }), 0),
    safe(() => prisma.pageView.groupBy({ by: ["path"], _count: { path: true }, orderBy: { _count: { path: "desc" } }, take: 5 }), []),
    safe(() => prisma.pageView.groupBy({ by: ["ip"], where: { ip: { not: null } } }).then(r => r.length), 0),
    safe(() => prisma.pageView.groupBy({ by: ["ip"], where: { ip: { not: null }, createdAt: { gte: todayStart } } }).then(r => r.length), 0),
    safe(() => prisma.loginHistory.count({ where: { success: true } }), 0),
    safe(() => prisma.loginHistory.count({ where: { success: true, createdAt: { gte: todayStart } } }), 0),
    safe(() => prisma.loginHistory.findMany({ where: { success: true, createdAt: { gte: todayStart } }, select: { email: true, createdAt: true }, orderBy: { createdAt: "desc" }, distinct: ["email"], take: 50 }), []),
    safe(() => (prisma as any).referral.count(), 0),
    safe(() => (prisma as any).referral.count({ where: { createdAt: { gte: todayStart } } }), 0),
    safe(() => (prisma as any).referral.groupBy({ by: ["refCode"], _count: { refCode: true }, orderBy: { _count: { refCode: "desc" } }, take: 10 }), []),
    safe(() => (prisma as any).sajuLog.groupBy({ by: ["stock"], where: { action: "stock_query", stock: { not: null } }, _count: { stock: true }, orderBy: { _count: { stock: "desc" } }, take: 10 }), []),
    safe(() => prisma.appUser.count(), 0),
  ]);

  return NextResponse.json({
    totalUsers,
    todayLogins,
    totalLogins,
    todayPageviews,
    totalPageviews,
    uniqueToday,
    uniqueTotal,
    recentSignups: 0,
    totalRef,
    todayRef,
    topPages: (topPages as any[]).map((p: any) => ({ path: p.path, count: p._count.path })),
    topRefs: (topRefs as any[]).map((r: any) => ({ code: r.refCode, count: r._count.refCode })),
    topStocks: (topStocks as any[]).map((s: any) => ({ stock: s.stock, count: s._count.stock })),
    supabaseUsers: [],
    googleUsers: [],
    todayLoginUsers: (todayLoginUsers as any[]).map((u: any) => ({ email: u.email, time: u.createdAt.toISOString() })),
  });
}
