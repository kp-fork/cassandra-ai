#!/usr/bin/env node
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  console.log("");
  console.log("  ╔══════════════════════════════════╗");
  console.log("  ║  Neon DB 비밀번호 업데이트       ║");
  console.log("  ╚══════════════════════════════════╝");
  console.log("");

  const newUrl = await ask("  새 Neon 연결 문자열: ");
  if (!newUrl.trim() || !newUrl.includes("postgresql://")) {
    console.log("  ❌ 올바른 PostgreSQL 연결 문자열이 아닙니다");
    rl.close(); return;
  }

  // .env 업데이트
  const envPath = path.join(__dirname, "..", ".env");
  let env = "";
  try { env = fs.readFileSync(envPath, "utf-8"); } catch {}
  env = env.replace(/DATABASE_URL=.*/, "");
  env = env.trim() + "\nDATABASE_URL=" + newUrl.trim() + "\n";
  fs.writeFileSync(envPath, env);
  console.log("  ✅ .env 업데이트 완료");

  // Vercel Variable 업데이트
  try {
    execSync(`echo "${newUrl.trim()}" | npx vercel env add DATABASE_URL production --force`, {
      stdio: "pipe", shell: "/bin/zsh",
    });
    console.log("  ✅ Vercel DATABASE_URL 업데이트 완료");
  } catch {
    console.log("  ⚠️ Vercel CLI 오류 → Dashboard에서 직접 추가:");
    console.log("     https://vercel.com → dart-monitor → Settings → Environment Variables");
  }

  console.log("");
  console.log("  🔄 Vercel 재배포:");
  console.log("     npx vercel deploy --prod");
  console.log("");
  rl.close();
})();
