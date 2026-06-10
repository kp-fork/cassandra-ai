/**
 * GitHub 레포를 검색 DB로 활용 — 인덱스 + 캐시 관리
 */
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";

const CACHE_DIR = path.join(process.cwd(), "Dart_Data", "person-results");

// GitHub 캐시에서 검색 결과 로드
export async function loadFromGitHubCache(
  type: string, query: string, period: number, maxAgeDays = 30
): Promise<{ data: any; fromCache: boolean; stale: boolean } | null> {
  // 1. DB 인덱스 확인
  const cached = await prisma.searchCache.findUnique({
    where: { type_query_period: { type, query, period } },
  });

  if (cached) {
    // 기간 내 캐시면 사용
    const age = Date.now() - cached.lastSearched.getTime();
    const isStale = age > maxAgeDays * 24 * 60 * 60 * 1000;

    // 로컬 파일 확인
    try {
      const filePath = path.join(process.cwd(), cached.githubPath);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        // 검색 횟수 증가
        await prisma.searchCache.update({
          where: { id: cached.id },
          data: { searchCount: { increment: 1 }, lastSearched: new Date() },
        });
        return { data, fromCache: true, stale: isStale };
      }
    } catch {}
  }

  return null;
}

// 검색 결과를 GitHub 캐시에 저장
export async function saveToGitHubCache(
  type: string, query: string, period: number, resultData: any
) {
  const filePath = `Dart_Data/person-results/${query}.json`;
  const fullPath = path.join(process.cwd(), filePath);

  // 로컬 파일 저장
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify({
    type, query, period,
    generatedAt: new Date().toISOString(),
    resultCount: (resultData.persons?.length || 0) + (resultData.filings?.length || 0),
    results: resultData,
  }, null, 2), "utf-8");

  // DB 인덱스 업데이트
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30일
  await prisma.searchCache.upsert({
    where: { type_query_period: { type, query, period } },
    update: {
      githubPath: filePath,
      resultCount: resultData.totalResults || 0,
      lastSearched: new Date(),
      expiresAt,
      searchCount: { increment: 1 },
    },
    create: {
      type, query, period,
      githubPath: filePath,
      resultCount: resultData.totalResults || 0,
      lastSearched: new Date(),
      expiresAt,
    },
  });
}

// 만료된 캐시 정리
export async function cleanExpiredCache() {
  const expired = await prisma.searchCache.findMany({
    where: { expiresAt: { lt: new Date() } },
  });
  for (const c of expired) {
    try {
      const p = path.join(process.cwd(), c.githubPath);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }
  if (expired.length > 0) {
    await prisma.searchCache.deleteMany({
      where: { id: { in: expired.map((e) => e.id) } },
    });
  }
}
