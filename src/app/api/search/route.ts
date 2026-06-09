import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";
import fs from "fs";
import path from "path";

// DART corp_code 매핑 로드 (코스닥 전체 기업)
let kosdaqCorps: { corp_code: string; name: string; stock_code: string }[] = [];
try {
  const p = path.join(process.cwd(), "data", "dart-corp-codes.json");
  if (fs.existsSync(p)) kosdaqCorps = JSON.parse(fs.readFileSync(p, "utf-8"));
} catch {}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";

  if (q.trim()) {
    prisma.searchLog.create({
      data: { query: q.trim(), ip: req.headers.get("x-forwarded-for") || undefined },
    }).catch(() => {});
  }

  const data = await searchAll(q);
  return NextResponse.json(toJSON(data));
}

async function searchAll(query: string) {
  if (!query || query.length < 1) return { corps: [], persons: [], funds: [] };

  // 1. DART 매핑에서 코스닥 기업 검색
  const dartMatches = kosdaqCorps
    .filter((c) => c.name.includes(query))
    .slice(0, 10)
    .map((c) => ({
      companyName: c.name,
      corpCode: c.corp_code,
      stockCode: c.stock_code,
      market: "KOSDAQ",
      _count: { filings: 0, signals: 0 },
      source: "DART",
    }));

  // 2. DB 검색
  const [dbCorps, persons, funds] = await Promise.all([
    prisma.corp.findMany({
      where: {
        OR: [
          { companyName: { contains: query, mode: "insensitive" } },
          { corpCode: { contains: query } },
          { stockCode: { contains: query } },
        ],
      },
      include: { _count: { select: { filings: true, signals: true } } },
      take: 10,
    }),
    prisma.person.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      include: { _count: { select: { corpRelations: true } } },
      take: 10,
    }),
    prisma.fund.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 10,
    }),
  ]);

  // 3. 중복 제거 후 합치기 (DB 데이터 우선)
  const dbNames = new Set(dbCorps.map((c) => c.companyName));
  const mergedCorps = [
    ...dbCorps.map((c) => ({ ...c, source: "DB" })),
    ...dartMatches.filter((c) => !dbNames.has(c.companyName)),
  ];

  return { corps: mergedCorps, persons, funds };
}
