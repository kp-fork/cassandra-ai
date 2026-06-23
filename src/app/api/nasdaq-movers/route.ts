/**
 * NASDAQ 상승/하락 종목 API
 * - 데일리: 당일 등락률 상위/하위 20종목
 * - 주간: 최근 5거래일 등락률 Top 20 / Bottom 10
 * - Yahoo Finance 실시간 fetch (하드코딩 제거)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const CACHE_KEY_DAILY  = "nasdaq-movers-daily";
const CACHE_KEY_WEEKLY = "nasdaq-movers-weekly";

const NASDAQ_100 = [
    "AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","COST",
    "NFLX","AMD","ADBE","PEP","CSCO","INTC","CMCSA","TXN","QCOM","AMGN",
    "HON","INTU","AMAT","SBUX","GILD","ADI","MDLZ","REGN","VRTX","LRCX",
    "ADP","FISV","MELI","KLAC","MU","LULU","ASML","SNPS","CDNS",
    "MAR","ORLY","CTAS","MNST","TMUS","CHTR","ROP","NXPI","MCHP",
    "MRVL","WDAY","CRWD","PANW","FTNT","PAYX","PCAR","FAST","ABNB","CPRT",
    "MRNA","BKR","AZN","TTD","MDB","PDD","BIDU","RIVN",
    "ARM","HOOD","PLTR","SOFI","SNAP","PINS","RBLX","DKNG","ZM",
    "NIO","LCID","XPEV","LI",
];

const STOCK_NAMES: Record<string, string> = {
    AAPL:"애플",MSFT:"마이크로소프트",NVDA:"엔비디아",AMZN:"아마존",META:"메타",
    GOOGL:"구글",TSLA:"테슬라",AVGO:"브로드컴",COST:"코스트코",
    NFLX:"넷플릭스",AMD:"AMD",ADBE:"어도비",PEP:"펩시",CSCO:"시스코",
    INTC:"인텔",CMCSA:"컴캐스트",TXN:"텍사스인스트루먼트",QCOM:"퀄컴",AMGN:"암젠",
    HON:"하니웰",INTU:"인튜이트",AMAT:"어플라이드머티리얼",SBUX:"스타벅스",GILD:"길리어드",
    ADI:"아날로그디바이스",MDLZ:"몬델리즈",REGN:"리제네론",VRTX:"버텍스",LRCX:"램리서치",
    ADP:"ADP",FISV:"파이서브",MELI:"메르카도리브레",KLAC:"KLA",
    MU:"마이크론",LULU:"룰루레몬",ASML:"ASML",SNPS:"시놉시스",CDNS:"케이던스",
    MAR:"메리어트",ORLY:"오라일리",CTAS:"신타스",MNST:"몬스터",
    TMUS:"T모바일",CHTR:"차터",ROP:"로퍼",NXPI:"NXP",MCHP:"마이크로칩",
    MRVL:"마벨",WDAY:"워크데이",CRWD:"크라우드스트라이크",PANW:"팔로알토",FTNT:"포티넷",
    ABNB:"에어비앤비",MRNA:"모더나",BKR:"베이커�즈",AZN:"아스트라제네카",
    TTD:"트레이드데스크",MDB:"MongoDB",PDD:"핀둬둬",BIDU:"바이두",RIVN:"리비안",
    ARM:"ARM",HOOD:"로빈후드",PLTR:"팔란티어",SOFI:"소파이",
    SNAP:"스냅",PINS:"핀터레스트",RBLX:"로블록스",DKNG:"드래프트킹스",ZM:"줌",
    NIO:"니오",LCID:"루시드",XPEV:"샤오펑",LI:"리오토",
    PAYX:"페이첵스",PCAR:"팩카",FAST:"파스날",CPRT:"코파트",
};

interface MoverItem {
    ticker: string;
    name: string;
    price: number;
    changePct: number;
    volume: number;
    reason: string;
}

// ─── 이유 자동 생성 ───
function generateReason(ticker: string, changePct: number, volume: number): string {
    const name = STOCK_NAMES[ticker] || ticker;
    if (changePct > 8)  return `${name} 강한 매수세·거래량 ${(volume/1e6).toFixed(0)}M — 호재 모멘텀`;
    if (changePct > 4)  return `${name} 상승 돌파·기관 순매수 유입`;
    if (changePct > 2)  return `${name} 긍정 업황·섹터 동반 상승`;
    if (changePct < -8) return `${name} 강한 매도세 — 실적 쇼크 또는 악재`;
    if (changePct < -4) return `${name} 차익 실현·목표가 하향`;
    if (changePct < -2) return `${name} 단기 조정·섹터 약세`;
    return `${name} 시장 흐름 동조`;
}

// ─── 당일 데이터 fetch (range=1d) ───
async function fetchDailyQuote(ticker: string) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`;
        const res = await fetch(url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(5000),
            next: { revalidate: 0 },
        });
        if (!res.ok) return null;
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta) return null;
        const cur  = meta.regularMarketPrice ?? 0;
        const prev = meta.previousClose ?? meta.chartPreviousClose ?? 0;
        if (!cur || !prev) return null;
        return {
            price: Math.round(cur * 100) / 100,
            changePct: Math.round(((cur - prev) / prev) * 10000) / 100,
            volume: meta.regularMarketVolume ?? 0,
        };
    } catch { return null; }
}

// ─── 주간 데이터 fetch (range=5d, 첫날 vs 마지막날 비교) ───
async function fetchWeeklyQuote(ticker: string) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
        const res = await fetch(url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(6000),
            next: { revalidate: 0 },
        });
        if (!res.ok) return null;
        const json = await res.json();
        const result = json.chart?.result?.[0];
        if (!result) return null;
        const closes: number[] = (result.indicators.quote[0].close ?? []).filter((v: any) => v != null);
        const volumes: number[] = (result.indicators.quote[0].volume ?? []).filter((v: any) => v != null);
        if (closes.length < 2) return null;
        const open  = closes[0];
        const close = closes[closes.length - 1];
        const avgVol = volumes.length ? Math.round(volumes.reduce((s: number, v: number) => s + v, 0) / volumes.length) : 0;
        return {
            price: Math.round(close * 100) / 100,
            changePct: Math.round(((close - open) / open) * 10000) / 100,
            volume: avgVol,
            periodStart: result.timestamp?.[0] ? new Date(result.timestamp[0]*1000).toISOString().slice(0,10) : "",
            periodEnd:   result.timestamp?.at(-1) ? new Date(result.timestamp.at(-1)*1000).toISOString().slice(0,10) : "",
        };
    } catch { return null; }
}

// ─── 배치 fetch (병렬 + 실패 무시) ───
async function batchFetch<T>(
    tickers: string[],
    fn: (t: string) => Promise<T | null>,
    concurrency = 10,
): Promise<{ ticker: string; data: T }[]> {
    const results: { ticker: string; data: T }[] = [];
    for (let i = 0; i < tickers.length; i += concurrency) {
        const batch = tickers.slice(i, i + concurrency);
        const settled = await Promise.allSettled(batch.map(t => fn(t).then(d => ({ ticker: t, data: d }))));
        for (const r of settled) {
            if (r.status === "fulfilled" && r.value?.data) {
                results.push(r.value as { ticker: string; data: T });
            }
        }
    }
    return results;
}

// ─── 주간 날짜 범위 문자열 생성 ───
function weekRange(startDate: string, endDate: string) {
    if (!startDate || !endDate) return "최근 5거래일";
    const fmt = (s: string) => {
        const d = new Date(s);
        return `${d.getMonth()+1}/${d.getDate()}`;
    };
    return `${fmt(startDate)} — ${fmt(endDate)}`;
}

export async function GET(req: NextRequest) {
    const force = req.nextUrl.searchParams.get("force") === "true"
               || req.nextUrl.searchParams.get("refresh") === "1";

    // ─── 캐시 확인 ───
    if (!force) {
        const [cd, cw] = await Promise.all([getCache(CACHE_KEY_DAILY), getCache(CACHE_KEY_WEEKLY)]);
        if (cd && cw && !cd.stale && !cw.stale) {
            return NextResponse.json({ daily: cd.data, weekly: cw.data, fromCache: true });
        }
    }

    try {
        // ─── 병렬 fetch: 데일리 + 주간 동시 실행 ───
        const [dailyRaw, weeklyRaw] = await Promise.all([
            batchFetch(NASDAQ_100, fetchDailyQuote, 12),
            batchFetch(NASDAQ_100, fetchWeeklyQuote, 10),
        ]);

        // 데일리 정렬
        const dailySorted = dailyRaw
            .map(({ ticker, data }) => ({
                ticker,
                name: STOCK_NAMES[ticker] || ticker,
                price: (data as any).price,
                changePct: (data as any).changePct,
                volume: (data as any).volume,
                reason: generateReason(ticker, (data as any).changePct, (data as any).volume),
            }))
            .filter(i => Math.abs(i.changePct) > 0)
            .sort((a, b) => b.changePct - a.changePct);

        const daily = {
            gainers: dailySorted.slice(0, 20),
            losers:  [...dailySorted].sort((a, b) => a.changePct - b.changePct).slice(0, 10),
            generatedAt: new Date().toISOString(),
        };

        // 주간 정렬
        let periodStart = "", periodEnd = "";
        const weeklySorted = weeklyRaw
            .map(({ ticker, data }) => {
                const d = data as any;
                if (d.periodStart && !periodStart) periodStart = d.periodStart;
                if (d.periodEnd)   periodEnd = d.periodEnd;
                return {
                    ticker,
                    name: STOCK_NAMES[ticker] || ticker,
                    price: d.price,
                    changePct: d.changePct,
                    volume: d.volume,
                    reason: generateReason(ticker, d.changePct, d.volume),
                };
            })
            .filter(i => Math.abs(i.changePct) > 0)
            .sort((a, b) => b.changePct - a.changePct);

        const weekly = {
            gainers:   weeklySorted.slice(0, 20),
            losers:    [...weeklySorted].sort((a, b) => a.changePct - b.changePct).slice(0, 10),
            periodLabel: weekRange(periodStart, periodEnd),
            generatedAt: new Date().toISOString(),
        };

        // 캐시 저장 (데일리 2시간, 주간 6시간)
        await Promise.all([
            setCache(CACHE_KEY_DAILY,  daily,  7200),
            setCache(CACHE_KEY_WEEKLY, weekly, 21600),
        ]);

        return NextResponse.json({ daily, weekly, fromCache: false });

    } catch (e: any) {
        // 에러 시 스테일 캐시 반환
        const [cd, cw] = await Promise.all([getCache(CACHE_KEY_DAILY), getCache(CACHE_KEY_WEEKLY)]);
        if (cd || cw) {
            return NextResponse.json({
                daily:  cd?.data  ?? { gainers:[], losers:[] },
                weekly: cw?.data  ?? { gainers:[], losers:[] },
                fromCache: true, stale: true, error: e.message,
            });
        }
        return NextResponse.json({ error: e.message, daily: { gainers:[], losers:[] }, weekly: { gainers:[], losers:[] } }, { status: 500 });
    }
}
