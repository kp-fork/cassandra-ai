/**
 * NASDAQ 100 섹터별 Top 3 AMQS 퀀트 분석
 * - 7개 섹터 × 최대 3종목
 * - AMQS 4-Factor 모멘텀 점수 (12M-1M, 6M-1M, 3M-1M, Vol 조정)
 * - 투자 의견: 매수 / 중립 / 매도 / 과매도
 * - 목표 매수가 / 목표 매도가(TP) / 손절가(SL)
 * - 캐시: 1시간 (장중) / 4시간 (마감후)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";
import { calculateRSI, calculateMA, calculateMomentum } from "@/lib/quant-calc";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const CACHE_KEY = "nasdaq-sector-top:v1";

// ─── 섹터 정의 (NASDAQ 100 대표 종목, 후보 최대 8개) ───
const SECTORS: { id: string; name: string; emoji: string; tickers: string[] }[] = [
  {
    id: "semiconductor",
    name: "반도체",
    emoji: "⚡",
    tickers: ["NVDA", "AVGO", "AMD", "MU", "QCOM", "AMAT", "ASML", "LRCX"],
  },
  {
    id: "bigtech",
    name: "빅테크/플랫폼",
    emoji: "🌐",
    tickers: ["AAPL", "MSFT", "GOOGL", "META", "AMZN"],
  },
  {
    id: "software",
    name: "소프트웨어/SaaS",
    emoji: "💻",
    tickers: ["ORCL", "ADBE", "INTU", "PLTR", "CRWD", "PANW", "CRM", "SNPS"],
  },
  {
    id: "internet",
    name: "인터넷/커머스",
    emoji: "🛒",
    tickers: ["NFLX", "MELI", "PDD", "TTD", "ABNB"],
  },
  {
    id: "biotech",
    name: "바이오/헬스케어",
    emoji: "🧬",
    tickers: ["AMGN", "VRTX", "REGN", "GILD", "MRNA", "IDXX"],
  },
  {
    id: "consumer",
    name: "소비재/서비스",
    emoji: "🛍️",
    tickers: ["COST", "SBUX", "LULU", "MAR", "ORLY"],
  },
  {
    id: "ev_energy",
    name: "전기차/신에너지",
    emoji: "🔋",
    tickers: ["TSLA", "RIVN", "NIO", "XPEV", "LI"],
  },
];

const STOCK_NAMES: Record<string, string> = {
  NVDA:"엔비디아", AVGO:"브로드컴", AMD:"AMD", MU:"마이크론", QCOM:"퀄컴",
  AMAT:"어플라이드머티리얼", ASML:"ASML", LRCX:"램리서치",
  AAPL:"애플", MSFT:"마이크로소프트", GOOGL:"구글", META:"메타", AMZN:"아마존",
  ORCL:"오라클", ADBE:"어도비", INTU:"인튜이트", PLTR:"팔란티어",
  CRWD:"크라우드스트라이크", PANW:"팔로알토", CRM:"세일즈포스", SNPS:"시놉시스",
  NFLX:"넷플릭스", MELI:"메르카도리브레", PDD:"핀둬둬", TTD:"트레이드데스크", ABNB:"에어비앤비",
  AMGN:"암젠", VRTX:"버텍스", REGN:"리제네론", GILD:"길리어드",
  MRNA:"모더나", IDXX:"IDEXX",
  COST:"코스트코", SBUX:"스타벅스", LULU:"룰루레몬", MAR:"메리어트", ORLY:"오라일리",
  TSLA:"테슬라", RIVN:"리비안", NIO:"니오", XPEV:"샤오펑", LI:"리오토",
};

const STOCK_DESC: Record<string, string> = {
  NVDA:"AI·데이터센터 GPU 1위, Blackwell 사이클 수혜",
  AVGO:"AI ASIC·VMware 시너지, 데이터센터 네트워킹",
  AMD:"서버 CPU·GPU, MI300X AI 가속기 점유율 확대",
  MU:"HBM3E DRAM, AI 메모리 수요 직접 수혜",
  QCOM:"스마트폰 AP·AI 온디바이스 칩, 자동차 반도체",
  AMAT:"반도체 증착·식각 장비 1위, CHIPS Act 수혜",
  ASML:"EUV 노광 장비 독점, 차세대 공정 게이트키퍼",
  LRCX:"식각·증착 장비, HBM 패키징 공정 수혜",
  AAPL:"스마트폰·PC·서비스 생태계, Apple Intelligence",
  MSFT:"Azure AI 클라우드 +60% YoY, Copilot 매출 가속",
  GOOGL:"구글 검색·GCP·TPU, AI 오버뷰 트래픽 방어",
  META:"광고 AI ROAS 개선, Llama 자체 인프라 투자",
  AMZN:"AWS 클라우드 1위, AI 추론·Bedrock 성장",
  ORCL:"OCI AI 클라우드, 데이터베이스 마이그레이션 수요",
  ADBE:"크리에이티브 AI Firefly, Acrobat AI Assistant",
  INTU:"세금·회계 AI 자동화, 중소기업 SaaS 독점",
  PLTR:"AIP 정부·상용 AI 플랫폼, 국방 AI 채택 가속",
  CRWD:"엔드포인트 보안 1위, AI 기반 위협 탐지",
  PANW:"통합 사이버보안 플랫폼, SASE 아키텍처",
  CRM:"CRM 1위, Agentforce AI 에이전트 플랫폼",
  SNPS:"EDA 툴 독점, AI 칩 설계 수혜",
  NFLX:"스트리밍 OTT 1위, 광고 티어·라이브 이벤트",
  MELI:"남미 이커머스·핀테크 독점, GMV 고성장",
  PDD:"테무 글로벌 확장, 중국 이커머스 가격 경쟁력",
  TTD:"프로그래매틱 광고 플랫폼, CTV 수혜",
  ABNB:"여행 플랫폼 회복, 장기 숙박·경험 확장",
  AMGN:"비만치료제 MariTide, 바이오시밀러 포트폴리오",
  VRTX:"낭포성섬유증 독점, 통증치료제 신약 파이프라인",
  REGN:"안구질환·면역·암 바이오의약품 포트폴리오",
  GILD:"HIV 치료제 독점, 항암제 파이프라인",
  MRNA:"mRNA 플랫폼, 독감·암 백신 파이프라인",
  IDXX:"반려동물 진단 독점, 구독 소모품 매출",
  COST:"회원제 창고형 할인점, 고객 충성도 최강",
  SBUX:"글로벌 커피 체인, 중국 회복·디지털 주문",
  LULU:"프리미엄 애슬레저, 남성·국제 시장 확장",
  MAR:"호텔 브랜드 1위, 여행 수요 회복 수혜",
  ORLY:"자동차 부품 소매, 고령 차량 증가 구조적 수혜",
  TSLA:"전기차·FSD AI·에너지 저장, 로보택시 옵션",
  RIVN:"아마존 배달 밴 파트너십, R2 소형 SUV 출시",
  NIO:"중국 프리미엄 EV, 배터리 교환 인프라",
  XPEV:"중국 스마트 EV, 자율주행 XNGP 기술",
  LI:"중국 EREV 하이브리드, 프리미엄 SUV 판매 급증",
};

// ─── Yahoo Finance 3개월 바 데이터 fetch ───
async function fetchBars(symbol: string): Promise<{ date: string; close: number }[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=12mo&interval=1wk`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators.quote[0].close ?? [];
    return timestamps
      .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] ?? 0 }))
      .filter(b => b.close > 0);
  } catch { return null; }
}

// ─── AMQS 4-Factor 점수 계산 (주봉 기반 근사) ───
function computeAmqsScore(bars: { date: string; close: number }[]): {
  score: number;
  mom12: number;
  mom6: number;
  mom3: number;
  rsi: number;
  ma20: number;
  currentPrice: number;
  vol60: number;
} {
  const closes = bars.map(b => b.close);
  const n = closes.length;
  if (n < 13) return { score: 50, mom12: 0, mom6: 0, mom3: 0, rsi: 50, ma20: closes.at(-1) ?? 0, currentPrice: closes.at(-1) ?? 0, vol60: 0.3 };

  const cur = closes.at(-1)!;
  const w1  = closes.at(-2)!; // 1주 전 (최근 1개월 근사)

  // 주봉 기준: 12주(~3M), 26주(~6M), 52주(~12M), 제외 4주
  const p1mo  = closes.at(-4)  ?? closes.at(-2)!;  // 4주 전(1M)
  const p3mo  = closes.at(-13) ?? closes[0];        // 13주 전(3M)
  const p6mo  = closes.at(-26) ?? closes[0];        // 26주 전(6M)
  const p12mo = closes[0];                          // 최초 데이터(12M)

  // 12-1 모멘텀 (50%): (12M 수익률) - (최근 1M 수익률)
  const mom12 = ((cur - p12mo) / p12mo * 100) - ((cur - p1mo) / p1mo * 100);
  // 6-1 모멘텀 (30%)
  const mom6  = ((cur - p6mo)  / p6mo  * 100) - ((cur - p1mo) / p1mo * 100);
  // 3-1 모멘텀 (15%)
  const mom3  = ((cur - p3mo)  / p3mo  * 100) - ((cur - p1mo) / p1mo * 100);

  // 변동성 조정 (5%): 최근 12주 주봉 표준편차(연환산)
  const recentCloses = closes.slice(-12);
  const returns = recentCloses.slice(1).map((c, i) => Math.log(c / recentCloses[i]));
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(52)
    : 0.3;
  const volAdj = stdDev > 0 ? 1 / stdDev : 3;

  // z-score 정규화 (간소화: 각 컴포넌트를 [-2, +2] 범위로 클램프)
  const clamp = (v: number, scale: number) => Math.max(-2, Math.min(2, v / scale));
  const zA  = clamp(mom12, 20);  // 20% 기준 단위
  const zB  = clamp(mom6,  15);
  const zC  = clamp(mom3,  10);
  const zD  = clamp(volAdj - 2, 1); // volAdj 기준값 2 근사

  const composite = 0.50 * zA + 0.30 * zB + 0.15 * zC + 0.05 * zD;
  // 0-100 점수로 변환 (composite 범위: -2 ~ +2)
  const score = Math.round(Math.max(0, Math.min(100, (composite + 2) / 4 * 100)));

  const rsi    = calculateRSI(closes, 14);
  const ma20   = calculateMA(closes, 20);

  return {
    score,
    mom12: Math.round(mom12 * 10) / 10,
    mom6:  Math.round(mom6  * 10) / 10,
    mom3:  Math.round(mom3  * 10) / 10,
    rsi:   Math.round(rsi),
    ma20:  Math.round(ma20 * 100) / 100,
    currentPrice: Math.round(cur * 100) / 100,
    vol60: Math.round(stdDev * 1000) / 1000,
  };
}

// ─── 투자 의견 결정 ───
function investmentOpinion(score: number, rsi: number, mom12: number): {
  opinion: "매수" | "중립" | "관망" | "매도" | "과매도";
  color: string;
  emoji: string;
} {
  if (rsi < 30 && score < 40) return { opinion: "과매도", color: "#6c5ce7", emoji: "🟣" };
  if (score >= 65 && rsi < 75) return { opinion: "매수",   color: "#22c55e", emoji: "🟢" };
  if (score >= 50)              return { opinion: "중립",   color: "#f59e0b", emoji: "🟡" };
  if (score >= 35)              return { opinion: "관망",   color: "#94a3b8", emoji: "⚪" };
  return                                { opinion: "매도",   color: "#ef4444", emoji: "🔴" };
}

// ─── 가격 목표 계산 ───
function priceLevels(currentPrice: number, score: number, ma20: number, rsi: number) {
  // 목표 매수가: 과매수(RSI>70)면 MA20 근처, 아니면 현재가 -1% ~ -3%
  const entryDiscount = rsi > 70 ? 0.05 : rsi < 40 ? 0.01 : 0.02;
  const buyPrice = Math.round(currentPrice * (1 - entryDiscount) * 100) / 100;

  // 목표 매도가(TP): 모멘텀 점수에 비례한 상승 여력
  const upsidePct = score > 65 ? 0.18 : score > 50 ? 0.12 : score > 35 ? 0.07 : 0.04;
  const sellPrice = Math.round(currentPrice * (1 + upsidePct) * 100) / 100;

  // 손절가(SL): AMQS 기본 -12%
  const stopLoss = Math.round(currentPrice * 0.88 * 100) / 100;

  return { buyPrice, sellPrice, stopLoss };
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!force) {
    const cached = await getCache(CACHE_KEY);
    if (cached && !cached.stale) {
      return NextResponse.json({ ...cached.data, fromCache: true, cachedSecondsAgo: cached.age });
    }
  }

  try {
    // 전 종목 수집 (섹터 중복 제거)
    const allTickers = [...new Set(SECTORS.flatMap(s => s.tickers))];

    // 배치 fetch (12개씩, Vercel 10초 제한 고려)
    const barsMap: Record<string, { date: string; close: number }[]> = {};
    const BATCH = 12;
    for (let i = 0; i < allTickers.length; i += BATCH) {
      const batch = allTickers.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(t => fetchBars(t).then(b => ({ t, b }))));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.b) {
          barsMap[r.value.t] = r.value.b;
        }
      }
    }

    const generatedAt = new Date().toISOString();

    // 섹터별 스코어링 → Top 3
    const sectors = SECTORS.map(sector => {
      const stocks = sector.tickers
        .map(ticker => {
          const bars = barsMap[ticker];
          if (!bars || bars.length < 10) return null;
          const q = computeAmqsScore(bars);
          const op = investmentOpinion(q.score, q.rsi, q.mom12);
          const prices = priceLevels(q.currentPrice, q.score, q.ma20, q.rsi);
          return {
            ticker,
            name: STOCK_NAMES[ticker] ?? ticker,
            desc: STOCK_DESC[ticker] ?? "",
            score: q.score,
            mom12: q.mom12,
            mom6:  q.mom6,
            mom3:  q.mom3,
            rsi:   q.rsi,
            currentPrice: q.currentPrice,
            ma20:    q.ma20,
            vol60:   q.vol60,
            opinion: op.opinion,
            color:   op.color,
            emoji:   op.emoji,
            buyPrice:  prices.buyPrice,
            sellPrice: prices.sellPrice,
            stopLoss:  prices.stopLoss,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      return { ...sector, stocks };
    });

    const payload = { generatedAt, sectors };

    const h = new Date().getUTCHours();
    const isMarketHours = h >= 14 && h <= 21;
    await setCache(CACHE_KEY, payload, isMarketHours ? 3600 : 14400);

    return NextResponse.json({ ...payload, fromCache: false });
  } catch (e: any) {
    const stale = await getCache(CACHE_KEY);
    if (stale) return NextResponse.json({ ...stale.data, fromCache: true, stale: true, error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
