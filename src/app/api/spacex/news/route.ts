import { NextResponse } from "next/server";

const SPACE_KEYWORDS = [
  "spacex","starship","falcon","starlink","rocket","launch","orbit",
  "satellite","space","mars","iss","nasa","payload","booster","reentry",
  "landing","crew","dragon","raptor","tesla","doge","government","contract",
  "ipo","stock","share","invest","billion","funding",
];

const NITTER_INSTANCES = [
  "https://nitter.poast.org",
  "https://nitter.net",
  "https://nitter.privacydev.net",
];

// 여러 nitter 인스턴스 중 살아있는 걸로 RSS fetch
async function fetchElonRSS(): Promise<string> {
  for (const base of NITTER_INSTANCES) {
    try {
      const res = await fetch(`${base}/elonmusk/rss`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return await res.text();
    } catch {}
  }
  throw new Error("All nitter instances failed");
}

function parseRSSItems(xml: string) {
  const items: { title: string; link: string; pubDate: string; text: string }[] = [];
  const blocks = xml.split("<item>").slice(1);
  for (const block of blocks) {
    const title   = block.match(/<title><!\[CDATA\[(.*?)\]\]>/s)?.[1]?.trim() || "";
    const link    = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || "";
    const desc    = block.match(/<description><!\[CDATA\[(.*?)\]\]>/s)?.[1] || "";
    // HTML 태그 제거
    const text = (title + " " + desc).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    items.push({ title, link, pubDate, text });
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

    const xml = await fetchElonRSS();
    const all  = parseRSSItems(xml);
    const spaceItems = all.filter(t => isSpaceRelated(t.text)).slice(0, 8);

    const withAnalysis = await analyzeTweets(spaceItems);

    const result = {
      tweets: withAnalysis,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    cache = { data: result, at: Date.now() };
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, tweets: [], fetchedAt: new Date().toISOString() }, { status: 200 });
  }
}
