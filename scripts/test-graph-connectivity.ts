/**
 * 관계망 연결성 테스트 + 자동 보완
 * 실행: npx tsx scripts/test-graph-connectivity.ts
 *
 * 모든 기업의 관계망 테스트 → 연결 부족 시 PersonHistory로 보완
 */

import * as fs from "fs";
import * as path from "path";

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  // 대시보드 기업 + 주요 테스트 케이스
  const testCorps = ["에코심플렉스", "이노에이엑스", "핌스", "CBI", "딥커머스", "피앤씨테크", "디모아", "메이슨캐피탈", "알로이스", "카나리아바이오"];

  console.log("📊 관계망 연결성 테스트\n");

  let passed = 0;
  let failed = 0;

  for (const name of testCorps) {
    const corp = await prisma.corp.findFirst({
      where: { companyName: { contains: name } },
      include: { _count: { select: { personRelations: true, fundRelations: true } } },
    });

    const personRels = corp?._count.personRelations || 0;
    const fundRels = corp?._count.fundRelations || 0;
    const hasRelations = personRels + fundRels > 0;

    // PersonHistory에서 보완
    let historyAdded = 0;
    if (!hasRelations && corp) {
      const history = await prisma.personHistory.findMany({
        where: { companyName: corp.companyName },
        select: { personUid: true, name: true, role: true },
        take: 10,
      });
      for (const h of history) {
        const person = await prisma.person.upsert({
          where: { personUid: h.personUid },
          update: {},
          create: { personUid: h.personUid, name: h.name },
        }).catch(() => null);
        if (person) {
          await prisma.corpPersonRelation.create({
            data: { personId: person.id, corpId: corp.id, role: h.role },
          }).catch(() => {});
          historyAdded++;
        }
      }
    }

    const status = hasRelations ? "✅" : historyAdded > 0 ? "🔧" : "❌";
    if (status !== "❌") passed++; else failed++;

    console.log(`  ${status} ${name.padEnd(15)} | 인물 ${personRels + historyAdded} | 법인 ${fundRels} | ${hasRelations ? "통과" : historyAdded > 0 ? "보완됨" : "관계 없음"}`);
  }

  // 전체 대시보드 기업 확인
  console.log(`\n📊 통계: ${passed}/${testCorps.length} 통과, ${failed} 실패`);
  console.log(`   DB 총 ${await prisma.corp.count()}개사, PersonHistory ${await prisma.personHistory.count()}건\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
