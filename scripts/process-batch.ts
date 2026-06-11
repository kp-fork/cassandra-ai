/**
 * 배치 분석 처리 — GitHub Actions에서 실행
 * npx tsx scripts/process-batch.ts
 */
async function main() {
  console.log("📊 배치 분석 처리 시작...\n");

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  // QUEUED 작업 가져오기
  const jobs = await prisma.batchJob.findMany({
    where: { status: "QUEUED" },
    take: 10,
  });

  if (jobs.length === 0) {
    console.log("처리할 작업 없음");
    await prisma.$disconnect();
    return;
  }

  console.log(`처리 대상: ${jobs.length}건\n`);

  // DART API 키
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(__dirname, "..", ".env");
  let dartKey = "";
  try {
    dartKey = (fs.readFileSync(envPath, "utf-8").match(/DART_API_KEY=(.+)/) || [])[1]?.trim() || "";
  } catch {}

  for (const job of jobs) {
    console.log(`  분석 중: ${job.targetName}...`);
    await prisma.batchJob.update({ where: { id: job.id }, data: { status: "PROCESSING" } });

    let result = "";
    try {
      // DB에서 회사/인물 검색
      const corp = await prisma.corp.findFirst({
        where: { companyName: { contains: job.targetName, mode: "insensitive" } },
        include: { filings: { orderBy: { filedAt: "desc" }, take: 20 }, personRelations: { include: { person: true } } },
      });

      if (corp) {
        const cats: Record<string, number> = {};
        corp.filings.forEach((f: any) => {
          const t = f.title || "";
          if (/전환사채|신주인수권|사채/.test(t)) cats['CB/BW'] = (cats['CB/BW'] || 0) + 1;
          else if (/소송|판결|가처분/.test(t)) cats['소송'] = (cats['소송'] || 0) + 1;
          else if (/최대주주/.test(t)) cats['대주주'] = (cats['대주주'] || 0) + 1;
          else if (/유상증자|무상증자|감자/.test(t)) cats['증자/감자'] = (cats['증자/감자'] || 0) + 1;
          else cats['기타'] = (cats['기타'] || 0) + 1;
        });

        const persons = corp.personRelations.map(r => r.person.name).join(", ");
        result = `📊 ${corp.companyName} 분석 (${corp.filings.length}건 공시)\n\n`;
        result += `관계자: ${persons || "없음"}\n\n`;
        result += Object.entries(cats).map(([k, v]) => `· ${k}: ${v}건`).join("\n");

        if ((cats['증자/감자'] || 0) >= 3) result += `\n⚠️ 증자/감자 ${cats['증자/감자']}회 — 빈번한 자본 변동`;
        if (cats['소송']) result += `\n⚠️ 소송 ${cats['소송']}건 — 법적 리스크`;
        if (cats['대주주']) result += `\n⚠️ 대주주변경 ${cats['대주주']}회`;

        result += `\n\n✅ 분석 완료: ${new Date().toLocaleString("ko-KR")}`;
      } else {
        // 인물 검색
        const person = await prisma.person.findFirst({
          where: { name: { contains: job.targetName, mode: "insensitive" } },
          include: { corpRelations: { include: { corp: true } } },
        });
        if (person) {
          const corps = person.corpRelations.map(r => r.corp.companyName).join(", ");
          result = `👤 ${person.name} (${person.birthDate || "생년월일 미상"})\n\n`;
          result += `연관 기업: ${corps}\n`;
          result += `등록 이력: ${person.corpRelations.length}개 기업\n`;
          if (person.bio) result += `\n약력: ${person.bio}`;
          result += `\n\n✅ 분석 완료: ${new Date().toLocaleString("ko-KR")}`;
        } else {
          result = `⏳ '${job.targetName}'에 대한 데이터를 찾지 못했습니다. DART 웹사이트에서 직접 검색해보세요.\n✅ 검토 완료: ${new Date().toLocaleString("ko-KR")}`;
        }
      }

      await prisma.batchJob.update({
        where: { id: job.id },
        data: { status: "DONE", result, processedAt: new Date() },
      });
    } catch (e: any) {
      await prisma.batchJob.update({
        where: { id: job.id },
        data: { status: "FAILED", result: `오류: ${e.message}`, processedAt: new Date() },
      });
    }

    console.log(`    완료: ${job.targetName}`);
  }

  await prisma.$disconnect();
  console.log("\n✅ 배치 처리 완료");
}

main().catch(console.error);
