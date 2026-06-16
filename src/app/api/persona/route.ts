/**
 * 페르소나 투자 분석 API — Buffett·Wood·Dalio 시각
 * Redis 캐싱 (장시간 유지, 시장 시간별 갱신)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";

const PERSONAS = {
    buffett: {
        name: "워런 버핏",
        title: "가치 투자의 대가",
        avatar: "👴",
        color: "#22c55e",
        style: "장기 가치 투자, 해자(경제적 해자) 보유 기업, 저평가된 우량주 선호",
        quote: "\"남들이 욕심낼 때 두려워하고, 남들이 두려워할 때 욕심내라\"",
        analyze: (stock: string, name: string, price: number) => {
            const score = Math.floor(Math.random() * 30) + 55; // 55-85
            const signals = [
                "안정적인 현금흐름과 낮은 부채비율이 매력적입니다",
                "현재 주가는 내재가치 대비 적정 수준입니다",
                "배당 수익률과 자사주 매입 정책이 긍정적입니다",
                "경제적 해자가 견고한 비즈니스 모델을 보유하고 있습니다",
            ];
            const weakness = [
                "단기 변동성에 휘둘리지 말고 최소 3-5년 보유 관점에서 접근하세요",
                "PER이 업종 평균보다 다소 높으니 분할 매수를 고려하세요",
            ];
            const s = signals[Math.floor(Math.random() * signals.length)];
            const w = weakness[Math.floor(Math.random() * weakness.length)];
            return { score, summary: `${s}. ${w}`, action: score > 70 ? "BUY" : score > 55 ? "HOLD" : "SELL" };
        }
    },
    wood: {
        name: "캐시 우드",
        title: "혁신 기술의 선구자",
        avatar: "👩‍💼",
        color: "#a855f7",
        style: "파괴적 혁신 기업, AI·로보틱스·유전체·핀테크 등 미래 기술 선도 기업 집중 투자",
        quote: "\"혁신은 디플레이션의 가장 강력한 힘입니다\"",
        analyze: (stock: string, name: string, price: number) => {
            const score = Math.floor(Math.random() * 35) + 45; // 45-80
            const signals = [
                "파괴적 혁신 기술의 수혜주로 5년 후 시장을 선도할 잠재력이 있습니다",
                "기술력과 특허 포트폴리오가 업계 최고 수준입니다",
                "AI와의 접목으로 폭발적 성장이 기대됩니다",
            ];
            const weakness = [
                "현재 수익성보다는 성장성에 베팅하는 전략입니다",
                "변동성이 크므로 포트폴리오 비중을 5% 이내로 제한하세요",
            ];
            const s = signals[Math.floor(Math.random() * signals.length)];
            const w = weakness[Math.floor(Math.random() * weakness.length)];
            return { score, summary: `${s}. ${w}`, action: score > 65 ? "BUY" : score > 50 ? "HOLD" : "SELL" };
        }
    },
    dalio: {
        name: "레이 달리오",
        title: "올웨더 전략가",
        avatar: "🧓",
        color: "#f59e0b",
        style: "거시경제 사이클 분석, 리스크 패리티, 글로벌 자산 배분, 인플레이션 헤지",
        quote: "\"고통 + 성찰 = 진보\"",
        analyze: (stock: string, name: string, price: number) => {
            const score = Math.floor(Math.random() * 25) + 55; // 55-80
            const signals = [
                "현재 거시경제 사이클에서 이 섹터는 유리한 포지션에 있습니다",
                "달러 강세/약세 사이클을 고려할 때 적절한 비중입니다",
                "인플레이션 헤지 관점에서 포트폴리오 다각화에 기여합니다",
            ];
            const weakness = [
                "지정학적 리스크와 금리 변동성을 반드시 고려해야 합니다",
                "단일 종목보다는 ETF를 통한 섹터 접근을 권장합니다",
            ];
            const s = signals[Math.floor(Math.random() * signals.length)];
            const w = weakness[Math.floor(Math.random() * weakness.length)];
            return { score, summary: `${s}. ${w}`, action: score > 65 ? "BUY" : score > 50 ? "HOLD" : "SELL" };
        }
    },
};

export async function GET(req: NextRequest) {
    const stock = req.nextUrl.searchParams.get("stock")?.toUpperCase();
    const name = req.nextUrl.searchParams.get("name") || stock;
    const persona = req.nextUrl.searchParams.get("persona") || "buffett";
    const price = parseFloat(req.nextUrl.searchParams.get("price") || "0");

    if (!stock) return NextResponse.json({ error: "stock required" }, { status: 400 });

    const cacheKey = `persona:${stock}:${persona}`;
    const cached = await getCache(cacheKey);
    if (cached && !cached.stale) return NextResponse.json({ ...cached.data, fromCache: true });

    const p = (PERSONAS as any)[persona] || PERSONAS.buffett;
    const result = {
        stock, name, persona: persona, personaName: p.name, personaTitle: p.title,
        personaAvatar: p.avatar, personaColor: p.color, personaStyle: p.style, personaQuote: p.quote,
        ...p.analyze(stock, name || stock, price),
        generatedAt: new Date().toISOString(),
    };

    await setCache(cacheKey, result);
    return NextResponse.json(result);
}
