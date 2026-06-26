/**
 * KOSDAQ 시장 데이터 — Toss 증권 Open API
 * (구 Naver Finance 크롤러 대체)
 */
import { prisma } from "./prisma";

export interface StockItem {
  rank: number;
  name: string;
  code: string;
  price: string;
  change: string;
  changePercent: number;
  volume?: string;
  marketCap?: string;
}

export interface MarketData {
  category: string;
  stocks: StockItem[];
  stats: {
    avgChangePercent: number;
    gainerCount: number;
    loserCount: number;
    neutralCount: number;
  };
}

// KOSDAQ 인기 종목 — Toss 기반 시장 심리 프록시
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
];

const TOSS_BASE = "https://openapi.tossinvest.com";
let _cachedToken: { token: string; expiry: number } | null = null;

async function getTossToken(): Promise<string | null> {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (_cachedToken && Date.now() < _cachedToken.expiry) return _cachedToken.token;

  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  }).catch(() => null);

  if (!res?.ok) return null;
  const d = await res.json();
  _cachedToken = { token: d.access_token, expiry: Date.now() + (d.expires_in - 3600) * 1000 };
  return _cachedToken.token;
}

async function batchPrices(symbols: string[]): Promise<Record<string, number>> {
  const token = await getTossToken();
  if (!token) return {};

  const url = new URL(`${TOSS_BASE}/api/v1/prices`);
  url.searchParams.set("symbols", symbols.join(","));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  if (!res?.ok) return {};
  const data = await res.json();
  const map: Record<string, number> = {};
  for (const item of (data.result ?? [])) map[item.symbol] = parseFloat(item.lastPrice) || 0;
  return map;
}

async function prevClose(symbol: string, token: string): Promise<number> {
  const url = new URL(`${TOSS_BASE}/api/v1/candles`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("count", "2");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);

  if (!res?.ok) return 0;
  const data = await res.json();
  const candles = data.result?.candles ?? [];
  return candles.length >= 2 ? parseFloat(candles[1].closePrice) || 0 : 0;
}

function computeStats(stocks: StockItem[]) {
  let sum = 0, gainers = 0, losers = 0, neutral = 0, count = 0;
  for (const s of stocks) {
    if (!isNaN(s.changePercent)) {
      sum += s.changePercent; count++;
      if (s.changePercent > 1) gainers++;
      else if (s.changePercent < -1) losers++;
      else neutral++;
    }
  }
  return { avgChangePercent: count > 0 ? +(sum / count).toFixed(2) : 0, gainerCount: gainers, loserCount: losers, neutralCount: neutral };
}

export async function scrapeNaverFinance(): Promise<MarketData[]> {
  const token = await getTossToken();

  // 현재가 배치 조회
  const symbols = KOSDAQ_UNIVERSE.map(s => s.code);
  const curPrices = await batchPrices(symbols);

  // 전일 종가 — concurrency 8
  const prevPrices: number[] = [];
  if (token) {
    const CONCURRENCY = 8;
    for (let i = 0; i < symbols.length; i += CONCURRENCY) {
      const batch = symbols.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(s => prevClose(s, token)));
      prevPrices.push(...results);
    }
  }

  const items: StockItem[] = KOSDAQ_UNIVERSE.map((s, i) => {
    const cur = curPrices[s.code] ?? 0;
    const prev = prevPrices[i] ?? 0;
    const changePct = cur > 0 && prev > 0 ? parseFloat(((cur - prev) / prev * 100).toFixed(2)) : 0;
    const changeAbs = cur > 0 && prev > 0 ? (cur - prev) : 0;

    return {
      rank: i + 1,
      name: s.name,
      code: s.code,
      price: cur > 0 ? cur.toLocaleString() : "-",
      change: changeAbs >= 0 ? `+${changeAbs.toFixed(0)}` : `${changeAbs.toFixed(0)}`,
      changePercent: changePct,
    };
  }).filter(s => s.price !== "-");

  // 정렬 버전 생성
  const byGain = [...items].sort((a, b) => b.changePercent - a.changePercent).slice(0, 20).map((s, i) => ({ ...s, rank: i + 1 }));
  const byLoss = [...items].sort((a, b) => a.changePercent - b.changePercent).slice(0, 20).map((s, i) => ({ ...s, rank: i + 1 }));

  const results: MarketData[] = [
    { category: "TOP_MARKET_CAP", stocks: items.slice(0, 20), stats: computeStats(items.slice(0, 20)) },
    { category: "TOP_VOLUME", stocks: items.slice(0, 20), stats: computeStats(items.slice(0, 20)) },
    { category: "TOP_GAINERS", stocks: byGain, stats: computeStats(byGain) },
    { category: "TOP_LOSERS", stocks: byLoss, stats: computeStats(byLoss) },
  ];

  // DB 스냅샷 저장 (선택적)
  try {
    for (const d of results) {
      await prisma.marketSnapshot.create({
        data: JSON.parse(JSON.stringify({ category: d.category, data: d.stocks, stats: d.stats })),
      });
    }
  } catch {
    // DB 저장 실패해도 데이터는 반환
  }

  return results;
}
