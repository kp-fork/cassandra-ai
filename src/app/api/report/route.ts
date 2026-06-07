import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { items } = body as { items: { id: string; type: "corp" | "person" | "fund"; label: string; uid: string }[] };

  if (!items?.length) {
    return NextResponse.json({ error: "핀된 항목이 없습니다" }, { status: 400 });
  }

  const personNames = items.filter((i) => i.type === "person").map((i) => i.label);
  const fundNames = items.filter((i) => i.type === "fund").map((i) => i.label);
  const corpCodes = items.filter((i) => i.type === "corp").map((i) => i.uid);

  // 1. 핀된 인물이 관여한 모든 회사 찾기
  const personCorps = personNames.length > 0
    ? await prisma.corpPersonRelation.findMany({
        where: { person: { name: { in: personNames } } },
        include: {
          corp: {
            select: { id: true, companyName: true, corpCode: true, stockCode: true, market: true, marketCap: true, isAdmin: true, delistedAt: true },
          },
          person: { select: { name: true, personUid: true, flags: true } },
        },
      })
    : [];

  // 2. 핀된 법인이 투자/인수한 회사 찾기
  const fundCorps = fundNames.length > 0
    ? await prisma.corpFundRelation.findMany({
        where: { fund: { name: { in: fundNames } } },
        include: {
          corp: {
            select: { id: true, companyName: true, corpCode: true, stockCode: true, market: true, marketCap: true, isAdmin: true, delistedAt: true },
          },
          fund: { select: { name: true, fundUid: true, fundType: true, flags: true } },
        },
      })
    : [];

  // 3. 중복 제거된 관련 회사 목록
  const relatedCorpMap = new Map<string, any>();
  for (const r of personCorps) {
    if (!relatedCorpMap.has(r.corp.id)) {
      relatedCorpMap.set(r.corp.id, { corp: r.corp, relations: [] as any[] });
    }
    relatedCorpMap.get(r.corp.id)!.relations.push({
      type: "person",
      entity: r.person,
      role: r.role,
      description: r.description,
    });
  }
  for (const r of fundCorps) {
    if (!relatedCorpMap.has(r.corp.id)) {
      relatedCorpMap.set(r.corp.id, { corp: r.corp, relations: [] as any[] });
    }
    relatedCorpMap.get(r.corp.id)!.relations.push({
      type: "fund",
      entity: r.fund,
      role: r.relationType,
      description: r.description,
    });
  }

  // 4. 각 회사의 공시 이벤트 조회
  const corpIds = Array.from(relatedCorpMap.keys());
  const filings = corpIds.length > 0
    ? await prisma.filing.findMany({
        where: { corpId: { in: corpIds } },
        orderBy: { filedAt: "desc" },
        include: { corp: { select: { companyName: true, corpCode: true } } },
      })
    : [];

  // 5. 회사별 신호 점수
  const signals = corpIds.length > 0
    ? await prisma.signal.findMany({
        where: { corpId: { in: corpIds } },
        orderBy: { firedAt: "desc" },
      })
    : [];

  // 6. 데이터 집계
  const reportCorps = Array.from(relatedCorpMap.values()).map((entry) => {
    const corpFilings = filings.filter((f) => f.corpId === entry.corp.id);
    const corpSignals = signals.filter((s) => s.corpId === entry.corp.id);

    // CB/BW 관련 공시 필터
    const cbFilings = corpFilings.filter((f) =>
      ["CB_ISSUANCE", "BW_ISSUANCE", "CB_REFIX_DOWN", "CB_ACQUIRE", "CB_SELL", "CB_CALL_OPTION"].includes(f.filingType)
    );
    const hasFinancingActivity = cbFilings.length > 0;

    return {
      corp: {
        companyName: entry.corp.companyName,
        corpCode: entry.corp.corpCode,
        stockCode: entry.corp.stockCode,
        market: entry.corp.market,
        marketCap: entry.corp.marketCap,
        isAdmin: entry.corp.isAdmin,
        delistedAt: entry.corp.delistedAt,
      },
      matchedVia: entry.relations,
      totalFilings: corpFilings.length,
      cbFilings: cbFilings.map((f) => ({
        title: f.title,
        type: f.filingType,
        summary: f.summary,
        date: f.filedAt,
        rceptNo: f.rceptNo,
      })),
      signals: corpSignals.map((s) => ({
        ruleName: s.ruleName,
        score: s.score,
        detail: s.detail,
        date: s.firedAt,
      })),
      hasFinancingActivity,
      riskLevel: corpSignals.length > 0
        ? Math.max(...corpSignals.map((s) => s.score))
        : 0,
    };
  });

  // 위험도순 정렬
  reportCorps.sort((a, b) => b.riskLevel - a.riskLevel);

  return NextResponse.json(
    toJSON({
      pinnedItems: items,
      relatedCorps: reportCorps,
      summary: {
        totalPinned: items.length,
        totalRelatedCorps: reportCorps.length,
        corpsWithCB: reportCorps.filter((c) => c.hasFinancingActivity).length,
        highRiskCorps: reportCorps.filter((c) => c.riskLevel >= 0.7).length,
      },
      generatedAt: new Date().toISOString(),
    })
  );
}
