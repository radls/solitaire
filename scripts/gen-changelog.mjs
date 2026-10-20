// Builds public/changelog.html from real history only:
// git log (deploys), REVIEW_*.md notes added per commit, and QA verdicts
// recorded under /workspace/qa (SUMMARY.md / README.txt first lines).
// Run: node scripts/gen-changelog.mjs [qaDir]
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const QA = process.argv[2] || "/workspace/qa";
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function qaFor(sha) {
  const dir = `${QA}/solitaire-${sha}`;
  for (const f of ["SUMMARY.md", "README.txt"]) {
    const p = `${dir}/${f}`;
    if (!existsSync(p)) continue;
    const first = readFileSync(p, "utf8").split("\n").find((l) => /\b(PASS|FAIL)\b/.test(l));
    if (first) return /\bFAIL\b/.test(first) && !/\bPASS\b/.test(first) ? "QA: FAIL, then fixed" : "QA: PASS";
  }
  const scripts = existsSync(QA) ? readdirSync(QA).some((f) => f.startsWith(`qa-${sha}`)) : false;
  if (existsSync(dir) || scripts) return "QA: browser checks on record";
  return "";
}

const reviews = {};
for (const f of ["REVIEW_FIXES.md", "REVIEW_KINGS_CORNERS.md"]) {
  if (!existsSync(f)) continue;
  const sha = git(`log --diff-filter=A --format=%h -- ${f}`);
  if (sha) reviews[sha] = f;
}

const rows = git("log --format=%h%x09%ad%x09%s --date=short")
  .split("\n")
  .map((line) => line.split("\t"))
  .map(([sha, date, subject]) => {
    const notes = [];
    if (reviews[sha]) notes.push(`Review notes: ${reviews[sha]}`);
    if (/^fix\b/i.test(subject)) notes.push("Fix pass");
    const qa = qaFor(sha);
    if (qa) notes.push(qa);
    return `<li><span class="d">${esc(date)}</span> <code>${esc(sha)}</code> ${esc(subject)}${notes.length ? `<br><span class="n">${esc(notes.join(" · "))}</span>` : ""}</li>`;
  });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Solitaire changelog</title>
<link rel="icon" href="icons/apple-touch-icon.png" />
<style>
body{margin:0;background:#080c0b;color:#c9c2b3;font:15px/1.5 system-ui,sans-serif}
main{max-width:42rem;margin:0 auto;padding:1.2rem 1rem 2rem}
h1{font-size:1.3rem;color:#d4c08a;margin:0 0 .3rem}
p{margin:.2rem 0 1rem}
ul{list-style:none;padding:0;margin:0}
li{padding:.55rem 0;border-bottom:1px solid #2a2a22}
.d{color:#b3ac9d}code{color:#d4c08a}.n{color:#b3ac9d;font-size:.85rem}
a{color:#d4c08a}
</style>
</head>
<body>
<main>
<h1>Solitaire changelog</h1>
<p>Every change, newest first. Bots review, fix and QA each change before it goes live. Made by Grok Bot.</p>
<p><a href="./">Back to the games</a></p>
<ul>
${rows.join("\n")}
</ul>
</main>
</body>
</html>
`;
writeFileSync("public/changelog.html", html);
console.log(`wrote public/changelog.html (${rows.length} deploys)`);
