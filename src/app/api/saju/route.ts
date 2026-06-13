/**
 * 사주 API — 생년월일시 입력 → 일주·오늘의 운세·종목 추천
 * POST: 사주 계산
 * GET: 캐시된 결과
 */
import { NextRequest, NextResponse } from "next/server";
import { buildProfile, todayFor, summaryLines, FORTUNE_KEYS, FORTUNE_KR } from "@/lib/saju-engine";

export async function POST(req: NextRequest) {
    try {
        const { birthDate, birthHour, gender, nickname } = await req.json();

        if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
            return NextResponse.json({ error: "생년월일을 YYYY-MM-DD 형식으로 입력해주세요." }, { status: 400 });
        }

        const hour = birthHour != null ? Number(birthHour) : null;
        if (hour !== null && (hour < 0 || hour > 23)) {
            return NextResponse.json({ error: "태어난 시간은 0-23 사이로 입력해주세요." }, { status: 400 });
        }

        const profile = buildProfile(birthDate, hour);
        const today = todayFor(profile);
        const summary = summaryLines(profile, today);

        return NextResponse.json({
            profile: {
                birthDate: profile.birthDate,
                birthHour: profile.birthHour,
                ilju: profile.iljuLabel,
                element: profile.myElement,
                elementKr: ({
                    wood:"목(木)",fire:"화(火)",earth:"토(土)",metal:"금(金)",water:"수(水)"
                } as Record<string,string>)[profile.myElement],
                polarity: profile.polarity === "yang" ? "양" : "음",
                dayBranch: profile.branchKr,
            },
            today: {
                date: today.date,
                ilju: today.iljuLabel,
                relation: today.relationLabel,
            },
            fortune: Object.fromEntries(
                FORTUNE_KEYS.map(k => [FORTUNE_KR[k], today.fortune[k]])
            ),
            summary,
            nickname: nickname || "",
        });
    } catch {
        return NextResponse.json({ error: "사주 계산 중 오류가 발생했습니다." }, { status: 500 });
    }
}
