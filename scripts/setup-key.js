#!/usr/bin/env node
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");

console.log("");
console.log("  ╔══════════════════════════════════════════╗");
console.log("  ║   CASSANDRA AI — API Key Setup           ║");
console.log("  ╚══════════════════════════════════════════╝");
console.log("");
console.log("  OpenDART API 키를 발급받지 않았다면:");
console.log("  https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do");
console.log("");
console.log("  개인회원: 신청 즉시 이메일로 40자리 키 발급");
console.log("  기업회원: 1~2영업일 소요 (공시목록 한도 무제한)");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("  OpenDART API Key 입력 (40자리): ", (key) => {
  key = key.trim();

  if (!key || key.length !== 40) {
    console.log("");
    console.log("  ❌ 40자리 키를 정확히 입력하세요.");
    console.log(`     입력된 길이: ${key.length}자`);
    rl.close();
    process.exit(1);
  }

  let env = "";
  try {
    env = fs.readFileSync(ENV_PATH, "utf-8");
  } catch (e) {
    // .env.example 기반 새 파일 생성
    const examplePath = path.join(__dirname, "..", ".env.example");
    try {
      env = fs.readFileSync(examplePath, "utf-8");
    } catch (_) {
      env = "";
    }
  }

  if (env.includes("DART_API_KEY=")) {
    env = env.replace(/DART_API_KEY=.*/m, `DART_API_KEY=${key}`);
  } else {
    env = env.trimEnd() + `\nDART_API_KEY=${key}\n`;
  }

  fs.writeFileSync(ENV_PATH, env);
  console.log("");
  console.log(`  ✅ .env 저장 완료: DART_API_KEY=${"*".repeat(36)}${key.slice(-4)}`);
  console.log("");
  console.log("  다음 명령어로 실행:");
  console.log("    npm run dev");
  console.log("");
  rl.close();
});
