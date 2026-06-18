/**
 * CB 발행·리픽싱 상세 데이터 추출
 * npm run extract-cb
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("CB 발행·리픽싱 데이터 추출 중...\n");

    const filings = await prisma.filing.findMany({
        where: { 
            title: { contains: "전환사채", mode: "insensitive" } 
        },
        orderBy: { filedAt: "desc" },
        take: 100,
        select: {
            title: true, filedAt: true, rceptNo: true,
            corp: { select: { companyName: true, stockCode: true, corpCode: true } }
        }
    });

    const cbItems: any[] = [];
    for (const f of filings) {
        const title = f.title || "";
        const isRefixing = title.includes("리픽싱") || title.includes("만기전사채취득") || title.includes("조정");
        const isAdjust = title.includes("조정") || title.includes("리픽싱");
        const isBuyback = title.includes("만기전") || title.includes("취득");

        let riskLevel = "보통";
        let riskScore = 0;
        if (isRefixing) { riskLevel = "고위험"; riskScore = 3; }
        else if (isBuyback) { riskLevel = "주의"; riskScore = 2; }
        else { riskLevel = "보통"; riskScore = 1; }

        cbItems.push({
            date: f.filedAt?.toISOString().slice(0, 10) || "",
            companyName: f.corp?.companyName || "",
            stockCode: f.corp?.stockCode || "",
            corpCode: f.corp?.corpCode || "",
            reportName: title.slice(0, 80),
            rceptNo: f.rceptNo || "",
            category: isRefixing ? "리픽싱" : "CB발행",
            riskLevel,
            riskScore,
            refixingFlag: isRefixing,
            issuePrice: isAdjust ? "전환가액 조정" : "",
            detail: isRefixing ? "⚠️ 전환가액 조정(리픽싱) — 기존 투자자 지분 희석 위험" : "",
        });
    }

    // kosdaq-cb-issuances.json 갱신
    const fs = require("fs");
    fs.writeFileSync("data/kosdaq-cb-issuances.json", JSON.stringify(cbItems, null, 2));
    console.log(`kosdaq-cb-issuances.json: ${cbItems.length}건`);
    console.log(`  리픽싱: ${cbItems.filter(c => c.refixingFlag).length}건`);
    console.log(`  발행: ${cbItems.filter(c => !c.refixingFlag).length}건`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
