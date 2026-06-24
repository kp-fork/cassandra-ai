"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Share2, Copy, Eye, ExternalLink, AlertTriangle, BarChart3, Clock, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

const TOOLTIP_STYLE = { backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 12 };

// 레짐 색상
const REGIME_COLOR: Record<number, string> = { 0:"#ef4444", 1:"#f59e0b", 2:"#6c5ce7", 3:"#22c55e" };
const REGIME_LABEL: Record<number, string> = { 0:"하락", 1:"횡보", 2:"상승", 3:"급등" };
const SIG_STYLE: Record<string, string> = {
  BUY:  "bg-[#22c55e]/10 text-[#22c55e]",
  SELL: "bg-[#ef4444]/10 text-[#ef4444]",
  HOLD: "bg-[#f59e0b]/10 text-[#f59e0b]",
  "—":  "bg-[var(--border)] text-[var(--text-muted)]",
};

interface StockData {
  name: string; code: string; price: string; change: string; changePercent: number;
}

interface QuantResponse {
  generatedAt: string;
  marketGauge: { fear: number; neutral: number; greed: number };
  stocks: StockData[];
  fromCache?: boolean;
  cachedSecondsAgo?: number;
  stale?: boolean;
}

function buildRegimeStocks(stocks: StockData[]) {
  return stocks.map(s => {
    const delta = s.changePercent;
    let score = 50 + delta * 5; // base 50, ±등락
    score = Math.max(0, Math.min(100, Math.round(score)));
    const signal = delta > 1 ? "매수" : delta < -1 ? "매도" : "관망";
    const color = delta > 1 ? "#22c55e" : delta < -1 ? "#ef4444" : "#f59e0b";
    return { name: s.name, score, signal, color };
  });
}

export default function QuantDashboard() {
  const [visitors, setVisitors] = useState({ today: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [quantPopup, setQuantPopup] = useState<string | null>(null);
  const [hookMsg, setHookMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 실시간 데이터
  const [regimeStocks, setRegimeStocks] = useState<{ name: string; score: number; signal: string; color: string }[]>([]);
  const [cacheInfo, setCacheInfo] = useState("");
  const [quantRT, setQuantRT] = useState<any>(null); // ARDS-X + AMQS + ARDS 실시간
  const [sectorData, setSectorData] = useState<{ marketAvg: number; marketStatus: string; sectors: any[] } | null>(null);
  const [muHynixData, setMuHynixData] = useState<{ prediction: any; backtest: any } | null>(null);
  const [marketOverview, setMarketOverview] = useState<any>(null);
  const [nasdaqMovers, setNasdaqMovers] = useState<any>(null);
  const [moversTab, setMoversTab] = useState<"daily" | "weekly">("daily");

  const hookMessages = [
    "🚀 AI가 찾은 이번 주 유망 종목은?",
    "📉 하락장에서도 수익 내는 퀀트 전략",
    "🤖 LLM이 분석하는 시장 심리, 지금은?",
    "💡 개미털기 당하기 전에 확인하세요",
    "🔥 NASDAQ Top 100, AI가 보는 국면은?",
    "⚡ 엔비디아·테슬라·애플 — 퀀트 시그널",
    "🎯 이번 달 AMQS-M7 수익률 공개",
  ];

  const fetchQuantData = useCallback(async (force: boolean) => {
    setLoading(true);
    setError("");
    try {
      const url = force ? "/api/quant-data?force=true" : "/api/quant-data";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: QuantResponse = await res.json();

      if (data.stocks?.length) {
        setRegimeStocks(buildRegimeStocks(data.stocks));
      }

      setUpdatedAt(new Date(data.generatedAt).toLocaleString("ko-KR"));

      if (data.fromCache) {
        const min = Math.floor((data.cachedSecondsAgo || 0) / 60);
        const sec = (data.cachedSecondsAgo || 0) % 60;
        const staleTag = data.stale ? " (만료)" : "";
        setCacheInfo(`Redis 캐시${staleTag} · ${min}분 ${sec}초 전`);
      } else {
        setCacheInfo("실시간 · Naver Finance");
      }
    } catch (e: any) {
      setError(e.message || "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 방문 기록 + 통계 조회
    fetch("/api/pageview", { method: "POST", body: JSON.stringify({ path: "/quant" }) }).catch(() => {});
    fetch("/api/pageview?path=/quant").then(r => r.json()).then(d => {
      setVisitors({ today: d.today || 0, total: d.total || 0 });
    }).catch(() => {});
    setUpdatedAt(new Date().toLocaleString("ko-KR"));
    const count = 2 + Math.floor(Math.random() * 4);
    const shuffled = [...hookMessages].sort(() => Math.random() - 0.5);
    setHookMsg(shuffled.slice(0, count).join("\n"));
    fetchQuantData(false);
    // ARDS-X + AMQS + ARDS 실시간
    fetch("/api/quant").then(r => r.json()).then(d => {
      if (d.ardsX || d.amqs) setQuantRT(d);
    }).catch(() => {});
    // 섹터 공포·탐욕 지수
    fetch("/api/sector-fear-greed").then(r => r.json()).then(d => {
      if (d.sectors?.length) setSectorData(d);
    }).catch(() => {});
    // MU → 하이닉스 예측
    fetch("/api/mu-hynix").then(r => r.json()).then(d => {
      if (d.prediction || d.backtest) setMuHynixData(d);
    }).catch(() => {});
    // 시장 오버뷰
    fetch("/api/market-overview").then(r => r.json()).then(d => {
      if (d.etfs || d.sectors) setMarketOverview(d);
    }).catch(() => {});
    // NASDAQ 상승/하락 TOP
    fetch("/api/nasdaq-movers").then(r => r.json()).then(d => {
      if (d.daily || d.weekly) setNasdaqMovers(d);
    }).catch(() => {});
  }, []);

  const shareText = `📊 CASSANDRA AI — 퀀트 대시보드\n\nAI×퀀트로 분석하는 코스닥 시장\nARS-X·AMQS·ARDS 전략\n\nhttps://dart-monitor-pi.vercel.app/quant`;
  const handleCopy = () => { navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 CASSANDRA AI — 퀀트 대시보드</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">AI × 퀀트 × 미국 주식 × DART 공시 기반 코스닥 시장 분석</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            <Clock className="w-3 h-3" /> 데이터 갱신
          </div>
          <div className="text-xs text-[var(--accent-glow)]">{updatedAt}</div>
          <button
            onClick={() => fetchQuantData(true)}
            disabled={loading}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] mt-1 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> {loading ? "갱신 중..." : "새로고침"}
          </button>
          <div className="flex gap-2 mt-1 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{visitors.today}</span>
            <span>누적 {visitors.total}</span>
          </div>
          <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{cacheInfo}</div>
        </div>
      </div>

      {/* 시장 오버뷰 */}
      {marketOverview && (
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <div className="grid gap-5 md:grid-cols-3">
            {/* 인기 ETF */}
            <div>
              <h3 className="text-[11px] font-bold mb-3 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#22c55e]"></span> 인기 ETF
              </h3>
              <div className="space-y-1.5">
                {marketOverview.etfs?.slice(0, 10).map((e: any) => {
                  const isUp = e.changePct >= 0;
                  return (
                    <div key={e.ticker} className="flex items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold w-12">{e.ticker}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{e.name}</span>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isUp ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-[#ef4444]/10 text-[#ef4444]"}`}>
                        {isUp ? "+" : ""}{e.changePct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 섹터 */}
            <div>
              <h3 className="text-[11px] font-bold mb-3 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#6c5ce7]"></span> 섹터별 등락률
              </h3>
              <div className="space-y-1.5">
                {marketOverview.sectors?.map((s: any) => {
                  const isUp = s.changePct >= 0;
                  const barColor = isUp ? "#22c55e" : "#ef4444";
                  return (
                    <div key={s.ticker} className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] w-16 truncate">{s.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg)] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.abs(s.changePct) * 6)}%`, backgroundColor: barColor, opacity: 0.7 }} />
                      </div>
                      <span className={`text-[10px] font-semibold w-14 text-right ${isUp ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                        {isUp ? "+" : ""}{s.changePct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 지수 + VIX */}
            <div>
              <h3 className="text-[11px] font-bold mb-3 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#f59e0b]"></span> 주요 지수
              </h3>
              <div className="space-y-1.5">
                {marketOverview.indices?.map((idx: any) => {
                  const isUp = idx.changePct >= 0;
                  return (
                    <div key={idx.ticker} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold w-10">{idx.ticker}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{idx.name}</span>
                      </div>
                      <span className={`text-[11px] font-semibold ${isUp ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                        {isUp ? "▲" : "▼"} {Math.abs(idx.changePct)}%
                      </span>
                    </div>
                  );
                })}
                {marketOverview.vix !== null && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold w-10 text-[#ef4444]">VIX</span>
                      <span className="text-[10px] text-[var(--text-muted)]">변동성 지수</span>
                    </div>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded ${marketOverview.vix > 25 ? "bg-[#ef4444]/10 text-[#ef4444]" : marketOverview.vix > 20 ? "bg-[#f59e0b]/10 text-[#f59e0b]" : "bg-[#22c55e]/10 text-[#22c55e]"}`}>
                      {marketOverview.vix}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-[8px] text-[var(--text-muted)] mt-2">
            갱신: {new Date(marketOverview.generatedAt).toLocaleString("ko-KR")} · Yahoo Finance
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. 섹터별 공포·탐욕 지수 (시장 게이지 대체) */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <span className="text-lg">{sectorData ? (sectorData.marketAvg < 40 ? "🔥" : sectorData.marketAvg < 50 ? "😨" : sectorData.marketAvg < 60 ? "😐" : sectorData.marketAvg < 80 ? "😈" : "🤑") : "📊"}</span>
            섹터별 공포·탐욕 지수
            {sectorData && (
              <span className={`ml-1 text-[11px] ${sectorData.marketAvg < 40 ? "text-[#ef4444]" : sectorData.marketAvg < 60 ? "text-[var(--text-muted)]" : "text-[#22c55e]"}`}>
                (평균 {sectorData.marketAvg} — {sectorData.marketStatus})
              </span>
            )}
          </h2>
          {sectorData && sectorData.sectors.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {sectorData.sectors.map((s: any) => (
                  <div key={s.ticker} className="rounded bg-[var(--bg)] p-2 flex items-center gap-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-xs font-bold" style={{ backgroundColor: s.color + "20", color: s.color }}>
                      {s.ticker}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold truncate">{s.name}</div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, s.score)}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold" style={{ color: s.color }}>{s.score >= 0 ? s.score.toFixed(0) : "N/A"}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">{s.emoji} {s.status}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-[var(--text-muted)] mt-2 text-right">
                Yahoo Finance · 10분 Redis 캐시 · 미국 장 마감 기준
              </p>
            </>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)]">로딩 중...</p>
          )}
          <details className="mt-2 text-[9px] text-[var(--text-muted)]">
            <summary className="cursor-pointer hover:text-[var(--text)]">방법론</summary>
            <p className="mt-1">RSI(14)·MA20·변동성비율·섹터모멘텀vsSPY·거래량서지의 5개 시그널을 가중평균하여 0(공포)~100(탐욕) 점수 산출</p>
          </details>
        </div>

        {/* 2. MU → 하이닉스 예측 */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <span className="text-lg">🔮</span> MU(마이크론) → 하이닉스 예측
            <span className="text-[9px] text-[var(--text-muted)] ml-1">미국장 종가 → 한국장 시가 예측</span>
          </h2>
          {muHynixData?.prediction ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div className="rounded bg-[var(--bg)] p-2">
                  <div className="text-[var(--text-muted)]">마이크론 (MU)</div>
                  <div className="text-lg font-bold mt-1">${muHynixData.prediction.muCurrentPrice}</div>
                  <div className={muHynixData.prediction.muChangePct >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                    {muHynixData.prediction.muChangePct >= 0 ? "▲" : "▼"} {Math.abs(muHynixData.prediction.muChangePct)}%
                  </div>
                </div>
                <div className="rounded bg-[var(--bg)] p-2">
                  <div className="text-[var(--text-muted)]">하이닉스 예측 시가 (000660)</div>
                  <div className="text-lg font-bold mt-1">₩{muHynixData.prediction.hynixPredictedOpen.toLocaleString()}</div>
                  <div className={muHynixData.prediction.hynixPredictedChangePct >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                    {muHynixData.prediction.hynixSignal} {muHynixData.prediction.hynixPredictedChangePct >= 0 ? "▲" : "▼"} {Math.abs(muHynixData.prediction.hynixPredictedChangePct)}%
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-2 text-[9px] text-[var(--text-muted)]">
                <span>β(베타): {muHynixData.prediction.beta}</span>
                <span>R²: {muHynixData.prediction.r2}</span>
                <span>n={muHynixData.prediction.dataPoints}</span>
              </div>
            </>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)]">로딩 중...</p>
          )}
          <details className="mt-2 text-[9px] text-[var(--text-muted)]">
            <summary className="cursor-pointer hover:text-[var(--text)]">14일 백테스트</summary>
            {(() => {
              const bt = muHynixData?.backtest;
              if (!bt || !bt.items?.length) return <p className="mt-1">데이터 쌓이는 중...</p>;
              return (
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between text-[var(--text-muted)] border-b border-[var(--border)] pb-0.5 mb-0.5">
                  <span className="w-16">날짜</span><span className="w-10">MU</span><span className="w-12">예측</span><span className="w-12">실제</span><span className="w-10">차이</span><span className="w-8">적중</span>
                </div>
                {bt.items.map((b: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-[9px]">
                    <span className="w-16">{b.date?.slice(5)}</span>
                    <span className={`w-10 ${b.muChangePct >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>{b.muChangePct}%</span>
                    <span className="w-12">₩{b.hynixPredicted?.toLocaleString()}</span>
                    <span className="w-12">{b.hynixActual ? `₩${b.hynixActual.toLocaleString()}` : "-"}</span>
                    <span className={`w-10 ${b.diffWon >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>{b.diffWon != null ? `${b.diffWon >= 0 ? "+" : ""}${b.diffWon}원` : "-"}</span>
                    <span className={`w-8 text-center font-bold ${b.hit === true ? "text-[#22c55e]" : b.hit === false ? "text-[#ef4444]" : "text-[var(--text-muted)]"}`}>
                      {b.hit === true ? "✓" : b.hit === false ? "✗" : "-"}
                    </span>
                  </div>
                ))}
                <div className="border-t border-[var(--border)] pt-0.5 mt-0.5 flex justify-between text-[9px]">
                  <span>적중률: {bt.accuracy}%</span>
                  <span>{bt.totalHits}/{bt.totalEvaluated}</span>
                </div>
              </div>
            )})()}
          </details>
          <button onClick={() => setQuantPopup("muhynix")} className="mt-2 text-[10px] text-[var(--accent-glow)] hover:underline">
            📂 퀀트 원본 보기 (GitHub)
          </button>
        </div>

        {/* 3. ARDS-X Regime Classifier */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--accent-glow)]" /> 시장 국면 판단 (ARDS-X)</h2>
            {quantRT?.ardsX && (
              <span className="text-[10px] text-[var(--text-muted)]">
                갱신: {new Date(quantRT.generatedAt).toLocaleString("ko-KR")} · Yahoo Finance
              </span>
            )}
          </div>

          {/* 현재 레짐 요약 */}
          {quantRT?.ardsX ? (() => {
            const ax = quantRT.ardsX;
            const rc = REGIME_COLOR[ax.regime] ?? "#6c5ce7";
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg p-2 text-center border" style={{ borderColor: `${rc}60`, background: `${rc}10` }}>
                    <div className="text-[9px] text-[var(--text-muted)]">현재 국면</div>
                    <div className="text-base font-bold mt-0.5" style={{ color: rc }}>{REGIME_LABEL[ax.regime]}</div>
                    <div className="text-[9px]" style={{ color: rc }}>{ax.signal}</div>
                  </div>
                  <div className="rounded-lg p-2 text-center bg-[var(--bg)] border border-[var(--border)]">
                    <div className="text-[9px] text-[var(--text-muted)]">VIX</div>
                    <div className={`text-base font-bold mt-0.5 ${ax.vix > 25 ? "text-[#ef4444]" : ax.vix < 15 ? "text-[#22c55e]" : "text-[#f59e0b]"}`}>{ax.vix}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">{ax.vix > 25 ? "공포" : ax.vix < 15 ? "안정" : "중립"}</div>
                  </div>
                  <div className="rounded-lg p-2 text-center bg-[var(--bg)] border border-[var(--border)]">
                    <div className="text-[9px] text-[var(--text-muted)]">RSI(14)</div>
                    <div className={`text-base font-bold mt-0.5 ${ax.rsi < 30 ? "text-[#22c55e]" : ax.rsi > 70 ? "text-[#ef4444]" : "text-white"}`}>{ax.rsi?.toFixed(0)}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">{ax.rsi < 30 ? "과매도" : ax.rsi > 70 ? "과매수" : "중립"}</div>
                  </div>
                  <div className="rounded-lg p-2 text-center bg-[var(--bg)] border border-[var(--border)]">
                    <div className="text-[9px] text-[var(--text-muted)]">20일 고점↓</div>
                    <div className={`text-base font-bold mt-0.5 ${Math.abs(ax.drawdown20) > 5 ? "text-[#ef4444]" : "text-white"}`}>{ax.drawdown20?.toFixed(1)}%</div>
                    <div className="text-[9px] text-[var(--text-muted)]">QQQ 기준</div>
                  </div>
                </div>

                {/* 레짐 히스토리 차트 */}
                {ax.history?.length > 0 && (
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={ax.history}>
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={s => s.slice(5)} interval={3} />
                      <YAxis domain={[0, 3]} ticks={[0,1,2,3]} tick={{ fontSize: 9, fill: "#888" }} width={20} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [REGIME_LABEL[v] ?? v, "국면"]} />
                      <Line type="stepAfter" dataKey="regime" stroke="#6c5ce7" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <div className="flex gap-3 text-[9px]">
                  {[0,1,2,3].map(r => <span key={r} style={{ color: REGIME_COLOR[r] }}>{r}:{REGIME_LABEL[r]}</span>)}
                </div>
              </div>
            );
          })() : (
            <p className="text-[10px] text-[var(--text-muted)] animate-pulse">QQQ 데이터 로딩 중…</p>
          )}

          <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
            <strong>ARDS-X</strong>: QQQ 실데이터(MA20/MA60/RSI/VIX)로 시장 국면을 4단계 분류.
            상승 국면 → 공격적 비중 / 하락 국면 → 현금 비중 확대.
          </p>
          <button onClick={() => setQuantPopup("ardsx")} className="mt-1 text-[10px] text-[var(--accent-glow)] hover:underline">
            📂 퀀트 원본 보기 (GitHub)
          </button>
        </div>

        {/* 4. AMQS / AMQS-M7 */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#22c55e]" /> AI 반도체 모멘텀 (AMQS / AMQS-M7)</h2>
            {quantRT?.amqs && (
              <span className="text-[10px] text-[var(--text-muted)]">
                전략 모멘텀 <span className={`font-bold ${(quantRT.amqs.avgMom ?? 0) >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                  {(quantRT.amqs.avgMom ?? 0) >= 0 ? "+" : ""}{quantRT.amqs.avgMom?.toFixed(1)}%
                </span>
              </span>
            )}
          </div>

          {/* AMQS 모멘텀 히스토리 */}
          {quantRT?.amqs?.history?.length > 0 && (
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={quantRT.amqs.history}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={s => s.slice(5)} interval={3} />
                <YAxis tick={{ fontSize: 9, fill: "#888" }} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`, "20일 모멘텀"]} />
                <Line type="monotone" dataKey="amqs" stroke="#22c55e" strokeWidth={2} dot={false} name="NVDA 모멘텀" />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* AMQS-M7 종목별 실시간 */}
          {quantRT?.amqs?.stocks?.length > 0 ? (
            <div className="mt-3 space-y-1 text-[10px]">
              <h4 className="font-semibold text-[var(--text-muted)] mb-1">📊 AMQS-M7 실시간 시그널</h4>
              {quantRT.amqs.stocks.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg)]">
                  <span className="flex items-center gap-1">{s.emoji} <span className="font-bold">{s.ticker}</span> <span className="text-[var(--text-muted)]">{s.name}</span></span>
                  <div className="flex items-center gap-2">
                    {s.price && <span className="font-mono">${s.price}</span>}
                    {s.change1d != null && (
                      <span className={s.change1d >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                        {s.change1d >= 0 ? "+" : ""}{s.change1d}%
                      </span>
                    )}
                    {s.momentum20 != null && (
                      <span className="text-[var(--text-muted)]">20d:{s.momentum20 >= 0 ? "+" : ""}{s.momentum20}%</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${SIG_STYLE[s.signal] ?? SIG_STYLE["—"]}`}>{s.signal}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)] mt-2 animate-pulse">종목 데이터 로딩 중…</p>
          )}

          <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
            <strong>AMQS</strong>: NVDA·AVGO·AMD·QCOM·ASML·MU·TSM 실데이터 기반 20일 모멘텀.
            Yahoo Finance 실시간 · 캐시 30분(장중) / 2시간(마감후).
          </p>
          <button onClick={() => setQuantPopup("amqs")} className="mt-1 text-[10px] text-[var(--accent-glow)] hover:underline">
            📂 퀀트 원본 보기 (GitHub)
          </button>
        </div>

        {/* 5. ARDS 헤지 */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-[#ef4444]" /> 방어·헤지 (ARDS)</h2>

          {(() => {
            const hedge = quantRT?.hedge ?? { long: 65, hedge: 25, safe: 10 };
            const regime = quantRT?.ardsX?.regime ?? 2;
            const rc = REGIME_COLOR[regime];
            const items = [
              { label: "AMQS-M7 Long", pct: hedge.long, color: "#22c55e", signal: "매수", desc: "AI 반도체 모멘텀" },
              { label: "헤지 (인버스/풋)", pct: hedge.hedge, color: "#ef4444", signal: "헤지", desc: "하락장 방어" },
              { label: "안전자산 (국채/금)", pct: hedge.safe, color: "#f59e0b", signal: "안전", desc: "무위험 수익" },
            ];
            return (
              <div className="space-y-3">
                {/* 현재 레짐 기반 메시지 */}
                <div className="rounded-lg p-2.5 text-[10px] border" style={{ borderColor: `${rc}50`, background: `${rc}08` }}>
                  <span style={{ color: rc }}>■ {REGIME_LABEL[regime]} 국면</span>
                  <span className="text-[var(--text-muted)] ml-2">
                    {regime === 0 && "현금 비중 최대화 — 헤지 강화"}
                    {regime === 1 && "균형 유지 — 중립 헤지"}
                    {regime === 2 && "롱 비중 우선 — 소폭 헤지"}
                    {regime === 3 && "풀 롱 — 헤지 최소화"}
                  </span>
                </div>

                {items.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-24 text-[10px] text-[var(--text-muted)] shrink-0">{s.label}</div>
                    <div className="flex-1 h-4 bg-[var(--bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.pct}%`, background: s.color, opacity: 0.8 }} />
                    </div>
                    <div className="text-[11px] font-bold w-8 text-right" style={{ color: s.color }}>{s.pct}%</div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] w-8 text-center ${SIG_STYLE[s.signal] ?? ""}`}>{s.signal}</span>
                  </div>
                ))}

                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <div className="p-2 rounded bg-[var(--bg)] text-center border border-[var(--border)]">
                    <div className="text-[var(--text-muted)] text-[9px]">AMQS-M7</div>
                    <div className="font-bold" style={{ color:"#22c55e" }}>{hedge.long}%</div>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg)] text-center border border-[var(--border)]">
                    <div className="text-[var(--text-muted)] text-[9px]">헤지</div>
                    <div className="font-bold" style={{ color:"#ef4444" }}>{hedge.hedge}%</div>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg)] text-center border border-[var(--border)]">
                    <div className="text-[var(--text-muted)] text-[9px]">안전</div>
                    <div className="font-bold" style={{ color:"#f59e0b" }}>{hedge.safe}%</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
            <strong>ARDS</strong>: ARDS-X 레짐에 따라 헤지 비중 자동 조정.
            레짐 0(하락) → 헤지 35% / 레짐 3(급등) → 헤지 0%.
          </p>
          <button onClick={() => setQuantPopup("ards")} className="mt-1 text-[10px] text-[var(--accent-glow)] hover:underline">
            📂 퀀트 원본 보기 (GitHub)
          </button>
        </div>

        {/* 5. NASDAQ 데일리/주간 상승·하락 TOP */}
        <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#22c55e]" /> NASDAQ 상승·하락 TOP</h2>
            <div className="flex gap-1">
              <button onClick={() => setMoversTab("daily")} className={`px-2 py-0.5 rounded text-[10px] ${moversTab === "daily" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>데일리</button>
              <button onClick={() => setMoversTab("weekly")} className={`px-2 py-0.5 rounded text-[10px] ${moversTab === "weekly" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>주간</button>
            </div>
          </div>
          {nasdaqMovers ? (
            moversTab === "daily" ? (
              <>
                {/* 데일리 상승 Top10 */}
                <div className="text-[10px] mb-2">
                  <div className="text-[var(--text-muted)] border-b border-[var(--border)] pb-0.5 mb-1">🟢 데일리 상승 Top 10</div>
                  {nasdaqMovers.daily.gainers.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5 hover:bg-[var(--bg)] rounded px-0.5 text-[10px]">
                      <span className="font-semibold shrink-0">{s.ticker}</span>
                      <span className="text-[var(--text-muted)] shrink-0">-</span>
                      <span className="truncate min-w-0">{s.name}</span>
                      <span className="font-bold text-[#22c55e] shrink-0 ml-1">+{s.changePct}%</span>
                      <span className="text-[var(--text-muted)] truncate min-w-0 ml-1">{s.reason}</span>
                    </div>
                  ))}
                </div>
                {/* 데일리 하락 Top10 */}
                <div className="text-[10px]">
                  <div className="text-[var(--text-muted)] border-b border-[var(--border)] pb-0.5 mb-1">🔴 데일리 하락 Top 10</div>
                  {nasdaqMovers.daily.losers.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5 hover:bg-[var(--bg)] rounded px-0.5 text-[10px]">
                      <span className="font-semibold shrink-0">{s.ticker}</span>
                      <span className="text-[var(--text-muted)] shrink-0">-</span>
                      <span className="truncate min-w-0">{s.name}</span>
                      <span className="font-bold text-[#ef4444] shrink-0 ml-1">{s.changePct}%</span>
                      <span className="text-[var(--text-muted)] truncate min-w-0 ml-1">{s.reason}</span>
                    </div>
                  ))}
                </div>
                <div className="text-right text-[8px] text-[var(--text-muted)] mt-1">
                  갱신: {new Date(nasdaqMovers.daily.generatedAt).toLocaleString("ko-KR")} · 미국장 2회 자동 갱신
                </div>
              </>
            ) : (
              <>
                {/* 주간 상승 Top20 */}
                <div className="text-[10px] mb-2">
                  <div className="text-[var(--text-muted)] border-b border-[var(--border)] pb-0.5 mb-1">주간 상승 Top 20 (6/8 — 6/13)</div>
                  {nasdaqMovers.weekly.gainers.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 py-0.5 hover:bg-[var(--bg)] rounded px-0.5 text-[9px]">
                      <span className="font-semibold shrink-0">{s.ticker}</span>
                      <span className="text-[var(--text-muted)] shrink-0">-</span>
                      <span className="truncate min-w-0">{s.name}</span>
                      <span className="font-bold text-[#22c55e] shrink-0 ml-1">+{s.changePct}%</span>
                      <span className="text-[var(--text-muted)] truncate min-w-0 ml-1">{s.reason}</span>
                    </div>
                  ))}
                </div>
                {/* 주간 하락 Top10 */}
                <div className="text-[10px]">
                  <div className="text-[var(--text-muted)] border-b border-[var(--border)] pb-0.5 mb-1">주간 하락 Top 10 (6/8 — 6/13)</div>
                  {nasdaqMovers.weekly.losers.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 py-0.5 hover:bg-[var(--bg)] rounded px-0.5 text-[9px]">
                      <span className="font-semibold shrink-0">{s.ticker}</span>
                      <span className="text-[var(--text-muted)] shrink-0">-</span>
                      <span className="truncate min-w-0">{s.name}</span>
                      <span className="font-bold text-[#ef4444] shrink-0 ml-1">{s.changePct}%</span>
                      <span className="text-[var(--text-muted)] truncate min-w-0 ml-1">{s.reason}</span>
                    </div>
                  ))}
                </div>
                <div className="text-right text-[8px] text-[var(--text-muted)] mt-1">
                  기준일: 2026-06-13
                </div>
              </>
            )
          ) : (
            <p className="text-[10px] text-[var(--text-muted)]">로딩 중...</p>
          )}
        </div>
      </div>

      {/* 퀀트 원본 팝업 */}
      {quantPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setQuantPopup(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                {quantPopup === "ardsx" ? "ARDS-X Regime Classifier" : quantPopup === "amqs" ? "AMQS / AMQS-M7" : quantPopup === "ards" ? "ARDS 헤지 전략" : "MU → 하이닉스 예측"}
              </h3>
              <button onClick={() => setQuantPopup(null)} className="p-1 rounded hover:bg-[var(--border)]">✕</button>
            </div>
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>📂 원본 퀀트 전략은 GitHub에서 확인하세요:</p>
              <a href="https://github.com/gameworkerkim/vibe-investing/tree/main/01.Trading%20Strategy" target="_blank" className="text-[var(--accent-glow)] hover:underline block">
                github.com/gameworkerkim/vibe-investing/tree/main/01.Trading Strategy
              </a>
              <div className="bg-[var(--surface)] rounded-lg p-4 text-xs font-mono whitespace-pre-wrap">
                {quantPopup === "ardsx" && `# ARDS-X Regime Classifier\n# NASDAQ Top 100 기반 시장 국면 판단\n\nRegime 0: 하락 → 현금 비중 80% +\nRegime 1: 횡보 → 현금 50% + 롱 50%\nRegime 2: 상승 → 롱 80% + 현금 20%\nRegime 3: 급등 → 롱 100% (트레일링 스탑)\n\n지표: VIX, MA20/60, RSI(14), Volume SMA`}
                {quantPopup === "amqs" && `# AMQS (AI Momentum Quant Strategy)\n# AI·반도체 섹터 모멘텀 추종\n\nAMQS-M7 구성: NVDA, TSMC, SK Hynix, Samsung, ASML, AMD, QCOM\n리밸런싱: 월 1회 (매월 1일)\n비중: 동일가중 (Equal Weight) → 모멘텀 가중\n진입: 20일 모멘텀 > 5% → 매수\n청산: 20일 모멘텀 < -5% → 매도`}
                {quantPopup === "ards" && `# ARDS (AI Risk Diversification Strategy)\n# AMQS-M7 대칭 헤지 전략\n\nLong: AMQS-M7 (65%)\nHedge: KOSDAQ150 Inverse (25%)\nSafe: 국고채 10년 (10%)\n\n헤지 트리거: ARDS-X Regime = 0 (하락)\n비중 캡: Median + 15% (과도한 레버리지 방지)\n리밸런싱: 주 1회 (매주 월요일)`}
                {quantPopup === "muhynix" && `# MU → 하이닉스 예측 (Cross-Market)\n# 미국장 마이크론 → 한국장 하이닉스 시가 예측\n\nHynix_predicted = Hynix_close * (1 + β * MU_pctChange)\nβ: 선형 회귀 베타 (20일 롤링)\n시그널: MU ±1% 이상 → 하이닉스 상승/하락 예측\n\n데이터: Yahoo Finance\n저장: PostgreSQL + GitHub Dart_Data/prediction/`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 친구 추천 */}
      <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
        <h3 className="text-sm font-bold flex items-center justify-center gap-2 mb-2"><Share2 className="w-4 h-4" /> 친구에게 추천하기</h3>
        <div className="bg-[var(--bg)] rounded-lg p-3 text-xs text-left font-mono whitespace-pre-wrap mb-2">{shareText}</div>
        <button onClick={handleCopy} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium">
          {copied ? "✅ 복사 완료!" : <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> 메시지 복사</span>}
        </button>
      </div>

      {/* CASSANDRA AI 링크 */}
      <div className="rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 p-4 text-center">
        <h3 className="text-lg font-bold text-[var(--accent-glow)]">CASSANDRA AI</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">DART 공시 기반 관계망 분석 · 인물 검색 · 이상 징후 탐지</p>
        <a href="/" className="inline-block mt-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium">로그인하고 분석 시작하기</a>
      </div>

      {/* 위험 고지 */}
      <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2 text-[10px] text-[var(--text-muted)]">
        <p className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-[var(--warning)]" /> <strong className="text-[var(--warning)]">위험 고지</strong></p>
        <p>본 대시보드는 AI와 퀀트 모델을 활용한 시장 분석 도구입니다. 특정 종목의 매수·매도를 권유하지 않으며, 모든 투자 결정은 이용자 본인의 판단과 책임하에 이루어져야 합니다. 퀀트 지표는 과거 데이터 기반이므로 미래 수익을 보장하지 않습니다.</p>
      </div>

      <div className="text-center text-xs text-[var(--text-muted)] space-y-1">
        <a href="https://github.com/gameworkerkim/vibe-investing" target="_blank" className="text-[var(--accent-glow)] hover:underline flex items-center justify-center gap-1">
          <ExternalLink className="w-3 h-3" /> github.com/gameworkerkim/vibe-investing
        </a>
        <p>AI × 퀀트 × DART 공시 기반 코스닥 시장 분석 오픈소스</p>
      </div>
    </div>
  );
}
