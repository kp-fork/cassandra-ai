import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";
import fs from "fs";
import path from "path";

// DART API 키 읽기
function getDartKey(): string {
  try {
    const env = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
    const m = env.match(/DART_API_KEY=(.+)/);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

// DART corp_code 매핑 로드
let dartCorpMap: Map<string, string> = new Map();
try {
  const mapPath = path.join(process.cwd(), "data", "dart-corp-codes.json");
  if (fs.existsSync(mapPath)) {
    const data: any[] = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
    for (const item of data) dartCorpMap.set(item.stock_code, item.corp_code);
  }
} catch {}

// 기간별 이전 날짜
function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, period = 12 } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: "질문을 입력하세요" }, { status: 400 });
  }

  const dartKey = getDartKey();
  const bgnDe = monthsAgo(period);
  const endDe = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // 1. 질문에서 인물명/회사명 추출
  const namePattern = /[가-힣]{2,4}/g;
  const names = [...new Set(query.match(namePattern) || [])].filter(
    (n) => !["찾아줘", "분석", "관련", "추가", "알려줘", "검색"].includes(n)
  );

  // 2. DB에서 인물 검색 후 관련 회사 찾기
  const results: any[] = [];
  const searchedCorps = new Set<string>();

  for (const name of names) {
    // DB에서 인물 검색
    const person = await prisma.person.findFirst({
      where: { name: { contains: name, mode: "insensitive" } },
      include: {
        corpRelations: {
          include: { corp: true },
        },
      },
    });

    if (person) {
      for (const rel of person.corpRelations) {
        const corpKey = rel.corp.corpCode;
        if (searchedCorps.has(corpKey)) continue;
        searchedCorps.add(corpKey);

        // DART 공시 검색
        let dartDisclosures: any[] = [];
        if (dartKey) {
          const corpCode = rel.corp.corpCode || dartCorpMap.get(rel.corp.stockCode || "");
          if (corpCode) {
            for (const ty of ["B", "F", "I"]) {
              try {
                const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${dartKey}&corp_code=${corpCode}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_ty=${ty}&page_count=30`;
                const res = await fetch(url);
                const d = await res.json();
                if (d.status === "000" && d.list) {
                  dartDisclosures.push(...d.list.map((item: any) => ({
                    title: item.report_nm,
                    date: item.rcept_dt,
                    rceptNo: item.rcept_no,
                  })));
                }
              } catch {}
              await new Promise((r) => setTimeout(r, 50));
            }
          }
        }

        // DB 공시
        const dbFilings = await prisma.filing.findMany({
          where: {
            corpId: rel.corp.id,
            filedAt: { gte: new Date(Date.now() - period * 30 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { filedAt: "desc" },
          take: 20,
        });

        results.push({
          personName: person.name,
          companyName: rel.corp.companyName,
          corpCode: rel.corp.corpCode,
          stockCode: rel.corp.stockCode,
          marketCap: rel.corp.marketCap ? Number(rel.corp.marketCap) / 1e8 : null,
          role: rel.role,
          isAdmin: rel.corp.isAdmin,
          delistedAt: rel.corp.delistedAt,
          dartDisclosures: dartDisclosures.slice(0, 20),
          dbFilings: dbFilings.map((f) => ({
            title: f.title,
            type: f.filingType,
            date: f.filedAt.toISOString(),
            summary: f.summary,
          })),
          totalDisclosures: dartDisclosures.length + dbFilings.length,
        });
      }
    }
  }

  // 3. DB에 없는 인물명은 DART만으로 검색 시도
  const foundNames = new Set(results.map((r) => r.personName));
  for (const name of names) {
    if (foundNames.has(name)) continue;

    // 이름으로 DB 검색 (부분 매칭)
    const filings = await prisma.filing.findMany({
      where: {
        OR: [
          { title: { contains: name } },
          { summary: { contains: name } },
        ],
        filedAt: { gte: new Date(Date.now() - period * 30 * 24 * 60 * 60 * 1000) },
      },
      include: { corp: true },
      orderBy: { filedAt: "desc" },
      take: 10,
    });

    if (filings.length > 0) {
      const corpSet = new Map<string, any>();
      for (const f of filings) {
        if (!corpSet.has(f.corp.id)) {
          corpSet.set(f.corp.id, {
            personName: name,
            companyName: f.corp.companyName,
            corpCode: f.corp.corpCode,
            stockCode: f.corp.stockCode,
            marketCap: f.corp.marketCap ? Number(f.corp.marketCap) / 1e8 : null,
            role: "언급됨",
            isAdmin: f.corp.isAdmin,
            delistedAt: f.corp.delistedAt,
            source: "DB 공시 내 언급",
            dbFilings: [],
            totalDisclosures: 0,
          });
        }
        corpSet.get(f.corp.id)!.dbFilings.push({
          title: f.title, type: f.filingType,
          date: f.filedAt.toISOString(), summary: f.summary,
        });
      }
      for (const c of corpSet.values()) {
        c.totalDisclosures = c.dbFilings.length;
        results.push(c);
      }
    }
  }

  // 4. DART API로 이름 검색 (DART list.json에서는 회사명 검색만 가능)
  // 이미 충분한 결과가 있으므로 생략

  const summary = {
    query,
    period: `${period}개월`,
    foundPersons: [...new Set(results.map((r) => r.personName))].length,
    foundCompanies: results.length,
    totalDisclosures: results.reduce((sum, r) => sum + r.totalDisclosures, 0),
    searchedAt: new Date().toISOString(),
  };

  return NextResponse.json(toJSON({ results, summary }));
}
