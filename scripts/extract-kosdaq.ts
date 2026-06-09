/**
 * 코스닥 예비 데이터 추출 스크립트
 * 실행: npx tsx scripts/extract-kosdaq.ts
 *
 * 가설: 회사명 변경 + 사업목적 추가 + 소송/경영권 분쟁 → 주가 변동성 증가
 */

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15";
const SPAC_KEYWORDS = ["스팩", "SPAC", "기업인수목적", "제\\d+호스팩", "제\\d+호기업인수목적"];
const OUTPUT_DIR = "data";

interface Stock {
  rank: number;
  name: string;
  code: string;
  price: string;
  change: string;
  changePercent: number;
  volume?: string;
  marketCap?: string;
  marketCapRaw?: number;
}

interface AnomalyFlags {
  hasNameChange: boolean;
  nameChangeDetail?: string;
  hasMajorHolderChange: boolean;
  holderChangeDetail?: string;
  hasPurposeAddition: boolean;
  purposeDetail?: string;
  hasLawsuit: boolean;
  lawsuitDetail?: string;
  hasCB: boolean;
  cbCount: number;
  volatilityScore: number; // 0~100
}

interface StockReport extends Stock {
  flags: AnomalyFlags;
}

async function fetchKosdaqStocks(sortType: string, count: number): Promise<Stock[]> {
  const all: Stock[] = [];
  const pageSize = 50;
  const pages = Math.ceil(count / pageSize);

  for (let page = 1; page <= pages; page++) {
    const url = `https://m.stock.naver.com/api/stocks/marketValue/KOSDAQ?page=${page}&pageSize=${pageSize}&sortType=${sortType}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    const data = await res.json();

    for (let i = 0; i < (data.stocks || []).length; i++) {
      const s = data.stocks[i];
      const name = s.stockName || "";

      // SPAC 필터
      if (SPAC_KEYWORDS.some((kw) => new RegExp(kw, "i").test(name))) continue;

      const marketCapRaw = s.marketValue ? Number(s.marketValue) : 0;
      // 시총 1000억 이상 제외
      if (marketCapRaw >= 100_000_000_000) continue;

      const changePercent = s.fluctuationsRatio ? parseFloat(s.fluctuationsRatio) : 0;
      const changeAbs = s.compareToPreviousClosePrice || "";

      all.push({
        rank: all.length + 1,
        name,
        code: s.itemCode || "",
        price: s.closePrice || "",
        change: changePercent >= 0
          ? `+${changeAbs} (+${changePercent}%)`
          : `${changeAbs} (${changePercent}%)`,
        changePercent,
        volume: s.accumulatedTradingVolume
          ? Number(s.accumulatedTradingVolume).toLocaleString()
          : undefined,
        marketCap: marketCapRaw ? (marketCapRaw / 1e8).toFixed(0) + "억" : undefined,
        marketCapRaw,
      });

      if (all.length >= count) break;
    }
    if (all.length >= count) break;
  }

  return all;
}

function computeFlags(
  stock: Stock,
  dbEvents: any[],
  dbFilings: any[]
): AnomalyFlags {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const recentEvents = dbEvents.filter(
    (e) => new Date(e.occurredAt) >= oneYearAgo
  );
  const recentFilings = dbFilings.filter(
    (f) => new Date(f.filedAt) >= oneYearAgo
  );

  const hasNameChange = recentEvents.some(
    (e) => e.eventType === "NAME_CHANGE"
  );
  const hasMajorHolderChange = recentFilings.some(
    (f) => f.filingType === "MAJORITY_HOLDER_CHANGE"
  );
  const hasPurposeAddition = recentEvents.some(
    (e) => e.eventType === "PURPOSE_ADDITION"
  ) || recentFilings.some((f) => f.filingType === "PURPOSE_ADDITION");
  const hasLawsuit = recentFilings.some(
    (f) =>
      f.filingType === "LAWSUIT" ||
      f.filingType === "MANAGEMENT_DISPUTE" ||
      f.title?.includes("소송") ||
      f.title?.includes("분쟁") ||
      f.title?.includes("경영권")
  );
  const cbFilings = recentFilings.filter(
    (f) =>
      ["CB_ISSUANCE", "BW_ISSUANCE", "CB_REFIX_DOWN", "CB_SELL"].includes(
        f.filingType
      )
  );

  // 변동성 점수 계산
  let score = 0;
  if (hasNameChange) score += 25;
  if (hasMajorHolderChange) score += 20;
  if (hasPurposeAddition) score += 15;
  if (hasLawsuit) score += 25;
  if (cbFilings.length >= 2) score += 15;
  else if (cbFilings.length === 1) score += 5;

  return {
    hasNameChange,
    nameChangeDetail: recentEvents.find((e) => e.eventType === "NAME_CHANGE")?.detail,
    hasMajorHolderChange,
    holderChangeDetail: recentFilings.find(
      (f) => f.filingType === "MAJORITY_HOLDER_CHANGE"
    )?.summary,
    hasPurposeAddition,
    purposeDetail:
      recentEvents.find((e) => e.eventType === "PURPOSE_ADDITION")?.detail ||
      recentFilings.find((f) => f.filingType === "PURPOSE_ADDITION")?.summary,
    hasLawsuit,
    lawsuitDetail: recentFilings.find(
      (f) =>
        f.filingType === "LAWSUIT" ||
        f.title?.includes("소송") ||
        f.title?.includes("분쟁")
    )?.summary,
    hasCB: cbFilings.length > 0,
    cbCount: cbFilings.length,
    volatilityScore: score,
  };
}

async function main() {
  console.log("📊 코스닥 예비 데이터 추출 시작...\n");

  // 1. Naver에서 주식 데이터 추출
  console.log("1/4 Naver Finance API → 상승 종목 + 인기 종목 + 거래량 상위 추출...");
  const [gainers, marketCapRank, volumeRank] = await Promise.all([
    fetchKosdaqStocks("FLUCTUATION_RATE", 100),
    fetchKosdaqStocks("MARKET_VALUE", 100),
    fetchKosdaqStocks("ACCUMULATED_TRADING_VOLUME", 100),
  ]);

  console.log(`   상승 종목: ${gainers.length}개 (SPAC·시총1000억+ 제외)`);
  console.log(`   인기 종목: ${marketCapRank.length}개`);
  console.log(`   거래량 상위: ${volumeRank.length}개`);

  // 2. 우리 DB에서 이상 징후 데이터 검색
  console.log("\n2/4 DB 검색 → 사명변경·대주주변경·사업목적추가·소송...");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const reports: StockReport[] = [];
  const seen = new Set<string>();

  for (const stock of [...gainers, ...marketCapRank, ...volumeRank]) {
    if (seen.has(stock.code)) continue;
    seen.add(stock.code);

    const corpName = stock.name;
    let dbEvents: any[] = [];
    let dbFilings: any[] = [];

    try {
      const corp = await prisma.corp.findFirst({
        where: { companyName: { contains: corpName, mode: "insensitive" } },
        include: {
          corpEvents: true,
          filings: {
            where: {
              filedAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
            },
          },
        },
      });

      if (corp) {
        dbEvents = corp.corpEvents || [];
        dbFilings = corp.filings || [];
      }
    } catch {}

    const flags = computeFlags(stock, dbEvents, dbFilings);
    reports.push({ ...stock, flags });
  }

  await prisma.$disconnect();

  // 3. 변동성 점수순 정렬
  reports.sort((a, b) => b.flags.volatilityScore - a.flags.volatilityScore);

  console.log(`   총 ${reports.length}개 종목 분석 완료`);
  console.log(`   변동성 점수 >0: ${reports.filter((r) => r.flags.volatilityScore > 0).length}개`);
  console.log(`   사명변경: ${reports.filter((r) => r.flags.hasNameChange).length}개`);
  console.log(`   대주주변경: ${reports.filter((r) => r.flags.hasMajorHolderChange).length}개`);
  console.log(`   사업목적추가: ${reports.filter((r) => r.flags.hasPurposeAddition).length}개`);
  console.log(`   소송/분쟁: ${reports.filter((r) => r.flags.hasLawsuit).length}개`);
  console.log(`   CB 발행: ${reports.filter((r) => r.flags.hasCB).length}개`);

  // 4. JSON 저장
  console.log("\n3/4 JSON 파일 저장...");
  const fs = require("fs");
  const path = require("path");

  const dir = path.join(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 전체 리포트
  fs.writeFileSync(
    path.join(dir, "kosdaq-anomaly-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalStocks: reports.length,
        hypothesis:
          "회사명 변경 + 사업목적 추가 + 소송/경영권 분쟁 → 주가 변동성 증가",
        filters: {
          excludedSPACs: true,
          maxMarketCap: "1,000억원",
        },
        summary: {
          volatilityScoreGt0: reports.filter((r) => r.flags.volatilityScore > 0).length,
          nameChanges: reports.filter((r) => r.flags.hasNameChange).length,
          majorHolderChanges: reports.filter((r) => r.flags.hasMajorHolderChange).length,
          purposeAdditions: reports.filter((r) => r.flags.hasPurposeAddition).length,
          lawsuits: reports.filter((r) => r.flags.hasLawsuit).length,
          cbIssuances: reports.filter((r) => r.flags.hasCB).length,
        },
        stocks: reports,
      },
      null,
      2
    ),
    "utf-8"
  );

  // 하위 집합
  const subsets = {
    "name-changes": reports.filter((r) => r.flags.hasNameChange),
    "major-holder-changes": reports.filter((r) => r.flags.hasMajorHolderChange),
    "purpose-additions": reports.filter((r) => r.flags.hasPurposeAddition),
    lawsuits: reports.filter((r) => r.flags.hasLawsuit),
    "cb-issuances": reports.filter((r) => r.flags.hasCB),
    "high-volatility": reports.filter((r) => r.flags.volatilityScore >= 30),
  };

  for (const [key, subset] of Object.entries(subsets)) {
    fs.writeFileSync(
      path.join(dir, `kosdaq-${key}.json`),
      JSON.stringify(subset, null, 2),
      "utf-8"
    );
  }

  console.log("   ✅ data/ 디렉토리에 저장 완료:");
  console.log("      kosdaq-anomaly-report.json (전체)");
  console.log("      kosdaq-name-changes.json (사명변경)");
  console.log("      kosdaq-major-holder-changes.json (대주주변경)");
  console.log("      kosdaq-purpose-additions.json (사업목적추가)");
  console.log("      kosdaq-lawsuits.json (소송/분쟁)");
  console.log("      kosdaq-cb-issuances.json (CB 발행)");
  console.log("      kosdaq-high-volatility.json (고변동성 ≥30)");

  // 5. 가설 검증 데이터
  console.log("\n4/4 가설 검증 데이터:");
  const highVol = reports.filter((r) => r.flags.volatilityScore >= 30);
  const avgChangeHighVol =
    highVol.length > 0
      ? (
          highVol.reduce((sum, r) => sum + Math.abs(r.changePercent), 0) / highVol.length
        ).toFixed(2)
      : "0";
  const avgChangeAll =
    reports.length > 0
      ? (
          reports.reduce((sum, r) => sum + Math.abs(r.changePercent), 0) / reports.length
        ).toFixed(2)
      : "0";

  console.log(`   고변동성 그룹(${highVol.length}개) 평균 변동폭: ${avgChangeHighVol}%`);
  console.log(`   전체 그룹(${reports.length}개) 평균 변동폭: ${avgChangeAll}%`);
  console.log("");

  if (highVol.length > 0) {
    console.log("   ⚠️ 고변동성 종목 Top 10:");
    highVol.slice(0, 10).forEach((r, i) => {
      console.log(
        `   ${i + 1}. ${r.name} (시총 ${r.marketCap}, 변동 ${r.changePercent}%, 점수 ${r.flags.volatilityScore})`
      );
      const flags: string[] = [];
      if (r.flags.hasNameChange) flags.push("사명변경");
      if (r.flags.hasMajorHolderChange) flags.push("대주주변경");
      if (r.flags.hasPurposeAddition) flags.push("사업목적추가");
      if (r.flags.hasLawsuit) flags.push("소송/분쟁");
      if (r.flags.hasCB) flags.push(`CB ${r.flags.cbCount}회`);
      if (flags.length > 0) console.log(`      → ${flags.join(", ")}`);
    });
  }
}

main().catch(console.error);
