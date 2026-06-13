"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, User, AlertTriangle, Send, Loader2, Sparkles } from "lucide-react";

const STOCK_ELEMENTS: Record<string, { name: string; element: string; desc: string }> = {
    NVDA: { name:"엔비디아", element:"metal", desc:"AI 반도체·GPU — 금(金) 기운" },
    AAPL: { name:"애플", element:"metal", desc:"하드웨어·디자인 — 금(金) 기운" },
    TSLA: { name:"테슬라", element:"fire", desc:"전기차·에너지 — 화(火) 기운" },
    MSFT: { name:"마이크로소프트", element:"water", desc:"클라우드·소프트웨어 — 수(水) 기운" },
    AMZN: { name:"아마존", element:"water", desc:"이커머스·물류 — 수(水) 기운" },
    META: { name:"메타", element:"fire", desc:"SNS·메타버스 — 화(火) 기운" },
    GOOGL: { name:"구글", element:"water", desc:"검색·AI — 수(水) 기운" },
    AMD: { name:"AMD", element:"metal", desc:"반도체 — 금(金) 기운" },
    INTC: { name:"인텔", element:"metal", desc:"반도체 — 금(金) 기운" },
    MU: { name:"마이크론", element:"earth", desc:"메모리 반도체 — 토(土) 기운" },
    NFLX: { name:"넷플릭스", element:"fire", desc:"엔터테인먼트·스트리밍 — 화(火) 기운" },
    PLTR: { name:"팔란티어", element:"water", desc:"빅데이터·AI 분석 — 수(水) 기운" },
    COIN: { name:"코인베이스", element:"fire", desc:"암호화폐 거래소 — 화(火) 기운" },
    TSM: { name:"TSMC", element:"earth", desc:"반도체 위탁생산 — 토(土) 기운" },
    ASML: { name:"ASML", element:"metal", desc:"반도체 장비 — 금(金) 기운" },
    "005930": { name:"삼성전자", element:"metal", desc:"반도체·가전 — 금(金) 기운" },
    "000660": { name:"SK하이닉스", element:"earth", desc:"메모리 반도체 — 토(土) 기운" },
    "035420": { name:"NAVER", element:"water", desc:"인터넷·AI — 수(水) 기운" },
    "035720": { name:"카카오", element:"fire", desc:"메신저·콘텐츠 — 화(火) 기운" },
    "051910": { name:"LG화학", element:"fire", desc:"배터리·화학 — 화(火) 기운" },
};

const ELEMENT_MATCH: Record<string, string> = {
    "wood-wood":   "🌳 비화 — 안정적 동행, 장기 투자 적합",
    "wood-fire":   "🌳🔥 상생 — 나무가 불을 키우듯 성장 에너지",
    "wood-earth":  "🌳⛰️ 상극 — 나무가 흙을 뚫고 자라듯 인내 필요",
    "wood-metal":  "🌳⚒️ 피극 — 금이 나무를 자르니 손절 라인 필수",
    "wood-water":  "🌳💧 상생 — 물이 나무를 키우니 안정적 수익",
    "fire-wood":   "🔥🌳 피극 — 나무가 불을 소모하니 조심",
    "fire-fire":   "🔥 비화 — 강한 열정, 단기 트레이딩 기회",
    "fire-earth":  "🔥⛰️ 상생 — 불이 재를 만들어 흙을 비옥하게",
    "fire-metal":  "🔥⚒️ 상극 — 불이 금속을 녹이니 변곡점 포착",
    "fire-water":  "🔥💧 피극 — 물이 불을 끄니 방어적 접근",
    "earth-wood":  "⛰️🌳 피극 — 나무가 흙을 소모",
    "earth-fire":  "⛰️🔥 상생 — 불이 흙을 단단하게, 기초 다지기",
    "earth-earth": "⛰️ 비화 — 안정적, 가치주·배당주 적합",
    "earth-metal": "⛰️⚒️ 상생 — 흙이 금을 낳으니 수익 창출",
    "earth-water": "⛰️💧 피극 — 물이 흙을 쓸어내니 유동성 주의",
    "metal-wood":  "⚒️🌳 상극 — 금이 나무를 베니 결단력 필요",
    "metal-fire":  "⚒️🔥 피극 — 불이 금속을 녹이니 조정기",
    "metal-earth": "⚒️⛰️ 상생 — 흙이 금을 품듯 수익 누적",
    "metal-metal": "⚒️ 비화 — 동종업·경쟁, 시너지 또는 충돌",
    "metal-water": "⚒️💧 상생 — 금이 물을 낳으니 유동성·현금화",
    "water-wood":  "💧🌳 상생 — 물이 나무를 키우니 장기 성장",
    "water-fire":  "💧🔥 상극 — 물이 불을 끄니 단기 하락 경계",
    "water-earth": "💧⛰️ 피극 — 흙이 물을 막으니 장벽 돌파",
    "water-metal": "💧⚒️ 피극 — 금속이 물을 흐리니 혼란 주의",
    "water-water": "💧 비화 — 흐름을 타는 날, 트렌드 추종",
};

export default function SajuPage() {
    const [birthDate, setBirthDate] = useState("1990-01-01");
    const [birthHour, setBirthHour] = useState<number | null>(null);
    const [gender, setGender] = useState("");
    const [nickname, setNickname] = useState("");
    const [agreed, setAgreed] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [stockQuery, setStockQuery] = useState("");
    const [stockResult, setStockResult] = useState<{ stock: string; analysis: string } | null>(null);
    const [stockHistory, setStockHistory] = useState<{ stock: string; analysis: string }[]>([]);

    // localStorage 캐싱
    useEffect(() => {
        const cached = localStorage.getItem("saju-profile");
        if (cached) {
            try {
                const p = JSON.parse(cached);
                if (p.birthDate) setBirthDate(p.birthDate);
                if (p.birthHour !== undefined) setBirthHour(p.birthHour);
                if (p.gender) setGender(p.gender);
                if (p.nickname) setNickname(p.nickname);
                setAgreed(true);
            } catch {}
        }
        const hist = localStorage.getItem("saju-stock-history");
        if (hist) { try { setStockHistory(JSON.parse(hist)); } catch {} }
    }, []);

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourLabels: Record<number, string> = {
        0:"자시(23-01)",1:"축시(01-03)",3:"인시(03-05)",5:"묘시(05-07)",
        7:"진시(07-09)",9:"사시(09-11)",11:"오시(11-13)",13:"미시(13-15)",
        15:"신시(15-17)",17:"유시(17-19)",19:"술시(19-21)",21:"해시(21-23)"
    };

    const submitSaju = async () => {
        if (!agreed) { setError("위험 고지에 동의해주세요."); return; }
        setLoading(true); setError("");
        try {
            const res = await fetch("/api/saju", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ birthDate, birthHour, gender, nickname }),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setResult(data);
            localStorage.setItem("saju-profile", JSON.stringify({ birthDate, birthHour, gender, nickname }));
        } catch { setError("서버 오류가 발생했습니다."); }
        finally { setLoading(false); }
    };

    const askStock = (e: React.FormEvent) => {
        e.preventDefault();
        if (!stockQuery.trim() || !result) return;
        const q = stockQuery.toUpperCase().trim();
        const stock = STOCK_ELEMENTS[q];
        if (!stock) { setStockResult({ stock: q, analysis: "해당 종목의 오행 데이터가 아직 준비되지 않았습니다. (코스피200·나스닥200 한정)" }); return; }

        const myEl = result.profile.element;
        const key = `${myEl}-${stock.element}`;
        const match = ELEMENT_MATCH[key] || "중립적인 상호작용";

        const advice = result.today.relation?.includes("재성")
            ? "오늘 재물운이 좋은 날입니다. 단기 매매 타이밍으로 적합합니다."
            : result.today.relation?.includes("관성")
            ? "관성의 날 — 압박이 있을 수 있으니 방어적 접근을 추천합니다."
            : "중립적인 흐름입니다. 장기적 관점에서 접근하세요.";

        const analysis = `${stock.name}(${q}) — ${stock.desc}\n\n사주 궁합: ${match}\n\n${advice}\n\n※ 장기: ${result.today.relation?.includes("재성") ? "3-6개월 보유 추천" : result.today.relation?.includes("관성") ? "1개월 내 단기 대응" : "분할 매수 접근"}`;

        setStockResult({ stock: q, analysis });
        setStockQuery("");
        const newHist = [{ stock: q, analysis }, ...stockHistory].slice(0, 10);
        setStockHistory(newHist);
        localStorage.setItem("saju-stock-history", JSON.stringify(newHist));
    };

    const fortuneKeys = ["재물운","사업운","학업운","연애운","건강운"];
    const fortuneColors = ["#f59e0b","#22c55e","#6c5ce7","#ec4899","#3b82f6"];

    return (
        <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
            <div className="text-center">
                <h1 className="text-2xl font-bold">🔮 사주로 보는 주식 궁합</h1>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                    사주 기반 나스닥·코스닥 종목 궁합 분석
                </p>
            </div>

            {/* 입력 폼 */}
            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
                <h2 className="text-sm font-bold flex items-center gap-2"><Calendar className="w-4 h-4" /> 사주 정보 입력</h2>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] text-[var(--text-muted)]">생년월일 (YYYY-MM-DD)</label>
                        <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] text-xs" />
                    </div>
                    <div>
                        <label className="text-[10px] text-[var(--text-muted)]">태어난 시간 (선택)</label>
                        <select value={birthHour ?? ""} onChange={e => setBirthHour(e.target.value ? Number(e.target.value) : null)}
                            className="w-full mt-1 px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] text-xs">
                            <option value="">모름</option>
                            {hours.map(h => (
                                <option key={h} value={h}>{h}시 {hourLabels[h] && `(${hourLabels[h]})`}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] text-[var(--text-muted)]">성별</label>
                        <select value={gender} onChange={e => setGender(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] text-xs">
                            <option value="">선택</option>
                            <option value="male">남성</option>
                            <option value="female">여성</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-[var(--text-muted)]">닉네임</label>
                        <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="홍길동"
                            className="w-full mt-1 px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] text-xs" />
                    </div>
                </div>

                {/* 위험 고지 */}
                <label className="flex items-start gap-2 text-[10px] text-[var(--text-muted)] cursor-pointer">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" />
                    <span>주의: 사주의 통변을 다 적용한 것이 아니며, 취미와 재미로 살펴보시기 바랍니다. 사주를 기반으로 한 주식 투자는 과학과 통계, 퀀트의 영역이 아니며 리스크가 큽니다. 투자는 투자 전문가의 상담을 통해 진행하세요. 본 서비스는 결과에 대해 책임지지 않습니다.</span>
                </label>

                <button onClick={submitSaju} disabled={loading}
                    className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium disabled:opacity-50">
                    {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> 분석 중...</span> : "🔮 사주 분석하기"}
                </button>
                {error && <p className="text-[#ef4444] text-[10px]">{error}</p>}
            </div>

            {/* 사주 결과 */}
            {result && (
                <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-2xl">
                            {({"wood":"🌳","fire":"🔥","earth":"⛰️","metal":"⚒️","water":"💧"} as any)[result.profile.element]}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">{result.profile.ilju}</h3>
                            <p className="text-[10px] text-[var(--text-muted)]">
                                {result.profile.elementKr} · {result.profile.polarity} · {result.nickname || "사용자"}님
                            </p>
                        </div>
                        <div className="ml-auto text-right">
                            <div className="text-[10px] text-[var(--text-muted)]">오늘의 일진</div>
                            <div className="font-bold">{result.today.ilju}</div>
                            <div className="text-[10px] text-[var(--accent-glow)]">{result.today.relation}</div>
                        </div>
                    </div>

                    {/* 5운 */}
                    <div className="grid grid-cols-5 gap-2">
                        {fortuneKeys.map((key, i) => (
                            <div key={key} className="text-center rounded bg-[var(--bg)] p-2">
                                <div className="text-lg">{["💰","📈","📚","💕","💪"][i]}</div>
                                <div className="text-[11px] font-bold mt-1" style={{ color: fortuneColors[i] }}>{key}</div>
                                <div className="text-xs font-bold">{result.fortune?.[key] ?? "-"}점</div>
                                <div className="text-[9px] text-[var(--text-muted)]">{result.summary?.[key.toLowerCase().replace("운","") as keyof typeof result.summary] ?? ""}</div>
                            </div>
                        ))}
                    </div>

                    <div className="text-[10px] text-[var(--text-muted)] space-y-1 bg-[var(--bg)] rounded p-2">
                        <p><Sparkles className="w-3 h-3 inline" /> {result.summary?.header}</p>
                        <p>⚠ {result.summary?.caution}</p>
                        <p>📌 투자 포인트: {result.summary?.investFocus}</p>
                    </div>

                    {/* 주식 채팅 */}
                    <div className="border-t border-[var(--border)] pt-3">
                        <h4 className="text-[11px] font-semibold mb-2">💬 종목 사주 궁합 물어보기</h4>
                        <form onSubmit={askStock} className="flex gap-2">
                            <input type="text" value={stockQuery} onChange={e => setStockQuery(e.target.value)}
                                placeholder="티커 입력 (예: NVDA, TSLA, 005930)"
                                className="flex-1 px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] text-xs" />
                            <button type="submit" className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs"><Send className="w-3 h-3" /></button>
                        </form>
                        {stockResult && (
                            <div className="mt-2 p-2 rounded bg-[var(--bg)] text-[10px] whitespace-pre-wrap">{stockResult.analysis}</div>
                        )}
                        {stockHistory.length > 0 && (
                            <div className="mt-2">
                                <div className="text-[9px] text-[var(--text-muted)] mb-1">이전 내역</div>
                                {stockHistory.slice(0, 5).map((h, i) => (
                                    <div key={i} className="text-[9px] text-[var(--text-muted)] py-0.5 border-b border-[var(--border)] last:border-0">
                                        <button onClick={() => setStockResult(h)} className="hover:text-[var(--text)] text-left">
                                            {h.stock} — {h.analysis.slice(0, 60)}...
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 리스크 고지 */}
            <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[10px] text-[var(--text-muted)] space-y-1">
                <p className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-[var(--warning)]" /> <strong>리스크 고지</strong></p>
                <p>사주를 기반으로 한 주식 투자는 과학과 통계, 퀀트의 영역이 아니며 리스크가 매우 큽니다. 모든 투자는 반드시 투자 전문가와 상의하여 결정하시기 바랍니다. 본 서비스는 투자 결과에 대해 어떠한 책임도 지지 않습니다.</p>
            </div>
        </div>
    );
}
