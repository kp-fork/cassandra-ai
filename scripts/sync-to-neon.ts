/**
 * Neon DB 동기화 — 로컬 DB 데이터를 Neon으로 복사
 * 실행: npx tsx scripts/sync-to-neon.ts
 */

const NEON_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";

async function main() {
  console.log("🔄 Neon DB 동기화 시작...\n");

  const { PrismaClient } = require("@prisma/client");
  const localP = new PrismaClient();
  const neonP = new PrismaClient({ datasources: { db: { url: NEON_URL } } });

  // 1. Corp 동기화
  const localCorps = await localP.corp.findMany({ include: { personRelations: { include: { person: true } }, fundRelations: { include: { fund: true } }, filings: true } });
  let corpsSync = 0, personsSync = 0, relsSync = 0, filingsSync = 0, fundsSync = 0;

  for (const corp of localCorps) {
    try {
      const neonCorp = await neonP.corp.upsert({
        where: { corpCode: corp.corpCode },
        update: { companyName: corp.companyName, stockCode: corp.stockCode, marketCap: corp.marketCap, isAdmin: corp.isAdmin },
        create: { corpCode: corp.corpCode, stockCode: corp.stockCode, companyName: corp.companyName, market: corp.market, isAdmin: corp.isAdmin },
      });
      corpsSync++;

      for (const rel of corp.personRelations) {
        const p = rel.person;
        const neonPerson = await neonP.person.upsert({
          where: { personUid: p.personUid },
          update: { name: p.name, flags: p.flags, birthDate: p.birthDate },
          create: { personUid: p.personUid, name: p.name, flags: p.flags, birthDate: p.birthDate },
        }).catch(() => null);
        if (neonPerson) {
          personsSync++;
          await neonP.corpPersonRelation.upsert({
            where: { id: rel.id },
            update: { role: rel.role },
            create: { id: rel.id, personId: neonPerson.id, corpId: neonCorp.id, role: rel.role, since: rel.since },
          }).catch(() => {});
          relsSync++;
        }
      }

      for (const rel of corp.fundRelations) {
        const f = rel.fund;
        const neonFund = await neonP.fund.upsert({
          where: { fundUid: f.fundUid },
          update: { name: f.name, fundType: f.fundType },
          create: { fundUid: f.fundUid, name: f.name, fundType: f.fundType },
        }).catch(() => null);
        if (neonFund) {
          fundsSync++;
          await neonP.corpFundRelation.upsert({
            where: { id: rel.id },
            update: { relationType: rel.relationType },
            create: { id: rel.id, fundId: neonFund.id, corpId: neonCorp.id, relationType: rel.relationType },
          }).catch(() => {});
          relsSync++;
        }
      }

      for (const f of corp.filings) {
        await neonP.filing.upsert({
          where: { rceptNo: f.rceptNo },
          update: {},
          create: { rceptNo: f.rceptNo, corpId: neonCorp.id, filingType: f.filingType, title: f.title, summary: f.summary, filedAt: f.filedAt },
        }).catch(() => {});
        filingsSync++;
      }
    } catch (e: any) {
      console.log(`  ⚠️ ${corp.companyName}: ${e.message}`);
    }

    if (corpsSync % 50 === 0) {
      console.log(`  ${corpsSync}/${localCorps.length} 개사 | ${relsSync} 관계 | ${filingsSync} 공시`);
    }
  }

  // 2. PersonHistory 동기화
  const localHistory = await localP.personHistory.findMany({ take: 1000 });
  for (const h of localHistory) {
    await neonP.personHistory.upsert({
      where: { id: h.id },
      update: {},
      create: {
        id: h.id, personUid: h.personUid, name: h.name, birthDate: h.birthDate,
        companyName: h.companyName, stockCode: h.stockCode,
        role: h.role, eventType: h.eventType, eventDate: h.eventDate,
        sourceRceptNo: h.sourceRceptNo, sourceTitle: h.sourceTitle,
      },
    }).catch(() => {});
  }

  // 3. 결과
  const neonTotal = {
    corps: await neonP.corp.count(),
    persons: await neonP.person.count(),
    personHistory: await neonP.personHistory.count(),
    filings: await neonP.filing.count(),
    relations: await neonP.corpPersonRelation.count(),
  };

  console.log(`\n✅ Neon 동기화 완료`);
  console.log(`  Corp: ${neonTotal.corps} | Person: ${neonTotal.persons} | PersonHistory: ${neonTotal.personHistory}`);
  console.log(`  Filings: ${neonTotal.filings} | Relations: ${neonTotal.relations}`);

  await localP.$disconnect();
  await neonP.$disconnect();
}

main().catch(console.error);
