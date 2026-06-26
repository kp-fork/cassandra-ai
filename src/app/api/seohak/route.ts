/**
 * 서학개미 퀀트 API
 * Toss 증권 API (또는 Yahoo Finance 폴백) + DeepSeek V3
 * 전략: Koreans_Love_stock_with_tests.md v2
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";

const CACHE_KEY = "seohak:analysis:v1";
const CACHE_TTL = 3600; // 1h

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

// 서학개미 감시 종목
const WATCHLIST = [
  { ticker: "MU",    name: "마이크론",   macro: "메모리수혜",   crowding: ["거래대금", "검색"] },
  { ticker: "NVDA",  name: "엔비디아",   macro: "메모리수혜(간접)", crowding: ["거래량", "거래대금", "검색"] },
  { ticker: "SNDK",  name: "샌디스크",   macro: "메모리수혜",   crowding: ["검색"] },
  { ticker: "AAPL",  name: "애플",       macro: "메모리피해",   crowding: ["거래대금"] },
  { ticker: "MSFT",  name: "마이크로소프트", macro: "중립~피해", crowding: ["거래대금", "검색"] },
  { ticker: "AVGO",  name: "브로드컴",   macro: "혼재",         crowding: ["거래대금"] },
  { ticker: "PLTR",  name: "팔란티어",   macro: "소프트피해",   crowding: ["검색"] },
  { ticker: "INTC",  name: "인텔",       macro: "별도서사",     crowding: ["거래량", "거래대금", "검색"] },
  { ticker: "TSLA",  name: "테슬라",     macro: "중립~피해",    crowding: ["거래대금"] },
  { ticker: "GOOGL", name: "알파벳",     macro: "중립~피해",    crowding: ["거래대금"] },
];

// ETF 매핑
const ETF_MAP = [
  { group: "AI/반도체·메모리 코어", tickers: ["NVDA","MU","AVGO","INTC","SNDK"], etf: "SOXX/SMH", alt: "QQQ", reason: "단일 종목 집중 리스크를 섹터 분산으로 희석" },
  { group: "빅테크 플랫폼", tickers: ["MSFT","AAPL","GOOGL"], etf: "XLK", alt: "VOO", reason: "빅테크 3종 동일 서사 노출을 지수로 완화" },
  { group: "AI 소프트", tickers: ["PLTR"], etf: "IYW", alt: "QQQ", reason: "소프트웨어 AI 테마 ETF로 개별주 변동성 완화" },
  { group: "방어 옵션 (분화·금리 국면)", tickers: [], etf: "VOO/BND/TLT/GLD/RSP", alt: "", reason: "분화 국면에선 섹터 ETF 내 +/- 갈림 → 광범위 지수+채권+금 혼합이 유리" },
];

async function fetchYahooCandles(ticker: string): Promise<{
  close: number; changePct: number; high52w: number; low52w: number; prevClose: number;
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Yahoo fetch failed: ${ticker}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No data: ${ticker}`);

  const q = result.indicators.quote[0];
  const closes: number[] = (q.close ?? []).filter((v: number | null) => v != null);
  if (closes.length < 2) throw new Error(`Insufficient data: ${ticker}`);

  const close = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const changePct = prevClose > 0 ? (close - prevClose) / prevClose * 100 : 0;
  const high52w = Math.max(...closes);
  const low52w = Math.min(...closes);

  return { close, changePct, high52w, low52w, prevClose };
}

async function fetchAllPrices() {
  const results = await Promise.allSettled(
    WATCHLIST.map(async (stock) => {
      const data = await fetchYahooCandles(stock.ticker);
      return { ...stock, ...data };
    })
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      ...WATCHLIST[i],
      close: 0, changePct: 0, high52w: 0, low52w: 0, prevClose: 0,
      error: true,
    };
  });
}

function buildPrompt(stocks: ReturnType<typeof buildStockRow>[]) {
  const macroContext = `2026-06 국면: 6/4 브로드컴 가이던스 쇼크 → 6/23 AI 거품 공포 글로벌 동반 매도(코스피 -10%) → 6/24 마이크론 사상 최대 실적·$100B 장기계약으로 칩 트레이드 반등(+15%). 핵심: 무차별 동반 변동이 끝나고 '분화(rotation)' 시작. 칩 하드웨어(+) vs 빅테크/소프트웨어(-) 분화. PCE 3년 최고치로 금리 중력 재등장.`;

  const rows = stocks.map(s =>
    `- ${s.ticker} ~${s.close.toFixed(0)} ${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(1)}% [${s.crowding.join(",")}] 거시포지션:${s.macro}`
  ).join("\n");

  return `# 역할
너는 보수적이고 규율 있는 퀀트 애널리스트다. 화제·서사가 아니라 데이터 구조로 판단한다.
대원칙: "LLM은 엑셀이지 오라클이 아니다." 미래를 단정하지 말고, 모르는 값은 [가정]으로 명시하라.

# 시장 국면 메모
${macroContext}

# 입력 데이터 (${new Date().toISOString().slice(0, 10)} 기준)
각 종목: 티커 | 최근 종가 | 직전 등락% | 랭킹 출현(거래량/거래대금/검색) | 거시포지션
${rows}

# 계산 규칙
1. 군집도(Crowding 0~3) = 등장한 랭킹 개수. 3이면 합의 정점 = 충격 시 출구가 좁다.
2. 착시 플래그: 주가 < $5 AND (거래량 O, 거래대금 X) → "PENNY-CHURN" (분석 제외 권고).
3. 거시 포지션 판정(필수): 현재 서사에서 수혜자/피해자/중립 분류.
4. 모멘텀/과열: 검색 O + 직전 +5%↑ → "FOMO 경계". 검색 O + 연속 하락 → "신저가 vs 과매도 반등" 분기.
5. 서프라이즈 vs 선반영: MU형(기대 압도 비트+신규 계약) vs AVGO형(비트지만 기대 미달 가이던스).
6. 기대 선반영도: 1년 +300%↑면 "완벽 선반영" 플래그.
7. 구간 판정(매수/관망/매도)은 근거 2개 이상 명시.

# 출력 형식 (반드시 JSON으로, 다른 텍스트 없이)
{
  "stocks": [
    {
      "ticker": "MU",
      "crowding": 2,
      "macroPosKr": "메모리수혜",
      "signal": "관망",
      "signalEn": "WATCH",
      "keyReason": "핵심 근거 1줄",
      "riskFlag": "리스크 플래그",
      "confidence": 72
    }
  ],
  "skipList": ["PENNY-CHURN 해당 종목"],
  "divisionMap": {
    "beneficiaries": ["MU", "NVDA"],
    "victims": ["AAPL", "MSFT"],
    "neutral": ["TSLA"]
  },
  "fxMemo": "원/달러 + 코스피 동조 경고 1줄",
  "disclaimer": "본 출력은 투자 자문이 아니며, 구조화된 참고 자료다. 최종 판단과 책임은 사용자에게 있다."
}`;
}

function buildStockRow(stock: (typeof WATCHLIST)[number] & { close: number; changePct: number }) {
  return stock;
}

async function runDeepSeekAnalysis(stocks: Awaited<ReturnType<typeof fetchAllPrices>>) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 미설정");

  const prompt = buildPrompt(stocks as Parameters<typeof buildPrompt>[0]);

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek error: ${text}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!force) {
    const cached = await getCache(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  const stocks = await fetchAllPrices();

  let analysis: Record<string, unknown> = {};
  let analysisError = "";
  try {
    analysis = await runDeepSeekAnalysis(stocks);
  } catch (e) {
    analysisError = e instanceof Error ? e.message : String(e);
  }

  const payload = {
    stocks: stocks.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      close: s.close,
      changePct: s.changePct,
      high52w: s.high52w,
      low52w: s.low52w,
      crowdingLabels: s.crowding,
      macro: s.macro,
    })),
    analysis,
    analysisError,
    etfMap: ETF_MAP,
    updatedAt: new Date().toISOString(),
  };

  await setCache(CACHE_KEY, payload, CACHE_TTL);

  return NextResponse.json({ ...payload, cached: false });
}
