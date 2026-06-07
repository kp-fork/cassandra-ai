export function generateMarkdown(report: any): string {
  const { pinnedItems, relatedCorps, summary, generatedAt } = report;
  const dateStr = new Date(generatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  let md = `# CASSANDRA AI — 이상 징후 분석 리포트

> 생성일시: ${dateStr}
> 분석 대상: ${summary.totalPinned}개 엔티티
> 연관 기업: ${summary.totalRelatedCorps}개 (CB 발행 ${summary.corpsWithCB}개, 고위험 ${summary.highRiskCorps}개)

---

## 📌 분석 대상

`;

  for (const item of pinnedItems) {
    const typeLabel = item.type === "corp" ? "🏢 기업" : item.type === "person" ? "👤 인물" : "🏛️ 법인/조합";
    md += `- **${typeLabel}**: ${item.label}\n`;
  }

  md += `\n---\n\n## 연관 기업 분석\n\n`;

  for (const entry of relatedCorps) {
    const c = entry.corp;
    const marketCapStr = c.marketCap
      ? c.marketCap >= 1e12 ? `${(c.marketCap / 1e12).toFixed(1)}조` : `${(c.marketCap / 1e8).toFixed(0)}억`
      : "-";

    const riskEmoji = entry.riskLevel >= 0.9 ? "🔴" : entry.riskLevel >= 0.7 ? "🟠" : entry.riskLevel >= 0.5 ? "🟡" : "⚪";

    md += `### ${riskEmoji} ${c.companyName} (${c.corpCode})\n\n`;
    md += `| 항목 | 값 |\n|------|----|\n`;
    md += `| 시장 | ${c.market} |\n`;
    md += `| 종목코드 | ${c.stockCode || "-"} |\n`;
    md += `| 시가총액 | ${marketCapStr}원 |\n`;
    md += `| 상태 | ${c.delistedAt ? "⚠️ 상장폐지" : c.isAdmin ? "⚠️ 관리종목" : "정상"} |\n`;
    md += `| 위험도 | ${(entry.riskLevel * 100).toFixed(0)}% |\n\n`;

    // 매칭 경로
    md += `**매칭 경로:**\n`;
    for (const rel of entry.matchedVia) {
      const entityName = rel.entity?.name || rel.entity?.label || "알 수 없음";
      md += `- ${entityName} → ${rel.role}${rel.description ? ` (${rel.description})` : ""}\n`;
    }

    // CB/BW 자금조달
    if (entry.cbFilings.length > 0) {
      md += `\n**CB/BW 자금조달 활동:**\n\n`;
      md += `| 일자 | 유형 | 내용 |\n|------|------|------|\n`;
      for (const f of entry.cbFilings) {
        const d = new Date(f.date).toISOString().slice(0, 10);
        md += `| ${d} | ${f.type} | ${f.summary || f.title} |\n`;
      }
    }

    // 탐지 신호
    if (entry.signals.length > 0) {
      md += `\n**탐지 신호:**\n\n`;
      md += `| 일자 | 룰 | 점수 |\n|------|-----|------|\n`;
      for (const s of entry.signals) {
        const d = new Date(s.date).toISOString().slice(0, 10);
        md += `| ${d} | ${s.ruleName} | ${(s.score * 100).toFixed(0)}% |\n`;
      }
    }

    md += `\n---\n\n`;
  }

  md += `## 📊 종합 평가\n\n`;
  md += `- 총 ${summary.totalPinned}개 엔티티가 ${summary.totalRelatedCorps}개 기업과 연관됨\n`;
  md += `- CB/BW 등 자금조달 활동이 확인된 기업: ${summary.corpsWithCB}개\n`;
  md += `- 고위험(≥70%) 기업: ${summary.highRiskCorps}개\n`;

  if (summary.highRiskCorps > 0) {
    md += `\n### ⚠️ 주의 대상\n\n`;
    for (const entry of relatedCorps.filter((c: any) => c.riskLevel >= 0.7)) {
      md += `- **${entry.corp.companyName}** — 위험도 ${(entry.riskLevel * 100).toFixed(0)}%\n`;
      for (const s of entry.signals) {
        md += `  - ${s.ruleName}: ${s.detail}\n`;
      }
    }
  }

  md += `\n---\n\n`;
  md += `> ※ CASSANDRA AI — DART 공시 사실 색인 기반 분석. 특정 개인·법인에 대한 평가가 아닙니다.\n`;
  md += `> 모든 데이터는 금융감독원 전자공시시스템(DART) 원본 공시로 역추적 가능합니다.\n`;
  md += `> https://github.com/gameworkerkim/vibe-investing\n`;

  return md;
}

export function downloadMarkdown(report: any, filename?: string) {
  const md = generateMarkdown(report);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `cassandra-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
