/**
 * 리스크 플래그 자동화 엔진
 *
 * 사용처:
 *   - scripts/daily-sync.ts (일일 배치)
 *   - scripts/backfill-relations.ts (백필)
 *   - API route (온디맨드)
 *
 * 3개 레이어 리스크:
 *   1. 공시 기반 — Filing 제목 패턴 매칭
 *   2. 관계망 기반 — 감사의견, 동일인 다수 겸직
 *   3. 복합 — 단기 연속 신호 (30일 내 복수 룰 발화)
 */

import { prisma } from "./prisma";

// ─── 룰 정의 ───
export interface RuleDefinition {
  name: string;
  label: string;
  pattern: RegExp;
  weight: number;         // 0-100 기여도
  layer: "filing" | "relation" | "composite";
}

export const RULES: RuleDefinition[] = [
  // 공시 기반
  { name: "NAME_CHANGE",    label: "사명변경",    pattern: /상호변경|사명변경|명칭변경/,                  weight: 25, layer: "filing" },
  { name: "MAJOR_HOLDER",   label: "대주주변경",  pattern: /최대주주\s*변경|대주주/,                      weight: 20, layer: "filing" },
  { name: "LAWSUIT",        label: "소송/분쟁",   pattern: /소송|분쟁|경영권|가처분|회생|주주제안/,        weight: 25, layer: "filing" },
  { name: "CB_ISSUANCE",    label: "CB발행",      pattern: /전환사채|신주인수권|사채/,                    weight: 10, layer: "filing" },
  { name: "CB_REFIX",       label: "CB리픽싱",    pattern: /전환가액.*조정|리픽싱/,                       weight: 15, layer: "filing" },
  { name: "CAPITAL",        label: "증자/감자",   pattern: /유상증자|무상증자|감자|주식병합/,              weight: 10, layer: "filing" },
  { name: "PAYMENT_DELAY",  label: "대금지연",    pattern: /납입.*지연|잔금.*지연|납입기한.*변경/,         weight: 20, layer: "filing" },
  { name: "AUDIT_RISK",     label: "감사위험",    pattern: /감사의견.*거절|감사의견.*한정|감사인.*변경/,   weight: 30, layer: "filing" },
  { name: "DELIST_RISK",    label: "상장폐지위험", pattern: /상장폐지|거래정지|관리종목/,                 weight: 35, layer: "filing" },
  { name: "EMBEZZLE",       label: "횡령/배임",   pattern: /횡령|배임|자금유용/,                         weight: 40, layer: "filing" },
  // 관계망 기반 (evaluateRelationRisks에서 별도 평가)
  { name: "NON_CLEAN_AUDIT", label: "비적정감사의견", pattern: /./,                                      weight: 35, layer: "relation" },
  { name: "SMALL_AUDITOR",   label: "소형회계법인",   pattern: /./,                                      weight: 10, layer: "relation" },
  { name: "MULTI_ROLE",      label: "다중겸직",        pattern: /./,                                      weight: 15, layer: "relation" },
  // 복합
  { name: "CLUSTER_SIGNAL",  label: "복합위험신호",    pattern: /./,                                      weight: 20, layer: "composite" },
];

const FILING_RULES = RULES.filter(r => r.layer === "filing");

// ─── 공시 기반 평가 ───
export interface FiringResult {
  ruleName: string;
  label: string;
  score: number;          // 0-1
  detail: string;
  matchCount: number;
  latestDate: string;
}

export function evaluateFilings(
  filings: { title: string; filedAt: Date | string }[],
  windowDays: number = 180,
): FiringResult[] {
  const cutoff = new Date(Date.now() - windowDays * 86400 * 1000);
  const recent = filings.filter(f => new Date(f.filedAt) >= cutoff);
  const results: FiringResult[] = [];

  for (const rule of FILING_RULES) {
    const matches = recent.filter(f => rule.pattern.test(f.title));
    if (matches.length === 0) continue;
    const score = Math.min(rule.weight * Math.min(matches.length, 3), 100) / 100;
    const latest = matches.reduce<string>((acc, f) => {
      const d = new Date(f.filedAt).toISOString().slice(0, 10);
      return d > acc ? d : acc;
    }, "");
    results.push({
      ruleName: rule.name, label: rule.label, score, matchCount: matches.length,
      detail: `${matches.length}건 (최근: ${latest})`, latestDate: latest,
    });
  }

  return results;
}

// ─── 관계망 기반 평가 ───
export async function evaluateRelationRisks(corpId: string): Promise<FiringResult[]> {
  const results: FiringResult[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // 1. 감사의견
  try {
    const audits = await prisma.corpAuditRelation.findMany({
      where: { corpId },
      include: { auditor: true },
      orderBy: { fiscalYear: "desc" },
      take: 3,
    });
    const nonClean = audits.filter(a => a.opinion !== "적정");
    if (nonClean.length > 0) {
      results.push({
        ruleName: "NON_CLEAN_AUDIT", label: "비적정감사의견",
        score: Math.min(0.35 * nonClean.length, 1),
        matchCount: nonClean.length,
        detail: nonClean.map(a => `${a.fiscalYear}: ${a.opinion}`).join(", "),
        latestDate: today,
      });
    }
    const smallFirm = audits.find(a => a.auditor?.firmType === "SMALL");
    if (smallFirm) {
      results.push({
        ruleName: "SMALL_AUDITOR", label: "소형회계법인",
        score: 0.10,
        matchCount: 1,
        detail: `${smallFirm.fiscalYear}년 감사: ${smallFirm.auditor?.name}`,
        latestDate: today,
      });
    }
  } catch { /* CorpAuditRelation 없음 — 무시 */ }

  // 2. 다중겸직 (동일 인물 3개사 이상 현직)
  const activePersons = await prisma.corpPersonRelation.findMany({
    where: { corpId, isCurrent: true, role: { in: ["CEO", "DIRECTOR"] } },
    include: { person: { include: { corpRelations: { where: { isCurrent: true } } } } },
  });
  const multiRole = activePersons.filter(r => (r.person.corpRelations?.length ?? 0) >= 3);
  if (multiRole.length > 0) {
    results.push({
      ruleName: "MULTI_ROLE", label: "다중겸직",
      score: 0.15,
      matchCount: multiRole.length,
      detail: multiRole.map(r => `${r.person.name}(${r.person.corpRelations?.length}개사)`).join(", "),
      latestDate: today,
    });
  }

  return results;
}

// ─── 복합 신호 평가 ───
export function evaluateCompositeRisk(filingResults: FiringResult[], relationResults: FiringResult[]): FiringResult[] {
  const all = [...filingResults, ...relationResults];
  if (all.length < 3) return []; // 3개 이상 룰 발화 시에만 복합 신호

  const today = new Date().toISOString().slice(0, 10);
  const totalScore = Math.min(all.reduce((s, r) => s + r.score, 0) / all.length, 1);

  return [{
    ruleName: "CLUSTER_SIGNAL", label: "복합위험신호",
    score: totalScore,
    matchCount: all.length,
    detail: `${all.length}개 룰 동시 발화: ${all.map(r => r.label).join(", ")}`,
    latestDate: today,
  }];
}

// ─── 종합 리스크 점수 (0-100) ───
export function calcTotalRisk(results: FiringResult[]): number {
  return Math.min(Math.round(results.reduce((s, r) => s + r.score * 100, 0)), 100);
}

// ─── DB Signal 저장 ───
export async function upsertSignals(corpId: string, results: FiringResult[]): Promise<void> {
  // 오늘 이미 저장된 동일 ruleName 신호는 갱신
  for (const r of results) {
    const existing = await prisma.signal.findFirst({
      where: {
        corpId, ruleName: r.ruleName,
        firedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) {
      await prisma.signal.update({
        where: { id: existing.id },
        data: { score: r.score, detail: r.detail },
      });
    } else {
      await prisma.signal.create({
        data: { corpId, ruleName: r.ruleName, score: r.score, detail: r.detail },
      });
    }
  }
}

// ─── 기업 전체 리스크 평가 (원스톱) ───
export interface CorpRiskReport {
  corpId: string;
  totalRisk: number;       // 0-100
  signals: FiringResult[];
  highRisk: boolean;       // totalRisk >= 50
}

export async function evaluateCorp(
  corpId: string,
  options: { save?: boolean; windowDays?: number } = {},
): Promise<CorpRiskReport> {
  const { save = false, windowDays = 180 } = options;

  const filings = await prisma.filing.findMany({
    where: { corpId },
    orderBy: { filedAt: "desc" },
    take: 200,
    select: { title: true, filedAt: true },
  });

  const filingResults = evaluateFilings(filings, windowDays);
  const relationResults = await evaluateRelationRisks(corpId);
  const compositeResults = evaluateCompositeRisk(filingResults, relationResults);
  const allResults = [...filingResults, ...relationResults, ...compositeResults];
  const totalRisk = calcTotalRisk(allResults);

  if (save && allResults.length > 0) {
    await upsertSignals(corpId, allResults);

    // Corp.isAdmin 갱신 (고위험 기업 마킹)
    if (totalRisk >= 50) {
      await prisma.corp.update({ where: { id: corpId }, data: { isAdmin: true } });
    }
  }

  return { corpId, totalRisk, signals: allResults, highRisk: totalRisk >= 50 };
}

// ─── 배치: DB 전체 기업 평가 ───
export async function evaluateAllCorps(options: { limit?: number; save?: boolean } = {}): Promise<CorpRiskReport[]> {
  const { limit = 500, save = true } = options;
  const corps = await prisma.corp.findMany({
    where: { delistedAt: null },
    select: { id: true },
    take: limit,
  });

  const reports: CorpRiskReport[] = [];
  for (const corp of corps) {
    const report = await evaluateCorp(corp.id, { save });
    if (report.signals.length > 0) reports.push(report);
  }
  return reports;
}
