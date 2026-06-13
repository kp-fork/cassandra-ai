/**
 * 사주 통계 CLI — npm run saju-stats
 * 사주 입력 인원, 종목 질문 수, 레퍼럴 통계
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔮 사주 서비스 통계");
    console.log("=".repeat(50));

    // 오늘 날짜
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. 사주 API 호출 수 (PageView /saju)
    const [totalSaju, todaySaju] = await Promise.all([
        prisma.pageView.count({ where: { path: "/saju" } }),
        prisma.pageView.count({ where: { path: "/saju", createdAt: { gte: today } } }),
    ]);

    console.log(`\n📊 방문 통계`);
    console.log(`  오늘 사주 페이지 방문: ${todaySaju}명`);
    console.log(`  누적 사주 페이지 방문: ${totalSaju}명`);

    // 2. 종목 질문 수 (PageView /api/saju)
    const [totalApi, todayApi] = await Promise.all([
        prisma.pageView.count({ where: { path: "/api/saju" } }),
        prisma.pageView.count({ where: { path: "/api/saju", createdAt: { gte: today } } }),
    ]);

    console.log(`\n💬 사주 분석 요청 (입력 인원 추정)`);
    console.log(`  오늘 사주 분석: ${todayApi}건`);
    console.log(`  누적 사주 분석: ${totalApi}건`);

    // 3. 레퍼럴 통계
    const [totalRef, todayRef] = await Promise.all([
        prisma.referral.count(),
        prisma.referral.count({ where: { createdAt: { gte: today } } }),
    ]);
    const topRefs = await prisma.referral.groupBy({
        by: ["refCode"],
        _count: { refCode: true },
        orderBy: { _count: { refCode: "desc" } },
        take: 10,
    });

    console.log(`\n🔗 레퍼럴 통계`);
    console.log(`  오늘 레퍼럴 유입: ${todayRef}건`);
    console.log(`  누적 레퍼럴 유입: ${totalRef}건`);
    if (topRefs.length > 0) {
        console.log(`\n  📋 레퍼럴 순위`);
        for (const r of topRefs) {
            console.log(`    ${r.refCode.padEnd(12)} ${r._count.refCode}명`);
        }
    }

    // 4. MuHynixPrediction 카운트 (참고)
    const muCount = await prisma.muHynixPrediction.count();
    console.log(`\n📈 기타 통계`);
    console.log(`  MU-Hynix 예측: ${muCount}건`);

    console.log("\n" + "=".repeat(50));
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
