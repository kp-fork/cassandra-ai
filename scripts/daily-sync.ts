/**
 * 일일 DART 공시 동기화 + 이상 징후 탐지
 * 실행: npx tsx scripts/daily-sync.ts
 *
 * 매일 오전 9시, 오후 6시에 실행하여:
 * 1. 코스닥 한계기업 공시 수집
 * 2. 6종 룰셋 적용 (사명변경, 대주주변경, 소송, CB, 증자, 리픽싱)
 * 3. DB 업데이트 + JSON 지식베이스 갱신
 */

import * as fs from "fs";
import * as path from "path";

function getDartKey(): string {
  try {
    return process.env.DART_API_KEY || 
      ((fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8").match(/DART_API_KEY=(.+)/) || [])[1]?.trim() || "");
  } catch { return ""; }
}

const DART_KEY = getDartKey();
const DART_BASE = "https://opendart.fss.or.kr/api";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 룰셋 정의
const RULES = {
  NAME_CHANGE: { pattern: /상호변경|사명변경|명칭변경/, weight: 25, label: "사명변경" },
  MAJOR_HOLDER: { pattern: /최대주주\s*변경|대주주/, weight: 20, label: "대주주변경" },
  LAWSUIT: { pattern: /소송|분쟁|경영권|가처분|회생|주주제안/, weight: 25, label: "소송/분쟁" },
  CB_ISSUANCE: { pattern: /전환사채|신주인수권|사채/, weight: 10, label: "CB발행" },
  CB_REFIX: { pattern: /전환가액.*조정|리픽싱/, weight: 15, label: "CB리픽싱" },
  CAPITAL: { pattern: /유상증자|무상증자|감자|주식병합/, weight: 10, label: "증자/감자" },
  PAYMENT_DELAY: { pattern: /납입.*지연|잔금.*지연|납입기한.*변경/, weight: 20, label: "대금지연" },
  AUDIT: { pattern: /감사의견.*거절|감사의견.*한정|감사인.*변경/, weight: 30, label: "감사위험" },
};

interface FilingItem {
  date: string; rceptNo: string; title: string; type: string;
}

interface CompanyReport {
  stockCode: string; corpCode: string; name: string; totalDisclosures: number;
  signals: { rule: string; weight: number; count: number; latestDate: string }[];
  riskScore: number;
  recentDisclosures: FilingItem[];
}

async function main() {
  if (!DART_KEY) { console.log("❌ DART_API_KEY 필요"); process.exit(1); }

  console.log(`📊 CASSANDRA AI — 일일 공시 동기화 [${new Date().toLocaleString("ko-KR")}]\n`);

  // 1. 대상 기업 로드
  const dartCorps: any[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "dart-corp-codes.json"), "utf-8")
  );
  const SPAC = ["스팩", "SPAC", "기업인수목적"];
  // 시총 하위권 + 이미 DB에 있는 기업 우선 (뒤에서 200개 = 최근 상장 기업)
  const filtered = dartCorps.filter((c: any) => !SPAC.some((kw) => c.name.includes(kw)));
  const targets = filtered.slice(-200).reverse(); // 뒤에서 200개 (신규/활성 기업)

  // 오늘 날짜
  const today = new Date();

  // 기본 7일 + 첫 실행 시 12개월
  const isFirstRun = !fs.existsSync(path.join(__dirname, "..", "data", "daily-report.json"));
  const daysBack = isFirstRun ? 365 : 7;
  const bgnDe = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack)
    .toISOString().slice(0, 10).replace(/-/g, "");
  const endDe = today.toISOString().slice(0, 10).replace(/-/g, "");

  console.log(`대상: ${Math.min(targets.length, 200)}개 기업 | ${isFirstRun ? "최초 실행 (12개월)" : "일일 (7일)"} | ${bgnDe}~${endDe}\n`);

  // 2. 공시 수집 + 룰셋 적용
  const reports: CompanyReport[] = [];
  let totalDisclosures = 0;
  let processed = 0;

  // 배치 처리 (100개씩)
  const BATCH = 100;
  for (let b = 0; b < targets.length; b += BATCH) {
    const batch = targets.slice(b, b + BATCH);

    for (const corp of batch) {
      processed++;
      const filings: FilingItem[] = [];

      // 공시 검색 (B: 주요사항, I: 거래소공시)
      for (const ty of ["B", "I"]) {
        try {
          const url = `${DART_BASE}/list.json?crtfc_key=${DART_KEY}&corp_code=${corp.corp_code}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_ty=${ty}&page_count=50`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.status === "000" && data.list) {
            for (const item of data.list) {
              filings.push({
                date: item.rcept_dt,
                rceptNo: item.rcept_no,
                title: item.report_nm || "",
                type: ty,
              });
            }
          }
        } catch {}
        await sleep(80);
      }

      // 룰셋 적용
      const signals: CompanyReport["signals"] = [];
      let riskScore = 0;

      for (const [key, rule] of Object.entries(RULES)) {
        const matches = filings.filter((f) => rule.pattern.test(f.title));
        if (matches.length > 0) {
          signals.push({
            rule: rule.label,
            weight: rule.weight,
            count: matches.length,
            latestDate: matches[matches.length - 1].date,
          });
          riskScore += rule.weight * Math.min(matches.length, 3);
        }
      }

      if (filings.length > 0 || signals.length > 0) {
        reports.push({
          stockCode: corp.stock_code,
          corpCode: corp.corp_code,
          name: corp.name,
          totalDisclosures: filings.length,
          signals,
          riskScore: Math.min(riskScore, 100),
          recentDisclosures: filings.slice(0, 10),
        });
        totalDisclosures += filings.length;
      }

      if (processed % 20 === 0) {
        const withSignals = reports.filter((r) => r.signals.length > 0).length;
        console.log(`  진행: ${processed}/${Math.min(targets.length, 200)} | 신호 ${withSignals}개 기업 | 공시 ${totalDisclosures}건`);
      }
    }

    // 배치 간 휴식
    if (b + BATCH < Math.min(targets.length, 200)) {
      console.log(`  ⏸ 배치 완료, 3초 대기...`);
      await sleep(3000);
    }
  }

  // 3. 위험도순 정렬
  reports.sort((a, b) => b.riskScore - a.riskScore);

  // 4. JSON 저장
  const output = {
    generatedAt: new Date().toISOString(),
    period: { from: bgnDe, to: endDe },
    totalCompanies: reports.length,
    totalDisclosures,
    rules: Object.entries(RULES).map(([k, v]) => ({ key: k, label: v.label, weight: v.weight })),
    highRisk: reports.filter((r) => r.riskScore >= 30),
    companies: reports,
  };

  const outPath = path.join(__dirname, "..", "data", "daily-report.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  // 5. 지식베이스도 갱신
  const kbPath = path.join(__dirname, "..", "data", "dart-knowledge.json");
  if (fs.existsSync(kbPath)) {
    const kb = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
    kb.generatedAt = new Date().toISOString();
    kb.dailyReport = {
      highRiskCount: output.highRisk.length,
      totalSignals: reports.reduce((s, r) => s + r.signals.length, 0),
      topRisks: output.highRisk.slice(0, 10).map((r) => ({ name: r.name, score: r.riskScore, signals: r.signals.map((s) => s.rule) })),
    };
    fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2), "utf-8");
  }

  // 6. 요약 출력
  console.log(`\n✅ 동기화 완료`);
  console.log(`   기업: ${reports.length}개 | 공시: ${totalDisclosures}건`);
  console.log(`   고위험(≥30): ${output.highRisk.length}개`);

  if (output.highRisk.length > 0) {
    console.log(`\n⚠️ 고위험 기업 Top 5:`);
    output.highRisk.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} (점수: ${r.riskScore})`);
      r.signals.forEach((s: any) => console.log(`     └ ${s.rule} ${s.count}건 (최근: ${s.latestDate})`));
    });
  }

  // 7. DB 저장 (선택)
  try {
    const { cleanExpiredCache } = await import("../src/lib/github-cache");
    await cleanExpiredCache();
  } catch {}
  
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    let dbSaved = 0;
    for (const r of reports) {
      // 회사 upsert
      const dbCorp = await prisma.corp.upsert({
        where: { corpCode: r.corpCode },
        update: { companyName: r.name, stockCode: r.stockCode },
        create: { corpCode: r.corpCode, stockCode: r.stockCode, companyName: r.name, market: "KOSDAQ" },
      });
      // 공시 저장
      for (const f of r.recentDisclosures) {
        try {
          await prisma.filing.upsert({
            where: { rceptNo: f.rceptNo },
            update: {},
            create: {
              rceptNo: f.rceptNo, corpId: dbCorp.id,
              filingType: f.type, title: f.title, summary: f.title,
              filedAt: new Date(`${f.date.slice(0,4)}-${f.date.slice(4,6)}-${f.date.slice(6,8)}`),
              sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.rceptNo}`,
            },
          });
          dbSaved++;
        } catch {}
      }
      // 신호 저장
      for (const s of r.signals) {
        await prisma.signal.create({
          data: {
            corpId: dbCorp.id,
            ruleName: s.rule,
            score: s.weight / 100,
            detail: `${s.rule} ${s.count}건 (최근: ${s.latestDate})`,
            firedAt: new Date(),
          },
        }).catch(() => {});
      }
    }
    console.log(`   DB 저장: ${dbSaved}건 공시`);
    await prisma.$disconnect();
  } catch (e) {
    console.log(`   DB 저장 스킵 (로컬 DB 없음)`);
  }
}

main().catch(console.error);
