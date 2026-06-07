import { NextRequest, NextResponse } from "next/server";
import { buildClusterGraph } from "@/lib/graph-queries";
import { toJSON } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const data = await buildClusterGraph(q);
  return NextResponse.json(toJSON(data));
}
