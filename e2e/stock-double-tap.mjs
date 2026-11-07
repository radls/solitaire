// Tap the stock twice, the 2nd tap d ms after the 1st (while the 1st draw's card slides out of the stock).
// Expect two draws: historyLength +2. Usage: GAMES=kings,golf,klondike N=... node stock-double-tap.mjs
import { chromium } from "playwright-core";
let b;
try {
  b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const games = (process.env.GAMES || "kings,golf,klondike").split(",");
  const delays = [0, 20, 40, 60, 80, 100, 150];
  const rounds = Number(process.env.N || 3);
  const phone = process.env.VP === "phone";
  const vp = phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } };
  let lostTotal = 0;
  for (const g of games) {
    const lost = []; let n = 0;
    for (let r = 0; r < rounds; r++) for (const d of delays) {
      const ctx = await b.newContext(vp); const p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:4173/solitaire/?game=${g}&seed=${1234 + r}`); await p.waitForTimeout(900);
      const h0 = await p.evaluate(() => window.__solitaire.historyLength());
      const box = await p.locator("[data-drop='stock']").boundingBox();
      if (!box) throw new Error(`stock bounding box missing for ${g}`);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const tap = () => (phone ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
      await tap(); if (d) await p.waitForTimeout(d); await tap();
      await p.waitForTimeout(700);
      const h1 = await p.evaluate(() => window.__solitaire.historyLength());
      n++; if (h1 - h0 !== 2) lost.push(`${d}ms:+${h1 - h0}`);
      await ctx.close();
    }
    console.log(g, `lost ${lost.length}/${n}`, lost.join(" "));
    lostTotal += lost.length;
  }
  await b.close();
  b = null;
  if (lostTotal) process.exit(1);
} catch (err) {
  console.error(err);
  if (b) await b.close().catch(() => {});
  process.exit(2);
}
