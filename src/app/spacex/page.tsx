"use client";

import { useEffect, useState, useCallback } from "react";
import { Rocket, RefreshCw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";

const GROUP_LABEL: Record<string, string> = {
  pure_space: "🚀 Pure Space",
  etf: "📦 Space ETF",
  defense: "🛡 Defense / Aerospace",
};

const SIGNAL_STYLE: Record<string, string> = {
  BUY:   "bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30",
  HOLD:  "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30",
  AVOID: "bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30",
  SELL:  "bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30",
};

function fmtPct(v: number | null, digits = 1) {
  if (v == null) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function fmtNum(v: number | null, digits = 2) {
  if (v == null) return "-";
  return `$${v.toFixed(digits)}`;
}

// Williams %R 게이지 바
function WilliamsRBar({ value }: { value: number | null }) {
  if (value == null) return <div className="text-[10px] text-[var(--text-muted)]">-</div>;
  // value: -100 ~ 0 → position: 0 ~ 100
  const pos = Math.abs(value); // 0=overbought end, 100=oversold end
  const color = pos >= 80 ? "#22c55e" : pos <= 20 ? "#ef4444" : "#f59e0b";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] text-[var(--text-muted)]">
        <span>과매수</span>
        <span className="font-semibold" style={{ color }}>{value.toFixed(1)}</span>
        <span>과매도</span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--border)]">
        <div className="absolute inset-y-0 left-0 w-1/5 rounded-l-full bg-[#ef4444]/20" />
        <div className="absolute inset-y-0 right-0 w-1/5 rounded-r-full bg-[#22c55e]/20" />
        <div
          className="absolute top-0.5 w-2.5 h-1 rounded-full -translate-x-1/2"
          style={{ left: `${pos}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-[9px] text-[var(--text-muted)] text-center">
        {pos >= 80 ? "😰 과매도 — 반등 기대" : pos <= 20 ? "🔥 과매수 — 조정 주의" : "😐 중립 구간"}
      </div>
    </div>
  );
}

// 점수 막대 -3 ~ +3
function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = ((score + 3) / 6) * 100;
  const color = score >= 1.5 ? "#22c55e" : score <= -1.5 ? "#ef4444" : "#f59e0b";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] text-[var(--text-muted)]">
        <span>-3 매도</span>
        <span className="font-bold text-xs" style={{ color }}>{score >= 0 ? "+" : ""}{score.toFixed(1)}</span>
        <span>매수 +3</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-[var(--border)]">
        <div className="absolute top-0 left-1/2 bottom-0 w-px bg-[var(--border)]" />
        <div
          className="absolute inset-y-0 rounded-full transition-all"
          style={{
            left: score < 0 ? `${pct}%` : "50%",
            right: score >= 0 ? `${100 - pct}%` : "50%",
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function StockCard({ stock, expanded, onToggle }: { stock: any; expanded: boolean; onToggle: () => void }) {
  const chg1d = stock.change1d;
  const chgColor = chg1d == null ? "text-[var(--text-muted)]" : chg1d >= 0 ? "text-[#22c55e]" : "text-[#ef4444]";

  return (
    <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      {/* 헤더 */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--border)]/20 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{stock.symbol}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SIGNAL_STYLE[stock.signal] || SIGNAL_STYLE.HOLD}`}>
              {stock.signal}
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] truncate">{stock.name}</div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-bold">{fmtNum(stock.price)}</div>
          <div className={`text-[10px] font-medium ${chgColor}`}>
            {fmtPct(stock.change1d)}
          </div>
        </div>

        <div className="shrink-0 w-24">
          <WilliamsRBar value={stock.williamsR} />
        </div>

        <div className="shrink-0 text-[var(--text-muted)]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* 펼침 — 퀀트 상세 */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-4 bg-[var(--bg)]/40">
          {/* 퀀트 점수 */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1">종합 퀀트 점수</p>
            <ScoreBar score={stock.score} />
          </div>

          {/* 지표 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <IndicatorBox label="Williams %R" value={stock.williamsR?.toFixed(1)} unit="" note={
              stock.williamsR <= -80 ? "과매도" : stock.williamsR >= -20 ? "과매수" : "중립"
            } />
            <IndicatorBox label="RSI 14" value={stock.rsi14?.toFixed(1)} unit="" note={
              stock.rsi14 < 30 ? "과매도" : stock.rsi14 > 70 ? "과매수" : "중립"
            } />
            <IndicatorBox label="SMA 20" value={stock.sma20?.toFixed(2)} unit="$" note={
              stock.price > stock.sma20 ? "📈 위 (강세)" : "📉 아래 (약세)"
            } />
            <IndicatorBox label="SMA 50" value={stock.sma50?.toFixed(2)} unit="$" note={
              stock.price > stock.sma50 ? "📈 위 (강세)" : "📉 아래 (약세)"
            } />
            <IndicatorBox label="20일 모멘텀" value={stock.momentum20?.toFixed(1)} unit="%" note={
              stock.momentum20 > 10 ? "강한 상승" : stock.momentum20 < -10 ? "강한 하락" : "보합"
            } />
            <IndicatorBox label="5일 변동" value={stock.change5d?.toFixed(1)} unit="%" />
            <IndicatorBox label="52W 고점" value={stock.high52w?.toFixed(2)} unit="$" note={
              stock.high52w ? `현재 고점 대비 ${(((stock.price / stock.high52w) - 1) * 100).toFixed(1)}%` : ""
            } />
            <IndicatorBox label="52W 저점" value={stock.low52w?.toFixed(2)} unit="$" note={
              stock.low52w ? `저점 대비 +${(((stock.price / stock.low52w) - 1) * 100).toFixed(1)}%` : ""
            } />
          </div>

          {/* 심리 분석 (Williams %R 해설) */}
          <div className="rounded-lg bg-[var(--surface)] border border-[var(--border)] p-3">
            <p className="text-[10px] font-semibold mb-1">🧠 시장 심리 분석 (Williams %R)</p>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {wilRComment(stock.williamsR, stock.symbol)}
            </p>
          </div>

          {/* 투자 판단 요약 */}
          <div className={`rounded-lg p-3 text-[11px] leading-relaxed ${SIGNAL_STYLE[stock.signal] || ""}`}>
            <span className="font-semibold">[{stock.signal}] </span>
            {signalComment(stock)}
          </div>

          <p className="text-[9px] text-[var(--text-muted)]">
            ⚠ 본 분석은 자동화된 퀀트 모델 결과입니다. 실제 투자 결정 전 추가 검토가 필요합니다.
          </p>
        </div>
      )}
    </div>
  );
}

function IndicatorBox({ label, value, unit, note }: { label: string; value: any; unit: string; note?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface)] border border-[var(--border)] p-2.5">
      <div className="text-[9px] text-[var(--text-muted)]">{label}</div>
      <div className="text-sm font-bold mt-0.5">
        {value != null ? `${unit}${value}` : "-"}
      </div>
      {note && <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{note}</div>}
    </div>
  );
}

function wilRComment(wr: number | null, symbol: string): string {
  if (wr == null) return "데이터 없음";
  if (wr <= -80) return `${symbol}의 Williams %R(${wr.toFixed(1)})이 과매도 구간(-80 이하)에 진입했습니다. 단기 심리가 극도로 위축된 상태로, 역발상 매수 관점에서 관심을 가질 시점입니다. 단, 펀더멘털 확인 필수.`;
  if (wr >= -20) return `${symbol}의 Williams %R(${wr.toFixed(1)})이 과매수 구간(-20 이상)에 위치합니다. 단기 투자심리가 과열된 상태로, 신규 매수보다는 차익실현 또는 관망이 적절합니다.`;
  if (wr <= -60) return `${symbol}의 Williams %R(${wr.toFixed(1)})은 중립~약세 구간입니다. 매도 압력이 다소 우세하나 극단적 구간은 아닙니다. 추가 하락 여부를 모니터링하세요.`;
  return `${symbol}의 Williams %R(${wr.toFixed(1)})은 중립 구간(-20~-80)입니다. 방향성이 불명확한 구간으로, 다른 지표와 종합 판단이 필요합니다.`;
}

function signalComment(s: any): string {
  const wr = s.williamsR?.toFixed(1);
  const rsi = s.rsi14?.toFixed(1);
  if (s.signal === "BUY") return `퀀트 점수 ${s.score >= 0 ? "+" : ""}${s.score?.toFixed(1)}: Williams %R ${wr}, RSI ${rsi}로 과매도 영역. SMA 추세와 모멘텀 조합상 단기 반등 가능성. 분할 매수 접근 권장.`;
  if (s.signal === "SELL") return `퀀트 점수 ${s.score?.toFixed(1)}: 과매수+하락 모멘텀 조합. 보유 중이라면 손절 또는 익절 타이밍 검토. 신규 진입 비권장.`;
  if (s.signal === "AVOID") return `퀀트 점수 ${s.score?.toFixed(1)}: 약세 신호 우세. 하락 모멘텀 지속 중이며 저점 확인 전 관망 권장.`;
  return `퀀트 점수 ${s.score >= 0 ? "+" : ""}${s.score?.toFixed(1)}: 중립 신호. 명확한 매매 시그널 없음. 포지션 유지 또는 소량만 운용 권장.`;
}

export default function SpaceXPage() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/spacex${force ? "?refresh=1" : ""}`);
      const data = await res.json();
      setStocks(data.stocks || []);
      const dates = (data.stocks || []).map((s: any) => new Date(s.updatedAt).getTime());
      if (dates.length) setUpdatedAt(new Date(Math.max(...dates)));
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = ["pure_space", "etf", "defense"];

  const sectorStats = {
    buyCount:  stocks.filter(s => s.signal === "BUY").length,
    sellCount: stocks.filter(s => ["SELL","AVOID"].includes(s.signal)).length,
    avgWR:     stocks.length ? stocks.reduce((a, s) => a + (s.williamsR ?? -50), 0) / stocks.length : null,
    avgScore:  stocks.length ? stocks.reduce((a, s) => a + (s.score ?? 0), 0) / stocks.length : null,
  };

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-2">
        <Rocket className="w-8 h-8 mx-auto text-[var(--text-muted)] animate-bounce" />
        <p className="text-sm text-[var(--text-muted)]">퀀트 데이터 로딩 중...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rocket className="w-6 h-6 text-[#3b82f6]" />
          <div>
            <h1 className="text-xl font-bold">SpaceX & Aerospace 퀀트</h1>
            <p className="text-[10px] text-[var(--text-muted)]">
              {updatedAt ? `마지막 갱신: ${updatedAt.toLocaleString("ko-KR")}` : "데이터 로딩 중"}
              {" · "}미국장 마감 + 개장 30분 후 자동 갱신
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs hover:border-[var(--accent)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "갱신 중..." : "즉시 갱신"}
        </button>
      </div>

      {/* 섹터 오버뷰 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SectorCard label="매수 신호" value={`${sectorStats.buyCount}종목`} color="#22c55e" icon={<TrendingUp className="w-4 h-4" />} />
        <SectorCard label="매도/회피" value={`${sectorStats.sellCount}종목`} color="#ef4444" icon={<TrendingDown className="w-4 h-4" />} />
        <SectorCard
          label="평균 Williams %R"
          value={sectorStats.avgWR != null ? sectorStats.avgWR.toFixed(1) : "-"}
          note={sectorStats.avgWR != null ? (sectorStats.avgWR <= -70 ? "섹터 과매도" : sectorStats.avgWR >= -30 ? "섹터 과매수" : "섹터 중립") : ""}
          color="#f59e0b"
          icon={<Minus className="w-4 h-4" />}
        />
        <SectorCard
          label="평균 퀀트 점수"
          value={sectorStats.avgScore != null ? `${sectorStats.avgScore >= 0 ? "+" : ""}${sectorStats.avgScore.toFixed(2)}` : "-"}
          color={sectorStats.avgScore != null && sectorStats.avgScore >= 0.5 ? "#22c55e" : "#ef4444"}
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      {/* 그룹별 주식 목록 */}
      {groups.map(group => {
        const groupStocks = stocks.filter(s => s.group === group);
        if (!groupStocks.length) return null;
        return (
          <div key={group} className="space-y-2">
            <h2 className="text-sm font-bold text-[var(--text-muted)]">{GROUP_LABEL[group]}</h2>
            <div className="space-y-2">
              {groupStocks.map(stock => (
                <StockCard
                  key={stock.symbol}
                  stock={stock}
                  expanded={expanded === stock.symbol}
                  onToggle={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {stocks.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <p className="text-sm">데이터가 없습니다. 즉시 갱신 버튼을 눌러주세요.</p>
        </div>
      )}
    </div>
  );
}

function SectorCard({ label, value, note, color, icon }: any) {
  return (
    <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
        {icon}
        <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {note && <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{note}</div>}
    </div>
  );
}
