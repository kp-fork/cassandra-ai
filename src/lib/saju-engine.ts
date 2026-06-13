/**
 * 사주(Saju) 엔진 — Python → TypeScript 포팅
 * 60갑자 일주/일진 계산 + 오행 상생상극 + 5운 점수 + 종목 오행 추천
 * 참고: https://github.com/gameworkerkim/vibe-investing/AIInvestor/services/saju_engine.py
 */

// ─── 60갑자 Anchor ───
const ANCHOR_DATE = new Date("1900-01-01");
const ANCHOR_STEM = 0;   // 갑(甲)
const ANCHOR_BRANCH = 10; // 술(戌)

const STEMS_KR = ["갑","을","병","정","무","기","경","신","임","계"];
const STEMS_HJ = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES_KR = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
const BRANCHES_HJ = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

// 천간→오행
const STEM_ELEMENT: Record<number, string> = {
    0:"wood",1:"wood",2:"fire",3:"fire",4:"earth",5:"earth",6:"metal",7:"metal",8:"water",9:"water"
};
const STEM_POLARITY: Record<number, string> = {
    0:"yang",1:"yin",2:"yang",3:"yin",4:"yang",5:"yin",6:"yang",7:"yin",8:"yang",9:"yin"
};
const BRANCH_ELEMENT: Record<number, string> = {
    0:"water",1:"earth",2:"wood",3:"wood",4:"earth",5:"fire",6:"fire",7:"earth",8:"metal",9:"metal",10:"earth",11:"water"
};

const ELEMENT_KR: Record<string, string> = {
    wood:"목(木)",fire:"화(火)",earth:"토(土)",metal:"금(金)",water:"수(水)"
};
const ELEMENT_EMOJI: Record<string, string> = {
    wood:"🌳",fire:"🔥",earth:"⛰️",metal:"⚒️",water:"💧"
};

// 상생/상극
const GENERATES: Record<string, string> = { wood:"fire",fire:"earth",earth:"metal",metal:"water",water:"wood" };
const OVERCOMES: Record<string, string> = { wood:"earth",earth:"water",water:"fire",fire:"metal",metal:"wood" };

type Relation = "bi"|"saeng_in"|"saeng_out"|"geuk_in"|"geuk_out";

const RELATION_KR: Record<Relation, string> = {
    bi:"비화(比和)",saeng_in:"인성(印星)",saeng_out:"식상(食傷)",geuk_in:"관성(官星)",geuk_out:"재성(財星)"
};

// 시지
const HOUR_BRANCH = [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0];

// ─── 일주 계산 ───
function dayPillarIndex(d: Date): [number, number] {
    const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const anchorUtc = Date.UTC(1900, 0, 1);
    const delta = Math.floor((utc - anchorUtc) / 86400000);
    return [(ANCHOR_STEM + delta) % 10, (ANCHOR_BRANCH + delta) % 12];
}

export function dayPillar(d: Date, hour?: number): [number, number] {
    if (hour !== undefined && hour >= 23) {
        d = new Date(d.getTime() + 86400000);
    }
    return dayPillarIndex(d);
}

export function hourBranch(hour: number): number {
    return HOUR_BRANCH[hour % 24];
}

// ─── 오행 관계 ───
export function relationBetween(todayEl: string, myEl: string): Relation {
    if (todayEl === myEl) return "bi";
    if (GENERATES[todayEl] === myEl) return "saeng_in";
    if (GENERATES[myEl] === todayEl) return "saeng_out";
    if (OVERCOMES[todayEl] === myEl) return "geuk_in";
    if (OVERCOMES[myEl] === todayEl) return "geuk_out";
    return "bi";
}

// ─── 5운 점수 ───
const BASE_SCORES: Record<string, Record<Relation, number>> = {
    wealth:   { bi:55, saeng_in:60, saeng_out:65, geuk_in:45, geuk_out:80 },
    business: { bi:60, saeng_in:55, saeng_out:80, geuk_in:50, geuk_out:75 },
    study:    { bi:60, saeng_in:85, saeng_out:50, geuk_in:70, geuk_out:50 },
    love:     { bi:55, saeng_in:60, saeng_out:70, geuk_in:50, geuk_out:75 },
    health:   { bi:70, saeng_in:75, saeng_out:55, geuk_in:45, geuk_out:60 },
};

export const FORTUNE_KEYS = ["wealth","business","study","love","health"] as const;
export type FortuneKey = typeof FORTUNE_KEYS[number];

export const FORTUNE_KR: Record<FortuneKey, string> = {
    wealth:"재물운",business:"사업운",study:"학업운",love:"연애운",health:"건강운"
};

export function fortuneScores(
    relation: Relation,
    dayBranchEl: string,
    todayBranchEl: string
): Record<FortuneKey, number> {
    let bonus = 0;
    if (todayBranchEl === dayBranchEl) bonus = 5;
    else if (OVERCOMES[todayBranchEl] === dayBranchEl) bonus = -5;
    else if (OVERCOMES[dayBranchEl] === todayBranchEl) bonus = 3;

    const out: Record<string, number> = {};
    for (const k of FORTUNE_KEYS) {
        out[k] = Math.max(10, Math.min(95, BASE_SCORES[k][relation] + bonus));
    }
    return out as Record<FortuneKey, number>;
}

// ─── 종목 추천 오행 ───
export function favoredElements(myEl: string, relation: Relation): string[] {
    const meGen = Object.entries(GENERATES).find(([,v]) => v === myEl)?.[0] || "";
    const meGenOut = GENERATES[myEl] || "";
    const meOver = OVERCOMES[myEl] || "";
    if (relation === "geuk_out") return [meOver, myEl, meGenOut].filter(Boolean);
    if (relation === "saeng_out") return [myEl, meGenOut, meOver].filter(Boolean);
    if (relation === "saeng_in") return [meGen, myEl, meGenOut].filter(Boolean);
    if (relation === "geuk_in") return [meGen, myEl].filter(Boolean);
    return [myEl, meGenOut, meGen].filter(Boolean);
}

// ─── 프로필 ───
export interface SajuProfile {
    birthDate: string;
    birthHour: number | null;
    dayStemIdx: number;
    dayBranchIdx: number;
    hourBranchIdx: number | null;
    myElement: string;
    dayBranchElement: string;
    polarity: string;
    stemKr: string;
    branchKr: string;
    stemHj: string;
    branchHj: string;
    iljuLabel: string;
}

export function buildProfile(birthDate: string, birthHour: number | null): SajuProfile {
    const d = new Date(birthDate);
    const [stem, branch] = dayPillar(d, birthHour ?? undefined);
    const hb = birthHour !== null ? hourBranch(birthHour) : null;
    return {
        birthDate,
        birthHour,
        dayStemIdx: stem,
        dayBranchIdx: branch,
        hourBranchIdx: hb,
        myElement: STEM_ELEMENT[stem],
        dayBranchElement: BRANCH_ELEMENT[branch],
        polarity: STEM_POLARITY[stem],
        stemKr: STEMS_KR[stem], branchKr: BRANCHES_KR[branch],
        stemHj: STEMS_HJ[stem], branchHj: BRANCHES_HJ[branch],
        iljuLabel: `${STEMS_KR[stem]}${BRANCHES_KR[branch]}(${STEMS_HJ[stem]}${BRANCHES_HJ[branch]})`,
    };
}

// ─── 오늘의 일진 ───
export interface TodaySaju {
    date: string;
    dayStemIdx: number;
    dayBranchIdx: number;
    todayElement: string;
    todayBranchElement: string;
    relation: Relation;
    fortune: Record<FortuneKey, number>;
    favoredElements: string[];
    relationLabel: string;
    iljuLabel: string;
}

export function todayFor(profile: SajuProfile): TodaySaju {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const [stem, branch] = dayPillarIndex(kst);
    const todayEl = STEM_ELEMENT[stem];
    const todayBr = BRANCH_ELEMENT[branch];
    const rel = relationBetween(todayEl, profile.myElement);
    return {
        date: kst.toISOString().slice(0, 10),
        dayStemIdx: stem,
        dayBranchIdx: branch,
        todayElement: todayEl,
        todayBranchElement: todayBr,
        relation: rel,
        fortune: fortuneScores(rel, profile.dayBranchElement, todayBr),
        favoredElements: favoredElements(profile.myElement, rel),
        relationLabel: RELATION_KR[rel],
        iljuLabel: `${STEMS_KR[stem]}${BRANCHES_KR[branch]}(${STEMS_HJ[stem]}${BRANCHES_HJ[branch]})`,
    };
}

// ─── 한글 요약 ───
function grade(score: number) {
    if (score >= 80) return "매우 좋음";
    if (score >= 65) return "좋음";
    if (score >= 50) return "보통";
    if (score >= 35) return "주의";
    return "약함";
}

export function summaryLines(profile: SajuProfile, today: TodaySaju) {
    const meKr = ELEMENT_KR[profile.myElement];
    const todayKr = ELEMENT_KR[today.todayElement];
    const relPhrase: Record<Relation, string> = {
        bi: "동료·경쟁자가 가까운 날",
        saeng_in: "외부의 도움·기회가 흐르는 날",
        saeng_out: "내 에너지를 표현·소비하는 날",
        geuk_in: "압박·시험·검증이 들어오는 날",
        geuk_out: "내가 주도해 결과를 만드는 날",
    };
    const invFocus: Record<Relation, string> = {
        bi: "동종업·시너지 종목으로 분산. 무리한 추격매수는 자제.",
        saeng_in: "안정·블루칩 위주. 정보·연구·교육 섹터에 기회.",
        saeng_out: "표현·미디어·소비재. 단기 모멘텀에 활동 활발.",
        geuk_in: "방어주·필수소비재·헬스케어. 손절선 명확히 둘 것.",
        geuk_out: "성장·재무 강한 기업. 차익 실현 타이밍 좋음.",
    };

    const w = today.fortune;
    return {
        header: `${meKr} 일간 × 오늘 ${todayKr} 일진 → ${today.relationLabel} · ${relPhrase[today.relation]}`,
        wealth: `${w.wealth}점 (${grade(w.wealth)})`,
        business: `${w.business}점 (${grade(w.business)})`,
        study: `${w.study}점 (${grade(w.study)})`,
        love: `${w.love}점 (${grade(w.love)})`,
        health: `${w.health}점 (${grade(w.health)})`,
        caution: cautionBlurb(today.relation),
        investFocus: invFocus[today.relation],
        disclaimer: "※ 본 사주 풀이는 일주 기준 오행 우세와 오늘 일진의 상생·상극만으로 산출한 간이 결과이며, 명리학의 통변이 완벽하지 않습니다. 실제 투자 시 전문가의 도움이 필요합니다.",
    };
}

function cautionBlurb(rel: Relation): string {
    const map: Record<Relation, string> = {
        bi: "비슷한 의견·동종업과의 충돌, 추격매수 자제.",
        saeng_in: "수동적이 되기 쉬움 — 결정 미루지 말 것.",
        saeng_out: "과소비·과활동 주의, 휴식 챙기기.",
        geuk_in: "스트레스성 결정·손절 회피 주의. 손절선 사수.",
        geuk_out: "욕심 과잉 주의 — 차익 실현 타이밍 놓치지 말 것.",
    };
    return map[rel];
}
