/**
 * 관리자 통계 API
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        // Supabase 사용자 목록
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );

        const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 100 });

        // DB 통계
        const today = new Date();
        const kst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
        const todayStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 60 * 60 * 1000);

        const [totalPageviews, todayPageviews, topPages] = await Promise.all([
            prisma.pageView.count(),
            prisma.pageView.count({ where: { createdAt: { gte: todayStart } } }),
            prisma.pageView.groupBy({ by: ["path"], _count: { path: true }, orderBy: { _count: { path: "desc" } }, take: 5 }),
        ]);

        const todayLogins = await prisma.loginHistory.count({
            where: { createdAt: { gte: todayStart }, success: true },
        });

        const recentSignups = users?.filter((u: any) => {
            const d = new Date(u.created_at);
            return d >= todayStart;
        }).length || 0;

        // 레퍼럴 통계
        const [totalRef, todayRef] = await Promise.all([
            prisma.referral.count(),
            prisma.referral.count({ where: { createdAt: { gte: todayStart } } }),
        ]);
        const topRefs = await prisma.referral.groupBy({
            by: ["refCode"],
            _count: { refCode: true },
            orderBy: { _count: { refCode: "desc" } },
            take: 10,
        });

        // 사주 질문 TOP10
        const topStocks = await prisma.sajuLog.groupBy({
            by: ["stock"],
            where: { action: "stock_query", stock: { not: null } },
            _count: { stock: true },
            orderBy: { _count: { stock: "desc" } },
            take: 10,
        });

        return NextResponse.json({
            totalUsers: users?.length || 0,
            todayLogins,
            todayPageviews,
            recentSignups,
            totalRef, todayRef,
            topPages: topPages.map(p => ({ path: p.path, count: p._count.path })),
            topRefs: topRefs.map(r => ({ code: r.refCode, count: r._count.refCode })),
            topStocks: topStocks.map(s => ({ stock: s.stock, count: s._count.stock })),
            supabaseUsers: users?.slice(0, 10).map((u: any) => ({
                email: u.email,
                created_at: u.created_at,
            })) || [],
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
