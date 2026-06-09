import { NextRequest, NextResponse } from "next/server";
import { buildClusterGraph } from "@/lib/graph-queries";
import { toJSON } from "@/lib/serialize";
import { getCache, setCache } from "@/lib/redis-cache";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!q.trim()) return NextResponse.json(toJSON({ nodes: [], edges: [] }));

  const normalizedQ = q.trim().toLowerCase();
  if (!forceRefresh) {
    const cached = await getCache(`graph:${normalizedQ}`);
    if (cached) {
      return NextResponse.json(toJSON({
        ...cached.data,
        cached: true,
        cacheAge: Math.floor(cached.age / 60),
        cacheStale: cached.stale,
      }));
    }
  }

  const data = await buildClusterGraph(q.trim());
  const result = { ...data, cached: false, cacheAge: 0, cacheStale: false };

  await setCache(`graph:${normalizedQ}`, result);
  return NextResponse.json(toJSON(result));
}
