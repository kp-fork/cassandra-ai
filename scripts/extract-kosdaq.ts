/**
 * 코스닥 예비 데이터 추출 스크립트
 * 실행: npx tsx scripts/extract-kosdaq.ts
 * 필요: .env 에 DART_API_KEY 설정
 *
 * 가설: 회사명 변경 + 사업목적 추가 + 소송/경영권 분쟁 → 주가 변동성 증가
 */

import * as fs from "fs";
import * as path from "path";

// .env 파일에서 DART_API_KEY 읽기
function getDartApiKey(): string {
  const envPath = path.join(__dirname, "..", ".env");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/DART_API_KEY=(.+)/);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

const DART_API_KEY = getDartApiKey();
const DART_BASE = "https://opendart.fss.or.kr/api";

import "dotenv/config";

const SPAC_KEYWORDS = ["스팩", "SPAC", "기업인수목적", "제\\d+호스팩", "제\\d+호기업인수목적"];
const OUTPUT_DIR = "data";
const TOSS_BASE = "https://openapi.tossinvest.com";

// KOSDAQ 대표 종목 — Toss API 기반 (시총순)
const KOSDAQ_UNIVERSE: { code: string; name: string }[] = [
  { code: "005930", name: "삼성전자" }, { code: "000660", name: "SK하이닉스" },
  { code: "035420", name: "NAVER" }, { code: "035720", name: "카카오" },
  { code: "207940", name: "삼성바이오로직스" }, { code: "068270", name: "셀트리온" },
  { code: "005380", name: "현대차" }, { code: "000270", name: "기아" },
  { code: "051910", name: "LG화학" }, { code: "373220", name: "LG에너지솔루션" },
  { code: "006400", name: "삼성SDI" }, { code: "012330", name: "현대모비스" },
  { code: "042700", name: "한미반도체" }, { code: "247540", name: "에코프로비엠" },
  { code: "036570", name: "엔씨소프트" }, { code: "086900", name: "메디톡스" },
  { code: "112040", name: "위메이드" }, { code: "041510", name: "에스엠" },
  { code: "064350", name: "현대로템" }, { code: "145020", name: "휴젤" },
  { code: "095660", name: "네오위즈" }, { code: "263750", name: "펄어비스" },
  { code: "259960", name: "크래프톤" }, { code: "357780", name: "솔브레인" },
  { code: "017670", name: "SK텔레콤" }, { code: "032640", name: "LG유플러스" },
  { code: "011200", name: "HMM" }, { code: "028260", name: "삼성물산" },
  { code: "010120", name: "LS ELECTRIC" }, { code: "014680", name: "한솔케미칼" },
  { code: "091990", name: "셀트리온헬스케어" }, { code: "323410", name: "카카오뱅크" },
  { code: "377300", name: "카카오페이" }, { code: "009150", name: "삼성전기" },
  { code: "096770", name: "SK이노베이션" }, { code: "011070", name: "LG이노텍" },
  { code: "034730", name: "SK" }, { code: "000810", name: "삼성화재" },
  { code: "316140", name: "우리금융지주" }, { code: "055550", name: "신한지주" },
  { code: "086280", name: "현대글로비스" }, { code: "000100", name: "유한양행" },
  { code: "090430", name: "아모레퍼시픽" }, { code: "139480", name: "이마트" },
  { code: "035250", name: "강원랜드" }, { code: "021240", name: "코웨이" },
  { code: "047050", name: "포스코인터내셔널" }, { code: "024110", name: "기업은행" },
  { code: "138930", name: "BNK금융지주" }, { code: "030200", name: "KT" },
];

let _tossTokenCache: { token: string; expiry: number } | null = null;

async function getTossToken(): Promise<string | null> {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) { console.warn("   ⚠️ TOSS_CLIENT_ID/SECRET 미설정"); return null; }

  if (_tossTokenCache && Date.now() < _tossTokenCache.expiry) return _tossTokenCache.token;

  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  }).catch(() => null);

  if (!res?.ok) { console.warn("   ⚠️ Toss 토큰 발급 실패"); return null; }
  const d = await res.json();
  _tossTokenCache = { token: d.access_token, expiry: Date.now() + (d.expires_in - 3600) * 1000 };
  return _tossTokenCache.token;
}

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

// Toss API 배치 현재가
async function tossBatchPrices(symbols: string[], token: string): Promise<Record<string, number>> {
  const url = new URL(`${TOSS_BASE}/api/v1/prices`);
  url.searchParams.set("symbols", symbols.join(","));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);

  if (!res?.ok) return {};
  const data = await res.json();
  const map: Record<string, number> = {};
  for (const item of (data.result ?? [])) map[item.symbol] = parseFloat(item.lastPrice) || 0;
  return map;
}

// Toss API 전일 종가 (2일 캔들)
async function tossPrevClose(symbol: string, token: string): Promise<number> {
  const url = new URL(`${TOSS_BASE}/api/v1/candles`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("count", "2");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);

  if (!res?.ok) return 0;
  const d = await res.json();
  const candles = d.result?.candles ?? [];
  return candles.length >= 2 ? parseFloat(candles[1].closePrice) || 0 : 0;
}

// Toss API 기반 KOSDAQ 종목 가격 조회 (Naver 대체)
async function fetchKosdaqStocks(sortType: string, count: number): Promise<Stock[]> {
  const token = await getTossToken();
  if (!token) {
    console.warn("   ⚠️ Toss 토큰 없음 — 빈 목록 반환");
    return [];
  }

  const symbols = KOSDAQ_UNIVERSE.map(s => s.code);

  // 현재가 배치 + 전일 종가 병렬
  const [curPrices, ...prevPrices] = await Promise.all([
    tossBatchPrices(symbols, token),
    ...symbols.map(s => tossPrevClose(s, token)),
  ]);

  const stocks: Stock[] = KOSDAQ_UNIVERSE.map((s, i) => {
    const cur = curPrices[s.code] ?? 0;
    const prev = prevPrices[i] ?? 0;
    if (!cur) return null;

    const changePct = cur > 0 && prev > 0 ? parseFloat(((cur - prev) / prev * 100).toFixed(2)) : 0;
    const changeAbs = cur > 0 && prev > 0 ? (cur - prev) : 0;

    return {
      rank: 0,
      name: s.name,
      code: s.code,
      price: cur.toLocaleString(),
      change: changePct >= 0
        ? `+${changeAbs.toFixed(0)} (+${changePct}%)`
        : `${changeAbs.toFixed(0)} (${changePct}%)`,
      changePercent: changePct,
    } as Stock;
  }).filter((s): s is Stock => s !== null);

  // 요청 sortType에 맞게 정렬
  let sorted: Stock[];
  if (sortType === "FLUCTUATION_RATE") {
    sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
  } else {
    sorted = stocks; // MARKET_VALUE, VOLUME: 기본 순서 (universe 순)
  }

  return sorted.slice(0, count).map((s, i) => ({ ...s, rank: i + 1 }));
}

// DART corp_code 매핑 로드
let dartCorpMap: Map<string, string> = new Map();
try {
  const mapPath = path.join(__dirname, "..", "data", "dart-corp-codes.json");
  if (fs.existsSync(mapPath)) {
    const mapData: { corp_code: string; name: string; stock_code: string }[] =
      JSON.parse(fs.readFileSync(mapPath, "utf-8"));
    for (const item of mapData) dartCorpMap.set(item.stock_code, item.corp_code);
  }
} catch {}

// DART API: stock_code → corp_code → 12개월 공시 검색
async function searchDartDisclosures(stockCode: string): Promise<any[]> {
  if (!DART_API_KEY) return [];
  const corpCode = dartCorpMap.get(stockCode);
  if (!corpCode) return [];

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const bgnDe = oneYearAgo.toISOString().slice(0, 10).replace(/-/g, "");
  const endDe = today.toISOString().slice(0, 10).replace(/-/g, "");

  const results: any[] = [];
  for (const pblntfTy of ["B", "F", "I"]) {
    try {
      const url = `${DART_BASE}/list.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_ty=${pblntfTy}&page_count=100`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "000" && data.list) {
        for (const item of data.list) {
          results.push({
            corpName: item.corp_name,
            reportName: item.report_nm,
            rceptNo: item.rcept_no,
            date: item.rcept_dt,
            type: pblntfTy,
          });
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}

// DART 공시에서 이상 징후 검출
function detectAnomaliesFromDart(disclosures: any[]): {
  hasNameChange: boolean; nameChangeDetail?: string;
  hasMajorHolderChange: boolean; holderChangeDetail?: string;
  hasPurposeAddition: boolean; purposeDetail?: string;
  hasLawsuit: boolean; lawsuitDetail?: string;
  hasCB: boolean; cbCount: number;
  hasCapitalChange: boolean;
} {
  const result = {
    hasNameChange: false, nameChangeDetail: undefined as string | undefined,
    hasMajorHolderChange: false, holderChangeDetail: undefined as string | undefined,
    hasPurposeAddition: false, purposeDetail: undefined as string | undefined,
    hasLawsuit: false, lawsuitDetail: undefined as string | undefined,
    hasCB: false, cbCount: 0,
    hasCapitalChange: false,
  };

  for (const d of disclosures) {
    const title = d.reportName || "";

    if (/상호변경|사명변경|회사명\s*변경|명칭변경/.test(title)) {
      result.hasNameChange = true;
      result.nameChangeDetail = title;
    }
    if (/최대주주변경|최대주주\s*변경|경영권\s*양수|경영권\s*인수|대주주/.test(title)) {
      result.hasMajorHolderChange = true;
      result.holderChangeDetail = title;
    }
    if (/사업목적\s*추가|사업다각화|신규사업|정관변경/.test(title)) {
      result.hasPurposeAddition = true;
      result.purposeDetail = title;
    }
    if (/소송|분쟁|경영권|주주총회소집허가|가처분|주주제안|의결권/.test(title)) {
      result.hasLawsuit = true;
      result.lawsuitDetail = title;
    }
    if (/전환사채|신주인수권|CB|BW|사채권|사채/.test(title)) {
      result.cbCount++;
    }
    if (/유상증자|무상증자|유무상증자|주식병합|액면분할|감자/.test(title)) {
      result.hasCapitalChange = true;
    }
  }

  result.hasCB = result.cbCount > 0;
  return result;
}

function computeFlags(
  stock: Stock,
  dbEvents: any[],
  dbFilings: any[],
  dartFlags: any = {}
): AnomalyFlags {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const recentEvents = dbEvents.filter((e) => new Date(e.occurredAt) >= oneYearAgo);
  const recentFilings = dbFilings.filter((f) => new Date(f.filedAt) >= oneYearAgo);

  // DB + DART API 병합
  const hasNameChange = dartFlags.hasNameChange || recentEvents.some((e) => e.eventType === "NAME_CHANGE");
  const hasMajorHolderChange = dartFlags.hasMajorHolderChange || recentFilings.some((f) => f.filingType === "MAJORITY_HOLDER_CHANGE");
  const hasPurposeAddition = dartFlags.hasPurposeAddition || recentEvents.some((e) => e.eventType === "PURPOSE_ADDITION");
  const hasLawsuit = dartFlags.hasLawsuit || recentFilings.some((f) => f.title?.includes("소송") || f.title?.includes("분쟁"));
  const cbCount = Math.max(
    dartFlags.cbCount || 0,
    recentFilings.filter((f) => ["CB_ISSUANCE","BW_ISSUANCE","CB_REFIX_DOWN","CB_SELL"].includes(f.filingType)).length
  );

  let score = 0;
  if (hasNameChange) score += 25;
  if (hasMajorHolderChange) score += 20;
  if (hasPurposeAddition) score += 15;
  if (hasLawsuit) score += 25;
  if (dartFlags.hasCapitalChange) score += 10;
  if (cbCount >= 2) score += 15;
  else if (cbCount >= 1) score += 5;

  return {
    hasNameChange,
    nameChangeDetail: dartFlags.nameChangeDetail || recentEvents.find((e) => e.eventType === "NAME_CHANGE")?.detail,
    hasMajorHolderChange,
    holderChangeDetail: dartFlags.holderChangeDetail || recentFilings.find((f) => f.filingType === "MAJORITY_HOLDER_CHANGE")?.summary,
    hasPurposeAddition,
    purposeDetail: dartFlags.purposeDetail || recentEvents.find((e) => e.eventType === "PURPOSE_ADDITION")?.detail,
    hasLawsuit,
    lawsuitDetail: dartFlags.lawsuitDetail || recentFilings.find((f) => f.title?.includes("소송") || f.title?.includes("분쟁"))?.summary,
    hasCB: cbCount > 0,
    cbCount,
    volatilityScore: score,
  };
}

async function main() {
  console.log("📊 코스닥 예비 데이터 추출 시작...\n");

  // 1. Toss 증권 Open API → 상승 종목 + 인기 종목 + 거래량 상위 추출
  console.log("1/4 Toss 증권 Open API → 상승 종목 + 시장 데이터 추출...");
  const [gainers, volumeRank] = await Promise.all([
    fetchKosdaqStocks("FLUCTUATION_RATE", 100),
    fetchKosdaqStocks("ACCUMULATED_TRADING_VOLUME", 100),
  ]);

  const marketCapRank = await fetchKosdaqStocks("MARKET_VALUE", 100);

  console.log(`   상승 종목: ${gainers.length}개`);
  console.log(`   시총 하위: ${marketCapRank.length}개`);
  console.log(`   거래량 상위: ${volumeRank.length}개`);

  // 2. DART API + DB 검색
  console.log("\n2/4 DART API + DB 검색 → 사명변경·대주주변경·사업목적추가·소송...");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const reports: StockReport[] = [];
  const seen = new Set<string>();
  let dartCalls = 0;

  // 상위 50개만 DART 검색 (rate limit 고려)
  const priorityStocks = [...gainers.slice(0, 20), ...marketCapRank.slice(0, 20), ...volumeRank.slice(0, 20)];
  const uniquePriority = new Map<string, Stock>();
  for (const s of priorityStocks) {
    if (!uniquePriority.has(s.code)) uniquePriority.set(s.code, s);
  }

  for (const stock of uniquePriority.values()) {
    if (seen.has(stock.code)) continue;
    seen.add(stock.code);

    let dartDisclosures: any[] = [];
    if (DART_API_KEY) {
      dartDisclosures = await searchDartDisclosures(stock.code);
      dartCalls++;
    }

    const dartFlags = detectAnomaliesFromDart(dartDisclosures);

    // DB 데이터도 병합
    let dbEvents: any[] = [];
    let dbFilings: any[] = [];
    try {
      const corp = await prisma.corp.findFirst({
        where: { companyName: { contains: stock.name.slice(0, 3), mode: "insensitive" } },
        include: {
          corpEvents: true,
          filings: { where: { filedAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
        },
      });
      if (corp) { dbEvents = corp.corpEvents || []; dbFilings = corp.filings || []; }
    } catch {}

    const flags = computeFlags(stock, dbEvents, dbFilings, dartFlags);
    reports.push({ ...stock, flags });
  }

  // 나머지 종목은 DB만 검색
  for (const stock of [...gainers, ...marketCapRank, ...volumeRank]) {
    if (seen.has(stock.code)) continue;
    seen.add(stock.code);
    const flags = computeFlags(stock, [], [], {});
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
          maxMarketCap: "5,000억원",
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
