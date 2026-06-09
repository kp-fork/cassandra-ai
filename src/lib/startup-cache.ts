/**
 * 서버 시작 시 Dart_Data + 지식베이스 로드
 * Redis 캐시 연동 (Upstash)
 */
import fs from "fs";
import path from "path";
import { setCache } from "./redis-cache";

const DATA_DIR = path.join(process.cwd(), "Dart_Data");
const KNOWLEDGE_DIR = path.join(process.cwd(), "data");

let personsWiki: any = null;
let dartKnowledge: any = null;

export function loadDartData() {
  try {
    const wikiPath = path.join(DATA_DIR, "persons-wiki.json");
    if (fs.existsSync(wikiPath)) {
      personsWiki = JSON.parse(fs.readFileSync(wikiPath, "utf-8"));
      console.log(`[Startup] persons-wiki.json 로드: ${personsWiki.persons?.length || 0}명`);
    }

    const kbPath = path.join(KNOWLEDGE_DIR, "knowledge-base.json");
    if (fs.existsSync(kbPath)) {
      dartKnowledge = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
    }

    // Redis 캐시 웜업
    if (personsWiki) {
      setCache("dart:persons-wiki", personsWiki).catch(() => {});
    }
  } catch (e) {
    console.error("[Startup] 데이터 로드 실패:", e);
  }
}

export function getPersonsWiki() {
  return personsWiki;
}

export function getDartKnowledge() {
  return dartKnowledge;
}

export function searchPersons(query: string) {
  if (!personsWiki?.persons) return [];
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  return personsWiki.persons.filter((p: any) =>
    tokens.some((t) => p.name.includes(t) || p.companies?.some((c: string) => c.includes(t)))
  );
}
