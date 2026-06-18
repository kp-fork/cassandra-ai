/**
 * 대시보드 API — Naver Finance + DB 시그널 통합
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";
import { scrapeNaverFinance } from "@/lib/naver-crawler";

export async function GET() {
  try {
    // ─── DB 시그널 (최근 3일, 고위험순) ───
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - 3) - 9 * 60 * 60 * 1000);

    const signals = await prisma.signal.findMany({
      where: { firedAt: { gte: threeDaysAgo } },
      orderBy: { score: "desc" },
      take: 30,
      select: {
        ruleName: true,
        score: true,
        firedAt: true,
        corp: { select: { companyName: true, stockCode: true } },
      },
    });

    // ─── Naver Finance (기존) ───
    const recent = await prisma.marketSnapshot.findFirst({
      where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
    });

    let snapshots: any[] = [];
    if (recent) {
      snapshots = await prisma.marketSnapshot.findMany({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    } else {
      const data = await scrapeNaverFinance();
      for (const d of data) {
        await prisma.marketSnapshot.create({
          data: {
            category: d.category,
            data: d.stocks as any,
            stats: d.stats as any,
          },
        });
      }
      snapshots = await prisma.marketSnapshot.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    }

    // 시그널 요약
    const cbList = signals.filter(s => s.ruleName === "CB발행" || s.ruleName === "CB리픽싱");
    const lawsuitList = signals.filter(s => s.ruleName === "소송/분쟁");
    const holderChange = signals.filter(s => s.ruleName === "대주주변경");
    const capitalChange = signals.filter(s => s.ruleName === "증자/감자");

    return NextResponse.json(toJSON({
      snapshots,
      signals: {
        highRisk: signals.slice(0, 10).map(s => ({
          company: s.corp.companyName,
          stockCode: s.corp.stockCode,
          rule: s.ruleName,
          score: s.score,
          date: s.firedAt.toISOString().slice(0, 10),
        })),
        cbIssuances: cbList.map(s => ({ company: s.corp.companyName, stockCode: s.corp.stockCode, score: s.score })),
        lawsuits: lawsuitList.map(s => ({ company: s.corp.companyName, stockCode: s.corp.stockCode, score: s.score })),
        holderChanges: holderChange.map(s => ({ company: s.corp.companyName, stockCode: s.corp.stockCode, score: s.score })),
        counts: {
          total: signals.length,
          cb: cbList.length,
          lawsuit: lawsuitList.length,
          holderChange: holderChange.length,
          capitalChange: capitalChange.length,
        },
      },
    }));
  } catch (err) {
    console.error("Dashboard error:", err);
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
