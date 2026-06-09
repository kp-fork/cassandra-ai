import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJSON } from "@/lib/serialize";
import { getCache, setCache, logSearch } from "@/lib/redis-cache";
import fs from "fs";
import path from "path";

// DART 코스닥 기업 매핑
let kosdaqCorps: { corp_code: string; name: string; stock_code: string }[] = [];
try {
  const p = path.join(process.cwd(), "data", "dart-corp-codes.json");
  if (fs.existsSync(p)) kosdaqCorps = JSON.parse(fs.readFileSync(p, "utf-8"));
} catch {}

// 지식베이스 로드
let knowledgeBase: any[] = [];
try {
  const kb = path.join(process.cwd(), "data", "knowledge-base.json");
  if (fs.existsSync(kb)) knowledgeBase = JSON.parse(fs.readFileSync(kb, "utf-8"));
} catch {}

// DART API 키
function getDartKey(): string {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const env = fs.readFileSync(envPath, "utf-8");
    const m = env.match(/DART_API_KEY=(.+)/);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}

// 검색 캐시 (Upstash Redis + 인메모리 폴백)
const CACHE_TTL = 72 * 60 * 60 * 1000;

// DART 실시간 검색 (최근 3개월)
async function searchDartRealtime(query: string): Promise<{ corps: any[]; rateLimited: boolean }> {
  const key = getDartKey();
  if (!key) return { corps: [], rateLimited: false };

  try {
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const bgnDe = threeMonthsAgo.toISOString().slice(0,10).replace(/-/g,"");
    const endDe = today.toISOString().slice(0,10).replace(/-/g,"");

    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&bgn_de=${bgnDe}&end_de=${endDe}&corp_cls=K&page_count=100`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "020") return { corps: [], rateLimited: true };
    if (data.status !== "000" || !data.list) return { corps: [], rateLimited: false };

    // 검색어 토큰화해서 매칭
    const tokens = query.split(/\s+/).filter(t => t.length >= 2);
    const seen = new Set<string>();
    const matches: any[] = [];

    for (const item of data.list) {
      const name = item.corp_name || "";
      if (tokens.some(t => name.includes(t)) && !seen.has(name)) {
        seen.add(name);
        matches.push({
          companyName: name,
          corpCode: item.corp_code,
          stockCode: item.stock_code || "",
          market: "KOSDAQ",
          reportNm: item.report_nm,
          rceptDt: item.rcept_dt,
          _count: { filings: 0, signals: 0 },
          source: "DART 실시간",
        });
      }
      if (matches.length >= 10) break;
    }

    return { corps: matches, rateLimited: false };
  } catch {
    return { corps: [], rateLimited: false };
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!q.trim()) return NextResponse.json(toJSON({ corps: [], persons: [], funds: [] }));

  // 검색 로깅
  prisma.searchLog.create({
    data: { query: q.trim(), ip: req.headers.get("x-forwarded-for") || undefined },
  }).catch(() => {});
  logSearch(q.trim(), req.headers.get("x-forwarded-for") || undefined);

  // 캐시 확인 (Upstash Redis 우선)
  const normalizedQ = q.trim().toLowerCase();
  if (!forceRefresh) {
    const cached = await getCache(`search:${normalizedQ}`);
    if (cached) {
      return NextResponse.json(toJSON({
        ...cached.data,
        cached: true,
        cacheAge: Math.floor(cached.age / 60),
        cacheStale: cached.stale,
      }));
    }
  }

  const [dartResult, dbResult] = await Promise.all([
    searchDartRealtime(q.trim()),
    searchLocal(q.trim()),
  ]);

  const kbMatches = knowledgeBase.filter((kb: any) =>
    kb.name.includes(q.trim()) || kb.aliases?.some((a: string) => a.includes(q.trim()))
  );

  const result = {
    ...dbResult,
    corps: [...dbResult.corps, ...dartResult.corps.filter(
      (dc: any) => !dbResult.corps.some((dbc: any) => dbc.companyName === dc.companyName)
    )],
    knowledge: kbMatches.length > 0 ? kbMatches : undefined,
    rateLimited: dartResult.rateLimited,
    cached: false, cacheAge: 0, cacheStale: false,
  };

  await setCache(`search:${normalizedQ}`, result);
  return NextResponse.json(toJSON(result));
}

async function searchLocal(query: string) {
  // 공백으로 토큰화해서 각 토큰으로 검색
  const tokens = query.split(/\s+/).filter(t => t.length >= 2);
  
  // DB 검색 + dart-corp-codes 통합
  const dartMatches = kosdaqCorps
    .filter((c) => tokens.some(t => c.name.includes(t)))
    .slice(0, 5)
    .map((c) => ({
      companyName: c.name, corpCode: c.corp_code, stockCode: c.stock_code,
      market: "KOSDAQ", _count: { filings: 0, signals: 0 }, source: "DART",
    }));

  // DB에서 실제 filing/signal 카운트 조회
  for (const dm of dartMatches) {
    const dbCorp = await prisma.corp.findFirst({
      where: { corpCode: dm.corpCode },
      include: { _count: { select: { filings: true, signals: true } } },
    });
    if (dbCorp) {
      dm._count = { filings: dbCorp._count.filings, signals: dbCorp._count.signals };
      dm.source = "DB";
    }
  }

  const [dbCorps, persons, funds] = await Promise.all([
    prisma.corp.findMany({
      where: { OR: tokens.flatMap(t => [{ companyName: { contains: t, mode: "insensitive" as const } }, { corpCode: { contains: t } }, { stockCode: { contains: t } }]) },
      include: { _count: { select: { filings: true, signals: true } } }, take: 10,
    }),
    prisma.person.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      include: { _count: { select: { corpRelations: true } } }, take: 10,
    }),
    prisma.fund.findMany({ where: { name: { contains: query, mode: "insensitive" } }, take: 10 }),
  ]);

  const dbNames = new Set(dbCorps.map((c) => c.companyName));
  return { corps: [...dbCorps.map((c) => ({ ...c, source: "DB" })), ...dartMatches.filter((c) => !dbNames.has(c.companyName))], persons, funds };
}
