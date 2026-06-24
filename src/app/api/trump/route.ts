/**
 * Trump Pick API — 증분 캐싱 버전
 *
 * 캐시 전략:
 *   trump:items        — 번역 완료된 전체 항목 목록 (TTL 24h)
 *   trump:seen-hashes  — 처리한 항목 해시 Set (TTL 48h)
 *   trump:analysis     — LLM 분석 결과 (TTL 1h, 신규 항목 없으면 갱신 안 함)
 *
 * 흐름:
 *   1. 뉴스/Truth Social RSS 수집
 *   2. 각 항목을 title 해시로 신규 여부 판별
 *   3. 신규 항목만 DeepSeek으로 한국어 번역
 *   4. 신규 항목이 있을 때만 전체 재분석
 *   5. 신규 없으면 캐시 그대로 반환
 */
import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/redis-cache";

const KEY_ITEMS    = "trump:items:v3";
const KEY_HASHES   = "trump:seen-hashes:v3";
const KEY_ANALYSIS = "trump:analysis:v3";

const TTL_ITEMS    = 86400;   // 24h
const TTL_HASHES   = 172800;  // 48h
const TTL_ANALYSIS = 3600;    // 1h

const WATCHLIST_SECTORS = `
[에너지/석유] XOM CVX OXY DVN MPC PSX
[방산/항공] LMT RTX NOC GD BA HII
[금융/은행] JPM BAC GS MS WFC C
[철강/소재] X NUE STLD CLF AA
[빅테크] AAPL MSFT GOOGL AMZN META TSLA NVDA
[중국/신흥] BIDU BABA JD NIO PDD
[암호화자산] MSTR COIN RIOT MARA
[트럼프미디어] TMTG DJT
[반도체] NVDA AMD INTC QCOM TSM AVGO AMAT
[의료] JNJ MRK PFE UNH HUM
`;

const NEWS_QUERIES = [
  "Trump tariff trade policy",
  "Trump executive order economy 2025",
  "Trump Truth Social post says",
  "Trump tariff China import",
  "Trump crypto bitcoin policy",
  "Trump stock market announcement",
  "Trump posted Truth Social statement",
];

// Truth Social 접근 순서 (빠른 것부터)
// 1) Mastodon JSON API — 인증 불필요 공개 엔드포인트
// 2) RSS 애그리게이터 — Vercel 비차단
// 3) 직접 RSS — 보통 차단됨, 마지막 시도
const TRUTH_SOCIAL_JSON_API = "https://truthsocial.com/api/v1/accounts/107780257626128497/statuses?limit=10&exclude_replies=true";

const TRUTH_SOCIAL_RSS_SOURCES = [
  "https://www.trumpstruth.org/feed",           // Trump's Truth 아카이브 RSS
  "https://truthsocial.com/@realDonaldTrump.rss",
  "https://rss.truthsocial.com/@realDonaldTrump",
];

// Yahoo News RSS (Trump Truth Social 인용)
const YAHOO_NEWS_QUERIES = [
  "https://news.yahoo.com/rss/",  // 정치 섹션 기본
];

const YAHOO_NEWS_SEARCH = [
  "Trump Truth Social",
  "Trump announcement today",
];

// ─── 유틸 ───
function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// 간단한 해시 (title 기반)
function hashTitle(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = Math.imul(31, h) + title.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(36);
}

async function tryFetchText(url: string, timeout = 6000, ua?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept": "application/rss+xml, application/json, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeout),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function parseRssItems(xml: string, limit = 8) {
  const items: { title: string; text: string; date: string; link: string }[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const b = m[1];
    const title = stripHtml(decodeHtml(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(b)?.[1] ?? ""));
    const desc  = stripHtml(decodeHtml(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/.exec(b)?.[1] ?? ""));
    const date  = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(b)?.[1] ?? "").trim();
    const link  = (/<link>([\s\S]*?)<\/link>/.exec(b)?.[1] ?? "").trim();
    if (title) items.push({ title, text: desc.slice(0, 350), date, link });
  }
  return items;
}

// Mastodon JSON API → RSS 형식 변환
function mastodonToItems(posts: any[]): { title: string; text: string; date: string; link: string }[] {
  return posts
    .filter(p => p.content || p.reblog?.content)
    .map(p => {
      const content = stripHtml(decodeHtml(p.content ?? p.reblog?.content ?? ""));
      return {
        title: content.slice(0, 100) + (content.length > 100 ? "…" : ""),
        text:  content.slice(0, 350),
        date:  p.created_at ?? "",
        link:  p.url ?? `https://truthsocial.com/@realDonaldTrump/${p.id}`,
      };
    })
    .filter(i => i.title);
}

// ─── Truth Social 수집 (3단계 폴백) ───
async function fetchTruthSocial(): Promise<{ items: any[]; source: string } | null> {
  // 1단계: Mastodon JSON API (인증 없이 공개 계정 접근)
  try {
    const text = await tryFetchText(TRUTH_SOCIAL_JSON_API, 5000);
    if (text) {
      const posts = JSON.parse(text);
      if (Array.isArray(posts) && posts.length > 0) {
        const items = mastodonToItems(posts);
        if (items.length > 0) return { items, source: "Truth Social (Mastodon API)" };
      }
    }
  } catch {}

  // 2단계: RSS 애그리게이터 + 직접 RSS 순차 시도
  for (const url of TRUTH_SOCIAL_RSS_SOURCES) {
    const text = await tryFetchText(url, 5000);
    if (text && (text.includes("<item>") || text.includes("<entry>"))) {
      const items = parseRssItems(text, 10);
      if (items.length > 0) {
        const sourceName = url.includes("trumpstruth") ? "Trump's Truth 아카이브" : "Truth Social RSS";
        return { items, source: sourceName };
      }
    }
  }

  return null;
}

// ─── Yahoo News RSS 수집 ───
async function fetchYahooNews(): Promise<{ title: string; text: string; date: string; link: string; source: string }[]> {
  const all: { title: string; text: string; date: string; link: string; source: string }[] = [];
  await Promise.allSettled(
    YAHOO_NEWS_SEARCH.map(async (q) => {
      // Yahoo News는 검색 RSS를 직접 지원하지 않으므로 Google News Yahoo 관련 쿼리 활용
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " site:yahoo.com OR site:finance.yahoo.com")}&hl=en-US&gl=US&ceid=US:en`;
      const text = await tryFetchText(url, 6000);
      if (text && text.includes("<item>")) {
        parseRssItems(text, 4).forEach(i => all.push({ ...i, source: `Yahoo News: ${q}` }));
      }
    })
  );
  return all;
}

async function fetchAllNews() {
  const all: { title: string; text: string; date: string; link: string; source: string }[] = [];

  // Google News + Yahoo News 병렬
  await Promise.allSettled([
    // Google News
    ...NEWS_QUERIES.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const text = await tryFetchText(url, 6000);
      if (text && text.includes("<item>")) {
        parseRssItems(text, 5).forEach(i => all.push({ ...i, source: `Google: ${q}` }));
      }
    }),
    // Yahoo News (Trump Truth Social 인용)
    fetchYahooNews().then(items => all.push(...items)),
  ]);
  const seen = new Set<string>();
  return all
    .filter(i => { const k = i.title.slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 25);
}

// ─── DeepSeek 호출 ───
async function deepseek(prompt: string, json = false): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: json ? 2000 : 600,
        messages: [{ role: "user", content: prompt }],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

// 신규 항목들을 배치 번역 (한 번의 API 호출)
async function translateItems(
  items: { title: string; text: string; type: "news" | "truth"; source?: string }[]
): Promise<{ titleKo: string; summaryKo: string }[]> {
  if (!items.length) return [];

  const prompt = `다음 ${items.length}개의 영어 뉴스/SNS 항목을 한국어로 번역·요약하세요.
각 항목을 번호 순서대로 JSON 배열로 반환하세요.

${items.map((it, i) => `[${i+1}] 제목: ${it.title}\n내용: ${it.text || "(없음)"}`).join("\n\n")}

형식 (JSON만, 설명 없이):
{
  "items": [
    { "titleKo": "한국어 제목 (간결하게)", "summaryKo": "핵심 내용 1~2문장 한국어 요약" }
  ]
}`;

  const raw = await deepseek(prompt, true);
  if (!raw) return items.map(() => ({ titleKo: "", summaryKo: "" }));

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}");
    const arr = parsed.items ?? [];
    return items.map((_, i) => ({
      titleKo: arr[i]?.titleKo ?? "",
      summaryKo: arr[i]?.summaryKo ?? "",
    }));
  } catch {
    return items.map(() => ({ titleKo: "", summaryKo: "" }));
  }
}

// 전체 분석
async function runAnalysis(
  items: any[],
  truthItems: any[],
): Promise<{ result: any; error: string | null }> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return { result: null, error: "DEEPSEEK_API_KEY 미설정 — Vercel > Settings > Environment Variables 추가 필요" };
  }

  const truthText = truthItems.length
    ? truthItems.map((p, i) => `[SNS ${i+1}] ${p.titleKo || p.title}\n${p.summaryKo || p.text}`).join("\n\n")
    : "(Truth Social RSS 차단 — 뉴스 인용 기반 분석)";

  const newsText = items.slice(0, 15)
    .map((n, i) => `[뉴스 ${i+1}] ${n.titleKo || n.title}\n${n.summaryKo || n.text}`)
    .join("\n\n");

  const prompt = `당신은 트럼프 행정부 정책 동향을 분석하는 퀀트 애널리스트입니다.
아래 내용을 분석하여 반드시 유효한 JSON만 응답하세요.

=== 트럼프 SNS ===
${truthText}

=== 관련 뉴스 ===
${newsText}

=== 관심 종목 ===
${WATCHLIST_SECTORS}

{
  "summary": "트럼프 현재 의도·정책 방향 (한국어 2~3문장)",
  "mood": "강경 또는 중립 또는 완화 또는 불확실",
  "keyTopics": ["토픽1", "토픽2", "토픽3"],
  "marketImpact": "시장 전반 영향 (한국어 1~2문장)",
  "picks": [
    {
      "ticker": "종목코드",
      "name": "종목명",
      "action": "STRONG_BUY 또는 BUY 또는 WATCH 또는 SELL 또는 STRONG_SELL",
      "reason": "근거 (한국어 1문장)",
      "confidence": 75,
      "sector": "섹터",
      "priceTarget": "상승 또는 하락 또는 중립"
    }
  ],
  "riskFactors": ["리스크1", "리스크2"],
  "nextCatalyst": "다음 주목 이벤트 (한국어)"
}`;

  const raw = await deepseek(prompt, true);
  if (!raw) return { result: null, error: "DeepSeek 응답 없음" };

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return { result: JSON.parse(match?.[0] ?? "{}"), error: null };
  } catch (e: any) {
    return { result: null, error: `JSON 파싱 실패: ${raw.slice(0, 100)}` };
  }
}

// ─── GET ───
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1"
             || req.nextUrl.searchParams.get("force") === "true";

  // ── 1. 신규 항목 없으면 캐시 그대로 반환 ──
  if (!force) {
    const [cachedAnalysis, cachedItems] = await Promise.all([
      getCache(KEY_ANALYSIS),
      getCache(KEY_ITEMS),
    ]);
    if (cachedAnalysis && !cachedAnalysis.stale && cachedItems) {
      return NextResponse.json({
        ...cachedAnalysis.data,
        items: cachedItems.data,
        fromCache: true,
        cachedSecondsAgo: cachedAnalysis.age,
        newItemsFound: 0,
      });
    }
  }

  // ── 2. 최신 뉴스·SNS 수집 ──
  const [truthResult, rawNews] = await Promise.all([
    fetchTruthSocial(),
    fetchAllNews(),
  ]);

  const rawTruth = truthResult?.items ?? [];

  // ── 3. 기존에 본 해시 로드 ──
  const seenCache = await getCache(KEY_HASHES);
  const seenHashes: Set<string> = new Set(seenCache?.data ?? []);

  // ── 4. 신규 항목 분류 ──
  const newTruth = rawTruth.filter(i => !seenHashes.has(hashTitle(i.title)));
  const newNews  = rawNews.filter(i => !seenHashes.has(hashTitle(i.title)));
  const hasNew   = newTruth.length > 0 || newNews.length > 0;

  // ── 5. 기존 번역 항목 로드 ──
  const existingItemsCache = await getCache(KEY_ITEMS);
  const existingItems: any[] = existingItemsCache?.data ?? [];

  let allItems = existingItems;
  let analysisError: string | null = null;
  let analysis: any = null;

  if (hasNew || force) {
    // ── 6. 신규 항목만 번역 ──
    const toTranslate = [
      ...newTruth.map(i => ({ ...i, type: "truth" as const })),
      ...newNews.map(i => ({ ...i, type: "news" as const })),
    ];

    const translations = await translateItems(toTranslate);

    const newTranslatedTruth = newTruth.map((i, idx) => ({
      ...i,
      type: "truth",
      source: truthResult?.source ?? "Truth Social",
      titleKo: translations[idx]?.titleKo ?? "",
      summaryKo: translations[idx]?.summaryKo ?? "",
      hash: hashTitle(i.title),
    }));

    const newTranslatedNews = newNews.map((i, idx) => ({
      ...i,
      type: "news",
      titleKo: translations[newTruth.length + idx]?.titleKo ?? "",
      summaryKo: translations[newTruth.length + idx]?.summaryKo ?? "",
      hash: hashTitle(i.title),
    }));

    // 신규를 앞에, 기존을 뒤에 합쳐서 최대 30개 유지
    allItems = [
      ...newTranslatedTruth,
      ...newTranslatedNews,
      ...existingItems,
    ].slice(0, 30);

    // ── 7. 해시 업데이트 ──
    toTranslate.forEach(i => seenHashes.add(hashTitle(i.title)));
    await setCache(KEY_HASHES, [...seenHashes], TTL_HASHES);

    // ── 8. 번역 항목 저장 ──
    await setCache(KEY_ITEMS, allItems, TTL_ITEMS);

    // ── 9. 전체 재분석 ──
    const truthItems = allItems.filter(i => i.type === "truth");
    const { result, error } = await runAnalysis(allItems.filter(i => i.type === "news"), truthItems);
    analysis = result;
    analysisError = error;

    if (analysis) {
      const payload = {
        generatedAt: new Date().toISOString(),
        truthSource: truthResult?.source ?? "Google News (트루스소셜 인용 뉴스)",
        analysis,
        analysisError: null,
        newItemsFound: toTranslate.length,
      };
      await setCache(KEY_ANALYSIS, payload, TTL_ANALYSIS);
      return NextResponse.json({ ...payload, items: allItems, fromCache: false });
    }
  } else {
    // 신규 없음 — 기존 분석 반환 (TTL 연장 없이)
    const cachedAnalysis = await getCache(KEY_ANALYSIS);
    return NextResponse.json({
      ...(cachedAnalysis?.data ?? {}),
      items: allItems,
      fromCache: true,
      cachedSecondsAgo: cachedAnalysis?.age ?? 0,
      newItemsFound: 0,
      noNewContent: true,
    });
  }

  // 분석 실패 fallback
  const fallback = {
    summary: analysisError ?? "분석 불가",
    mood: "불확실",
    keyTopics: allItems.slice(0, 3).map(n => (n.titleKo || n.title).slice(0, 25)),
    marketImpact: "뉴스 탭 원문 확인",
    picks: [],
    riskFactors: analysisError ? [analysisError] : [],
    nextCatalyst: "",
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    truthSource: truthResult?.source ?? "Google News (트루스소셜 인용 뉴스)",
    analysis: fallback,
    analysisError,
    items: allItems,
    fromCache: false,
    newItemsFound: (newTruth.length + newNews.length),
  });
}
