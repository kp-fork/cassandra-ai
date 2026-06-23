import { NextResponse } from "next/server";

const SPACE_KEYWORDS = [
  "spacex","starship","falcon","starlink","rocket","launch","orbit",
  "satellite","space","mars","iss","nasa","payload","booster","reentry",
  "landing","crew","dragon","raptor","tesla","doge","government","contract",
  "ipo","stock","share","invest","billion","funding",
];

// nitter 인스턴스 목록 (최대한 많이)
const NITTER_INSTANCES = [
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
  "https://nitter.1d4.us",
  "https://nitter.kavin.rocks",
  "https://nitter.unixfox.eu",
  "https://n.sneed.network",
  "https://nitter.moomoo.me",
  "https://nitter.net",
];

// RSSHub 인스턴스 (nitter 전체 실패 시 폴백)
const RSSHUB_INSTANCES = [
  "https://rsshub.app",
  "https://rsshub.rssforever.com",
  "https://hub.slarker.me",
];

async function tryFetch(url: string, timeout = 6000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(timeout),
    });
    if (res.ok) {
      const text = await res.text();
      // RSS 형식 최소 확인
      if (text.includes("<item>") || text.includes("<entry>")) return text;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchElonRSS(): Promise<{ xml: string; source: string }> {
  // 1단계: nitter 인스턴스 병렬 시도 (첫 번째 성공한 것 사용)
  const nitterResults = await Promise.allSettled(
    NITTER_INSTANCES.map(base => tryFetch(`${base}/elonmusk/rss`))
  );
  for (let i = 0; i < nitterResults.length; i++) {
    const r = nitterResults[i];
    if (r.status === "fulfilled" && r.value) {
      return { xml: r.value, source: NITTER_INSTANCES[i] };
    }
  }

  // 2단계: RSSHub 폴백
  for (const base of RSSHUB_INSTANCES) {
    const xml = await tryFetch(`${base}/twitter/user/elonmusk`, 8000);
    if (xml) return { xml, source: base };
  }

  throw new Error("All RSS sources failed (nitter + rsshub)");
}

function parseRSSItems(xml: string) {
  const items: { title: string; link: string; pubDate: string; text: string }[] = [];

  // RSS 2.0 <item> 파싱
  const blocks = xml.split("<item>").slice(1);
  for (const block of blocks) {
    const title   = block.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]>/s)?.[1]?.trim()
                 || block.match(/<title[^>]*>(.*?)<\/title>/s)?.[1]?.trim() || "";
    const link    = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim()
                 || block.match(/<link[^>]+href="([^"]+)"/)?.[1]?.trim() || "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim()
                 || block.match(/<published>(.*?)<\/published>/)?.[1]?.trim() || "";
    const desc    = block.match(/<description><!\[CDATA\[(.*?)\]\]>/s)?.[1]
                 || block.match(/<description>(.*?)<\/description>/s)?.[1] || "";
    const text = (title + " " + desc).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 10) items.push({ title, link, pubDate, text });
  }

  // Atom <entry> 파싱 (RSSHub 일부 포맷)
  if (items.length === 0) {
    const entries = xml.split("<entry>").slice(1);
    for (const block of entries) {
      const title   = block.match(/<title[^>]*>(.*?)<\/title>/s)?.[1]?.replace(/<[^>]+>/g,"").trim() || "";
      const link    = block.match(/<link[^>]+href="([^"]+)"/)?.[1]?.trim() || "";
      const pubDate = block.match(/<published>(.*?)<\/published>/)?.[1]?.trim()
                   || block.match(/<updated>(.*?)<\/updated>/)?.[1]?.trim() || "";
      const content = block.match(/<content[^>]*>(.*?)<\/content>/s)?.[1]
                   || block.match(/<summary[^>]*>(.*?)<\/summary>/s)?.[1] || "";
      const text = (title + " " + content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 10) items.push({ title, link, pubDate, text });
    }
  }

  return items;
}

function isSpaceRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return SPACE_KEYWORDS.some(k => lower.includes(k));
}

async function analyzeTweets(tweets: any[]): Promise<any[]> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key || !tweets.length) return tweets.map(t => ({ ...t, analysis: null }));

  const prompt = `다음은 일론 머스크의 X(트위터) 게시물 목록입니다. 각 게시물을 SpaceX 주식 관점에서 분석해주세요.

게시물 목록:
${tweets.map((t, i) => `[${i + 1}] ${t.text.slice(0, 300)}`).join("\n\n")}

각 게시물에 대해 JSON 배열로 응답하세요 (순서 동일):
[
  {
    "sentiment": "bullish|bearish|neutral",
    "riskLevel": "high|medium|low",
    "impact": "SpaceX 주가에 미칠 영향 한 문장 (한국어)",
    "investNote": "투자자 관점 액션 한 문장 (한국어)",
    "tags": ["관련 태그 2-3개"]
  }
]

JSON만 출력하세요. 마크다운 코드블록 없이.`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 1500,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "[]";
    const analyses = JSON.parse(raw.trim());

    return tweets.map((t, i) => ({ ...t, analysis: analyses[i] || null }));
  } catch {
    return tweets.map(t => ({ ...t, analysis: null }));
  }
}

// 캐시 (메모리, 1시간)
let cache: { data: any; at: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    const { xml, source } = await fetchElonRSS();
    const all = parseRSSItems(xml);
    const spaceItems = all.filter(t => isSpaceRelated(t.text)).slice(0, 8);

    const withAnalysis = await analyzeTweets(spaceItems);

    const result = {
      tweets: withAnalysis,
      fetchedAt: new Date().toISOString(),
      source,
      cached: false,
    };

    cache = { data: result, at: Date.now() };
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({
      error: e.message,
      tweets: [],
      fetchedAt: new Date().toISOString(),
    }, { status: 200 });
  }
}
