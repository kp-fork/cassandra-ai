/**
 * MU → 하이닉스 14일 백테스트 생성 스크립트
 * 사용: npx tsx scripts/backfill-mu-hynix.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

interface YHResponse {
    chart: {
        result: Array<{
            timestamp: number[];
            indicators: { quote: Array<{ close: (number | null)[]; volume: (number | null)[] }> };
        }>;
    };
}

async function fetchYahoo(ticker: string, range = "60d") {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) return null;
        const json: YHResponse = await res.json();
        const r = json.chart.result?.[0];
        if (!r) return null;
        const quote = r.indicators.quote[0];
        const clean = (arr: (number | null)[]): number[] => arr.filter((v): v is number => v !== null);
        return {
            close: clean(quote.close),
            volume: clean(quote.volume || []),
            timestamp: r.timestamp,
        };
    } catch { return null; }
}

function returns(prices: number[]): number[] {
    const r: number[] = [];
    for (let i = 1; i < prices.length; i++) r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    return r;
}

function calcBeta(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 5) return 1.2;
    const xn = x.slice(-n), yn = y.slice(-n);
    const xMean = xn.reduce((a, b) => a + b, 0) / n;
    const yMean = yn.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xn[i] - xMean) * (yn[i] - yMean); den += (xn[i] - xMean) ** 2; }
    return den === 0 ? 1 : num / den;
}

interface Result {
    date: string; muClose: number; muChangePct: number;
    hynixPrev: number; hynixPredicted: number; hynixActual: number;
    predictedChangePct: number; actualChangePct: number;
    hit: boolean | null; diffWon: number; beta: number;
}

async function main() {
    console.log("MU → 하이닉스 14일 백테스트 생성 중...\n");

    // 기존 데이터 삭제
    await prisma.muHynixPrediction.deleteMany();
    console.log("기존 데이터 정리 완료\n");

    // 60일 데이터 가져오기
    const [mu, hynix] = await Promise.all([fetchYahoo("MU"), fetchYahoo("000660.KS")]);
    if (!mu || !hynix || mu.close.length < 35 || hynix.close.length < 35) {
        console.error("데이터 부족: MU", mu?.close.length, "Hynix", hynix?.close.length);
        process.exit(1);
    }

    const muC = mu.close, hynixC = hynix.close;
    const days = Math.min(muC.length, hynixC.length);

    // 14일간 백테스트
    const results: Result[] = [];
    let hits = 0, totalEval = 0;

    // day -14 to -1 (어제까지)
    // 중요: MU(t-1) 종가 → 하이닉스(t) 종가로 정렬
    // MU Day d-1 종가(미국) → 한국시간 Day d 새벽 → 하이닉스 Day d 종가
    for (let d = days - 15; d < days - 1; d++) {
        // MU: 전일(d-1) 종가를 사용하여 당일(d) 하이닉스 예측
        const muPrev = muC[d - 1];
        const muPrev2 = d >= 2 ? muC[d - 2] : muC[d - 1];
        const muChangePct = ((muPrev - muPrev2) / muPrev2) * 100;

        // 직전 21일 데이터로 베타 계산 (MU 0..d-1, Hynix 0..d)
        const lookbackStart = Math.max(0, d - 22);
        const muSlice = muC.slice(lookbackStart, d);      // MU d-1 까지
        const hySlice = hynixC.slice(lookbackStart, d);   // Hynix d-1 까지
        // 베타: MU 수익률 → Hynix 수익률 (같은 캘린더일 기준)
        const muRet = returns(muSlice);
        const hyRet = returns(hySlice);
        const beta = Math.abs(calcBeta(muRet, hyRet)); // 절대값 (방향은 MU 따름)
        const predictedChangePct = beta * muChangePct;
        const hynixPrev = hynixC[d - 1];   // 하이닉스 전일 종가
        const hynixPredicted = hynixPrev * (1 + predictedChangePct / 100);
        const hynixActual = hynixC[d];      // 하이닉스 당일 실제 종가

        const actualChangePct = ((hynixActual - hynixPrev) / hynixPrev) * 100;

        // 방향 적중 판정
        const hit = predictedChangePct === 0 || actualChangePct === 0
            ? null // 변화 없음 → 판정 불가
            : (predictedChangePct > 0 && actualChangePct > 0) || (predictedChangePct < 0 && actualChangePct < 0);

        const diffWon = Math.round(hynixActual - hynixPredicted);

        if (hit !== null) { totalEval++; if (hit) hits++; }

        results.push({
            date: new Date(mu.timestamp[d] * 1000).toISOString().slice(0, 10),
            muClose: muPrev, muChangePct: Math.round(muChangePct * 100) / 100,
            hynixPrev: Math.round(hynixPrev),
            hynixPredicted, hynixActual,
            predictedChangePct: Math.round(predictedChangePct * 100) / 100,
            actualChangePct: Math.round(actualChangePct * 100) / 100,
            hit, diffWon,
            beta: Math.round(beta * 1000) / 1000,
        });

        // DB 저장
        try {
            await prisma.muHynixPrediction.create({
                data: {
                    muCurrentPrice: muPrev,
                    muChangePct,
                    hynixPrevClose: hynixPrev,
                    hynixPredictedOpen: hynixPredicted,
                    hynixPredictedChangePct: predictedChangePct,
                    hynixActualClose: hynixActual,
                    beta, r2: 0, dataPoints: muSlice.length,
                    createdAt: new Date(mu.timestamp[d] * 1000),
                },
            });
        } catch {}
    }

    // 결과 출력
    console.log("=".repeat(85));
    console.log(`${"날짜".padEnd(12)} ${"MU가격".padEnd(8)} ${"MU%".padEnd(7)} ${"베타".padEnd(7)} ${"예측시가".padEnd(12)} ${"실제종가".padEnd(12)} ${"차이".padEnd(10)} 적중`);
    console.log("-".repeat(85));

    for (const r of results) {
        const hitStr = r.hit === true ? "✓" : r.hit === false ? "✗" : "=";
        const diffStr = `${r.diffWon >= 0 ? "+" : ""}${r.diffWon.toLocaleString()}원`;
        console.log(
            `${r.date.padEnd(12)} $${String(r.muClose).padEnd(7)} ${String(r.muChangePct + "%").padEnd(7)} ${String(r.beta).padEnd(7)} ₩${String(Math.round(r.hynixPredicted)).padEnd(11)} ₩${String(r.hynixActual).padEnd(11)} ${diffStr.padEnd(10)} ${hitStr}`
        );
    }

    const accuracy = totalEval > 0 ? Math.round((hits / totalEval) * 100) : 0;
    console.log("=".repeat(85));
    console.log(`적중률: ${accuracy}% (${hits}/${totalEval})`);
    console.log(`총 데이터: ${results.length}일`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
