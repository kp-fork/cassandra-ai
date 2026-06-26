/**
 * 퀀트 대시보드 데이터 API (Redis 10분 캐시)
 * KOSDAQ 시장 심리: Toss 증권 Open API (KR 종목 대표 30개 등락 기반)
 * US 주요 종목: Yahoo Finance v8 (이미 /api/quant 에서 사용 중)
 * 새로고침: ?force=true → 캐시 무시
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const Q_CACHE_KEY = "quant:data:v2";
const Q_CACHE_TTL = 600; // 10분

// KOSDAQ 대표 30 종목 (코스닥 시장 심리 프록시)
const KOSDAQ_GAUGE_STOCKS = [
  "005930", "000660", "035420", "035720", "207940",
  "068270", "005380", "000270", "051910", "373220",
  "006400", "012330", "042700", "247540", "036570",
  "011200", "028260", "010120", "014680", "086900",
  "112040", "041510", "064350", "145020", "095660",
  "263750", "259960", "357780", "017670", "032640",
];

// US 주요 종목
const US_STOCKS = [
  { code: "NVDA", name: "엔비디아" },
  { code: "AAPL", name: "애플" },
  { code: "MSFT", name: "마이크로소프트" },
  { code: "TSLA", name: "테슬라" },
  { code: "META", name: "메타" },
  { code: "AMZN", name: "아마존" },
];

interface StockData {
  name: string; code: string; price: string; change: string; changePercent: number;
}

// ─── Toss Open API helper ───
const TOSS_BASE = "https://openapi.tossinvest.com";
let tossToken: { token: string; expiry: number } | null = null;

async function getTossToken(): Promise<string | null> {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tossToken && Date.now() < tossToken.expiry) return tossToken.token;

  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!res?.ok) return null;
  const d = await res.json();
  tossToken = { token: d.access_token, expiry: Date.now() + (d.expires_in - 3600) * 1000 };
  return tossToken.token;
}

async function tossBatchPrices(symbols: string[]): Promise<Record<string, number>> {
  const token = await getTossToken();
  if (!token) return {};

  const url = new URL(`${TOSS_BASE}/api/v1/prices`);
  url.searchParams.set("symbols", symbols.join(","));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!res?.ok) return {};
  const data = await res.json();
  const map: Record<string, number> = {};
  for (const item of (data.result ?? [])) {
    map[item.symbol] = parseFloat(item.lastPrice) || 0;
  }
  return map;
}

async function tossCandle(symbol: string): Promise<number> {
  const token = await getTossToken();
  if (!token) return 0;

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
  if (candles.length >= 2) return parseFloat(candles[1].closePrice) || 0; // 전일 종가
  return 0;
}

// ─── Yahoo Finance (US 종목) ───
async function fetchYahooPrice(ticker: string): Promise<{ price: string; change: string; changePct: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 0 },
  }).catch(() => null);

  if (!res?.ok) return { price: "-", change: "0", changePct: 0 };
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) return { price: "-", change: "0", changePct: 0 };

  const closes: number[] = (result.indicators.quote[0].close ?? []).filter((v: number | null) => v != null);
  if (closes.length < 2) return { price: closes[0]?.toFixed(2) ?? "-", change: "0", changePct: 0 };

  const cur = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const pct = prev > 0 ? (cur - prev) / prev * 100 : 0;
  const diff = cur - prev;

  return {
    price: cur.toFixed(2),
    change: (diff >= 0 ? "+" : "") + diff.toFixed(2),
    changePct: parseFloat(pct.toFixed(2)),
  };
}

async function fetchAllData() {
  // 1. KOSDAQ 시장 심리 — Toss API 배치 가격 + 전일 종가로 등락 계산
  let fearGauge = 50, neutralGauge = 30, greedGauge = 20;

  try {
    const [curPrices, prevPrices] = await Promise.all([
      tossBatchPrices(KOSDAQ_GAUGE_STOCKS),
      Promise.all(KOSDAQ_GAUGE_STOCKS.map(s => tossCandle(s))),
    ]);

    let upCount = 0, downCount = 0, neutral = 0;
    KOSDAQ_GAUGE_STOCKS.forEach((sym, i) => {
      const cur = curPrices[sym] ?? 0;
      const prev = prevPrices[i] ?? 0;
      if (cur > 0 && prev > 0) {
        const pct = (cur - prev) / prev * 100;
        if (pct > 0.5) upCount++;
        else if (pct < -0.5) downCount++;
        else neutral++;
      }
    });

    const total = upCount + downCount + neutral || 1;
    fearGauge = Math.round((downCount / total) * 100);
    greedGauge = Math.round((upCount / total) * 100);
    neutralGauge = 100 - fearGauge - greedGauge;
  } catch {
    // Toss unavailable → keep defaults
  }

  // 2. US 주요 종목 — Yahoo Finance
  const stockResults = await Promise.allSettled(
    US_STOCKS.map(async (item) => {
      const { price, change, changePct } = await fetchYahooPrice(item.code);
      return { name: item.name, code: item.code, price, change, changePercent: changePct } as StockData;
    })
  );
  const stocks = stockResults
    .filter((r): r is PromiseFulfilledResult<StockData> => r.status === "fulfilled")
    .map(r => r.value);

  return { marketGauge: { fear: fearGauge, neutral: neutralGauge, greed: greedGauge }, stocks };
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!force) {
    const cached = await getCache(Q_CACHE_KEY);
    if (cached && !cached.stale) {
      return NextResponse.json({ ...cached.data, fromCache: true, cachedSecondsAgo: cached.age });
    }
  }

  try {
    const fresh = await fetchAllData();
    const payload = { generatedAt: new Date().toISOString(), fromCache: false, ...fresh, totalAnalyzed: 30 };
    await setCache(Q_CACHE_KEY, payload, Q_CACHE_TTL);
    return NextResponse.json(payload);
  } catch {
    const stale = await getCache(Q_CACHE_KEY);
    if (stale) {
      return NextResponse.json({ ...stale.data, fromCache: true, cachedSecondsAgo: stale.age, stale: true });
    }
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      marketGauge: { fear: 35, neutral: 40, greed: 25 },
      stocks: [],
      fromCache: false,
    });
  }
}
