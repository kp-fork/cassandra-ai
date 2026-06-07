import { redirect } from "next/navigation";

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return <SearchClient searchParams={searchParams} />;
}

// redirect works in server component but we need client interactivity
async function SearchClient({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  if (!q) redirect("/");
  return <p>Redirecting...</p>;
}

// 실제 검색 경험은 홈페이지에서 처리하므로 /search 경로로 들어오면 홈으로 리다이렉트
export async function generateMetadata() {
  return { title: "CASSANDRA AI — 검색" };
}
