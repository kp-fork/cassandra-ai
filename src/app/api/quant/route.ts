/**
 * 퀀트 대시보드 실시간 API
 * - ARDS-X: QQQ 실데이터로 레짐 판단
 * - AMQS: NVDA/AMD/QCOM/ASML/AVGO/MU/TSM 모멘텀 계산
 * - ARDS: 레짐 기반 헤지 비중 산출
 * - 캐시: 30분 (미장 중) / 2시간 (마감 후)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";
import {
  calculateRegime, calculateMomentum, momentumSignal,
  calculateHedgeWeight, calculateRSI, calculateMA,
} from "@/lib/quant-calc";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const CACHE_KEY = "quant:realtime";

// AMQS-M7 구성 종목
const AMQS_M7 = [
  { ticker: "NVDA", name: "엔비디아",     emoji: "🟢" },
  { ticker: "AVGO", name: "브로드컴",     emoji: "🔵" },
  { ticker: "AMD",  name: "AMD",          emoji: "🔴" },
  { ticker: "QCOM", name: "퀄컴",         emoji: "🟡" },
  { ticker: "ASML", name: "ASML",         emoji: "🟠" },
  { ticker: "MU",   name: "마이크론",     emoji: "🟣" },
  { ticker: "TSM",  name: "TSMC",         emoji: "⚪" },
];

// ─── Yahoo Finance fetch ───
async function fetchBars(symbol: string, range = "3mo") {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`fetch failed: ${symbol}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`no data: ${symbol}`);

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators.quote[0];
  return timestamps.map((t, i) => ({
    date:   new Date(t * 1000).toISOString().slice(0, 10),
    close:  q.close?.[i]  ?? null,
    volume: q.volume?.[i] ?? null,
    high:   q.high?.[i]   ?? null,
    low:    q.low?.[i]    ?? null,
  })).filter(b => b.close !== null);
}

// ─── ARDS-X: QQQ 기반 레짐 계산 ───
function computeArdsX(bars: any[], vixBars: any[]) {
  const closes  = bars.map(b => b.close as number);
  const volumes = bars.map(b => b.volume as number).filter(Boolean);

  const ma20 = calculateMA(closes, 20);
  const ma60 = calculateMA(closes, 60);
  const rsi  = calculateRSI(closes, 14);
  const cur  = closes[closes.length - 1];
  const volSMA = volumes.length >= 20
    ? volumes.slice(-20).reduce((s, v) => s + v, 0) / 20 : 0;
  const curVol = volumes[volumes.length - 1] ?? 0;

  // VIX 현재값
  const vix = vixBars.length
    ? (vixBars[vixBars.length - 1].close ?? 20) : 20;

  const regime = calculateRegime(cur, ma20, ma60, rsi, curVol, volSMA, vix);

  // 레짐 히스토리: 최근 20일 각각 계산
  const history = bars.slice(-20).map((b, i) => {
    const idx = bars.length - 20 + i;
    const slicedCloses = closes.slice(0, idx + 1);
    if (slicedCloses.length < 20) return null;
    const hMa20   = calculateMA(slicedCloses, 20);
    const hMa60   = calculateMA(slicedCloses, Math.min(60, slicedCloses.length));
    const hRsi    = calculateRSI(slicedCloses, 14);
    const hVix    = vixBars[i]?.close ?? vix;
    const hVol    = bars[idx].volume ?? 0;
    const hVolSMA = volumes.slice(Math.max(0, idx - 20), idx).reduce((s, v) => s + v, 0) / 20 || 1;
    const r       = calculateRegime(slicedCloses.at(-1)!, hMa20, hMa60, hRsi, hVol, hVolSMA, hVix);
    return { date: b.date, regime: r.regime, label: r.label };
  }).filter(Boolean);

  const drawdown20 = (() => {
    const slice = bars.slice(-20);
    const h = Math.max(...slice.map(b => b.high ?? b.close));
    return ((cur - h) / h) * 100;
  })();

  return { ...regime, vix: Math.round(vix * 10) / 10, ma20, ma60, rsi, drawdown20, history };
}

// ─── AMQS: 종목별 모멘텀 계산 ───
function computeAMQS(stockBarsMap: Record<string, any[]>) {
  const stocks = AMQS_M7.map(({ ticker, name, emoji }) => {
    const bars = stockBarsMap[ticker];
    if (!bars || bars.length < 21) {
      return { ticker, name, emoji, price: null, change1d: null, momentum20: null, signal: "—" as any, score: 0 };
    }
    const closes = bars.map(b => b.close as number);
    const last  = closes.at(-1)!;
    const prev  = closes.at(-2)!;
    const mom20 = calculateMomentum(closes, 20);
    const rsi   = calculateRSI(closes, 14);
    const sig   = momentumSignal(mom20);

    // 종합 점수 (-100 ~ +100)
    let score = 0;
    if (mom20 > 15)  score += 40;
    else if (mom20 > 5) score += 20;
    else if (mom20 < -15) score -= 40;
    else if (mom20 < -5)  score -= 20;
    if (rsi > 60) score += 20;
    else if (rsi < 40) score -= 20;
    if (last > calculateMA(closes, 50)) score += 20;
    else score -= 20;

    return {
      ticker, name, emoji,
      price:      Math.round(last * 100) / 100,
      change1d:   Math.round(((last - prev) / prev) * 10000) / 100,
      momentum20: Math.round(mom20 * 100) / 100,
      rsi:        Math.round(rsi),
      signal:     sig,
      score:      Math.max(-100, Math.min(100, score)),
    };
  });

  // 전략 모멘텀 히스토리 (QQQ 기준 — 개별 종목 평균으로 근사)
  const validStocks = stocks.filter(s => s.momentum20 !== null);
  const avgMom = validStocks.length
    ? validStocks.reduce((s, st) => s + (st.momentum20 ?? 0), 0) / validStocks.length : 0;
  const avgScore = validStocks.length
    ? validStocks.reduce((s, st) => s + st.score, 0) / validStocks.length : 0;
  const overallSignal = momentumSignal(avgMom);

  // 히스토리: 첫 종목(NVDA) 기준으로 20일치
  const nvdaBars = stockBarsMap["NVDA"] ?? [];
  const history = nvdaBars.slice(-20).map((b: any, i: number) => {
    const sliced = nvdaBars.slice(0, nvdaBars.length - 20 + i + 1).map((x: any) => x.close as number);
    const mom = calculateMomentum(sliced, Math.min(20, sliced.length));
    return { date: b.date, amqs: Math.round(mom * 10) / 10 };
  });

  return { stocks, avgMom, avgScore, overallSignal, history };
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true"
             || req.nextUrl.searchParams.get("refresh") === "1";

  if (!force) {
    const cached = await getCache(CACHE_KEY);
    if (cached && !cached.stale) {
      return NextResponse.json({ ...cached.data, fromCache: true, cachedSecondsAgo: cached.age });
    }
  }

  try {
    // 병렬 fetch: QQQ(3mo), VIX(1mo), AMQS-M7 종목들(3mo)
    const allTickers = ["QQQ", "^VIX", ...AMQS_M7.map(s => s.ticker)];
    const results = await Promise.allSettled(allTickers.map(t => fetchBars(t, "3mo")));

    const barsMap: Record<string, any[]> = {};
    allTickers.forEach((sym, i) => {
      const r = results[i];
      if (r.status === "fulfilled") barsMap[sym] = r.value;
    });

    const qqqBars = barsMap["QQQ"] ?? [];
    const vixBars = barsMap["^VIX"] ?? [];

    // ARDS-X
    const ardsX = qqqBars.length >= 20
      ? computeArdsX(qqqBars, vixBars)
      : { regime: 1, label: "횡보", signal: "HOLD", vix: 20, ma20: 0, ma60: 0, rsi: 50, drawdown20: 0, history: [] };

    // AMQS
    const stockBarsMap: Record<string, any[]> = {};
    AMQS_M7.forEach(({ ticker }) => { if (barsMap[ticker]) stockBarsMap[ticker] = barsMap[ticker]; });
    const amqs = computeAMQS(stockBarsMap);

    // ARDS 헤지 비중
    const hedge = calculateHedgeWeight(ardsX.regime);

    const payload = {
      generatedAt: new Date().toISOString(),
      ardsX,
      amqs,
      hedge,
      fromCache: false,
    };

    // 캐시 TTL: 시장 시간(14-21 UTC)이면 30분, 아니면 2시간
    const h = new Date().getUTCHours();
    const isMarketHours = h >= 14 && h <= 21;
    await setCache(CACHE_KEY, payload, isMarketHours ? 1800 : 7200);

    return NextResponse.json(payload);
  } catch (e: any) {
    const stale = await getCache(CACHE_KEY);
    if (stale) return NextResponse.json({ ...stale.data, fromCache: true, stale: true, error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
