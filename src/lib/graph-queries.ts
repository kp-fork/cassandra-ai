import { prisma } from "./prisma";
import fs from "fs";
import path from "path";

// DART 기업 매핑
let dartCorps: { corp_code: string; name: string; stock_code: string }[] = [];
try {
  const p = path.join(process.cwd(), "data", "dart-corp-codes.json");
  if (fs.existsSync(p)) dartCorps = JSON.parse(fs.readFileSync(p, "utf-8"));
} catch {}

export interface GraphNode {
  data: {
    id: string;
    label: string;
    type: "corp" | "person" | "fund";
    flags?: string[];
    marketCap?: number;
    isAdmin?: boolean;
    delistedAt?: string;
    role?: string;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    type: "person_corp" | "fund_corp" | "fund_person" | "filing_flow";
  };
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function buildClusterGraph(query: string): Promise<GraphData> {
  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];

  // 1. 회사 검색
  const corps = await prisma.corp.findMany({
    where: {
      OR: [
        { companyName: { contains: query, mode: "insensitive" } },
        { corpCode: { contains: query } },
        { stockCode: { contains: query } },
      ],
    },
    include: {
      personRelations: { include: { person: true } },
      fundRelations: { include: { fund: true } },
      filings: { orderBy: { filedAt: "desc" }, take: 10 },
      signals: { orderBy: { firedAt: "desc" }, take: 5 },
    },
    take: 5,
  });

  // 2. 인물 검색
  const persons = await prisma.person.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    include: {
      corpRelations: { include: { corp: true } },
      fundRelations: { include: { fund: true } },
    },
    take: 5,
  });

  // 3. 법인/조합 검색
  const funds = await prisma.fund.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    include: {
      corpRelations: { include: { corp: true } },
      personRelations: { include: { person: true } },
    },
    take: 5,
  });

  // 4. DB에 없는 경우 DART 매핑에서 검색 + DART API 호출
  if (corps.length === 0 && persons.length === 0 && funds.length === 0) {
    const dartMatch = dartCorps.find(
      (c) => c.name.includes(query) || c.stock_code === query
    );
    if (dartMatch) {
      const nodeId = `dart-${dartMatch.stock_code}`;
      nodes.set(nodeId, {
        data: {
          id: nodeId,
          label: dartMatch.name,
          type: "corp",
        },
      });

      // DART API로 최근 공시 검색 (별도 import 없이 fetch 사용)
      try {
        const dartKey = getDartKey();
        if (dartKey) {
          const today = new Date().toISOString().slice(0,10).replace(/-/g,"");
          const ago = new Date(Date.now()-365*86400000).toISOString().slice(0,10).replace(/-/g,"");
          const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${dartKey}&corp_code=${dartMatch.corp_code}&bgn_de=${ago}&end_de=${today}&page_count=10`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.status === "000" && data.list) {
            for (const item of data.list) {
              // 공시 제목에서 인물/법인명 추출
              const title = item.report_nm || "";
              if (title.includes(query)) {
                const filingNodeId = `filing-${item.rcept_no}`;
                nodes.set(filingNodeId, {
                  data: { id: filingNodeId, label: title.slice(0, 30), type: "corp" },
                });
                edges.push({
                  data: {
                    id: `fe-${item.rcept_no}`,
                    source: nodeId,
                    target: filingNodeId,
                    label: item.rcept_dt,
                    type: "filing_flow",
                  },
                });
              }
            }
          }
        }
} catch {}

function getDartKey(): string {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const env = fs.readFileSync(envPath, "utf-8");
    const m = env.match(/DART_API_KEY=(.+)/);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}
    }
  }

  // 5. 5-hop 관계망 확장
  for (let hop = 0; hop < 5; hop++) {
    const currentCorpIds = new Set(
      [...nodes.values()].filter((n) => n.data.type === "corp").map((n) => n.data.id.replace("corp-", ""))
    );
    const currentPersonIds = new Set(
      [...nodes.values()].filter((n) => n.data.type === "person").map((n) => n.data.id.replace("person-", ""))
    );
    const currentFundIds = new Set(
      [...nodes.values()].filter((n) => n.data.type === "fund").map((n) => n.data.id.replace("fund-", ""))
    );

    let newFound = false;

    // Corp → Person → Corp (2-hop)
    for (const corpId of currentCorpIds) {
      const rels = await prisma.corpPersonRelation.findMany({
        where: { corpId },
        include: { person: { include: { corpRelations: { include: { corp: true } } } } },
        take: 10,
      });
      for (const rel of rels) {
        addPersonNode(nodes, rel.person);
        edges.push({ data: { id: `pc-${rel.id}`, source: `corp-${corpId}`, target: `person-${rel.personId}`, label: rel.role, type: "person_corp" } });
        for (const cr of rel.person.corpRelations) {
          if (!currentCorpIds.has(cr.corpId)) {
            newFound = true;
            addCorpNode(nodes, cr.corp);
            edges.push({ data: { id: `pc-${cr.id}`, source: `person-${rel.personId}`, target: `corp-${cr.corpId}`, label: cr.role, type: "person_corp" } });
          }
        }
      }
    }

    // Corp → Fund → Person/Corp
    for (const corpId of currentCorpIds) {
      const fundRels = await prisma.corpFundRelation.findMany({
        where: { corpId },
        include: { fund: { include: { corpRelations: { include: { corp: true } }, personRelations: { include: { person: true } } } } },
        take: 10,
      });
      for (const rel of fundRels) {
        if (!currentFundIds.has(rel.fundId)) {
          newFound = true;
          addFundNode(nodes, rel.fund);
          edges.push({ data: { id: `fc-${rel.id}`, source: `fund-${rel.fundId}`, target: `corp-${corpId}`, label: rel.relationType, type: "fund_corp" } });
          for (const cr of rel.fund.corpRelations) {
            if (!currentCorpIds.has(cr.corpId)) {
              addCorpNode(nodes, cr.corp);
              edges.push({ data: { id: `fc2-${cr.id}`, source: `fund-${rel.fundId}`, target: `corp-${cr.corpId}`, label: cr.relationType, type: "fund_corp" } });
            }
          }
          for (const pr of rel.fund.personRelations) {
            if (!currentPersonIds.has(pr.personId)) {
              addPersonNode(nodes, pr.person);
              edges.push({ data: { id: `fp-${pr.id}`, source: `fund-${rel.fundId}`, target: `person-${pr.personId}`, label: pr.role === "BENEFICIAL_OWNER" ? "실소유" : "대표", type: "fund_person" } });
            }
          }
        }
      }
    }

    if (!newFound) break;
  }
  for (const corp of corps) {
    addCorpNode(nodes, corp);

    for (const rel of corp.personRelations) {
      addPersonNode(nodes, rel.person);
      edges.push({
        data: {
          id: `pc-${rel.id}`,
          source: `person-${rel.personId}`,
          target: `corp-${corp.id}`,
          label: rel.role,
          type: "person_corp",
        },
      });
    }

    for (const rel of corp.fundRelations) {
      addFundNode(nodes, rel.fund);
      edges.push({
        data: {
          id: `fc-${rel.id}`,
          source: `fund-${rel.fundId}`,
          target: `corp-${corp.id}`,
          label: rel.relationType,
          type: "fund_corp",
        },
      });
      // 법인의 실소유자도 확장
      const fundPersonRels = await prisma.fundPersonRelation.findMany({
        where: { fundId: rel.fundId },
        include: { person: true },
      });
      for (const fpr of fundPersonRels) {
        addPersonNode(nodes, fpr.person);
        edges.push({
          data: {
            id: `fp-${fpr.id}`,
            source: `fund-${rel.fundId}`,
            target: `person-${fpr.personId}`,
            label: fpr.role === "BENEFICIAL_OWNER" ? "실소유" : "대표",
            type: "fund_person",
          },
        });
      }
    }
  }

  // 5. 인물 검색 결과 확장
  for (const person of persons) {
    addPersonNode(nodes, person);
    for (const rel of person.corpRelations) {
      addCorpNode(nodes, rel.corp);
      edges.push({
        data: {
          id: `pc-${rel.id}`,
          source: `person-${person.id}`,
          target: `corp-${rel.corpId}`,
          label: rel.role,
          type: "person_corp",
        },
      });
    }
    for (const rel of person.fundRelations) {
      addFundNode(nodes, rel.fund);
      edges.push({
        data: {
          id: `fp-${rel.id}`,
          source: `person-${person.id}`,
          target: `fund-${rel.fundId}`,
          label: rel.role === "BENEFICIAL_OWNER" ? "실소유" : "대표",
          type: "fund_person",
        },
      });
    }
  }

  // 6. 법인 검색 결과 확장
  for (const fund of funds) {
    addFundNode(nodes, fund);
    for (const rel of fund.corpRelations) {
      addCorpNode(nodes, rel.corp);
      edges.push({
        data: {
          id: `fc-${rel.id}`,
          source: `fund-${fund.id}`,
          target: `corp-${rel.corpId}`,
          label: rel.relationType,
          type: "fund_corp",
        },
      });
    }
    for (const rel of fund.personRelations) {
      addPersonNode(nodes, rel.person);
      edges.push({
        data: {
          id: `fp-${rel.id}`,
          source: `fund-${fund.id}`,
          target: `person-${rel.personId}`,
          label: rel.role === "BENEFICIAL_OWNER" ? "실소유" : "대표",
          type: "fund_person",
        },
      });
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}

function addCorpNode(nodes: Map<string, GraphNode>, corp: any) {
  const id = `corp-${corp.id}`;
  if (!nodes.has(id)) {
    nodes.set(id, {
      data: {
        id,
        label: corp.companyName,
        type: "corp",
        marketCap: corp.marketCap ? Number(corp.marketCap) : undefined,
        isAdmin: corp.isAdmin,
        delistedAt: corp.delistedAt?.toISOString(),
      },
    });
  }
}

function addPersonNode(nodes: Map<string, GraphNode>, person: any) {
  const id = `person-${person.id}`;
  if (!nodes.has(id)) {
    nodes.set(id, {
      data: {
        id,
        label: person.name,
        type: "person",
        flags: person.flags,
      },
    });
  }
}

function addFundNode(nodes: Map<string, GraphNode>, fund: any) {
  const id = `fund-${fund.id}`;
  if (!nodes.has(id)) {
    nodes.set(id, {
      data: {
        id,
        label: fund.name,
        type: "fund",
        flags: fund.flags,
      },
    });
  }
}

export async function searchAll(query: string) {
  if (!query || query.length < 1) return { corps: [], persons: [], funds: [] };

  const [corps, persons, funds] = await Promise.all([
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

  return { corps, persons, funds };
}
