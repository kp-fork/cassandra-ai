import { prisma } from "./prisma";

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

  // 4. 회사와 연결된 모든 관계를 그래프로 확장
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
