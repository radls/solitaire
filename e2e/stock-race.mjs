// Tap the stock while a slide is in flight (deal slide right after load, then a previous draw); expect the tap to draw.
import { chromium } from "playwright-core";
let b;
try {
  b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const G = process.env.GAME || "kings"; const N = Number(process.env.N || 20); let bad = 0;
  for (let k = 0; k < N; k++) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:4173/solitaire/?game=${G}`); await page.waitForTimeout(400);
    const stock = page.locator("[data-drop='stock']");
    await stock.click(); await page.waitForTimeout(800);            // first draw, let it settle
    const h0 = await page.evaluate(() => window.__solitaire.historyLength());
    await stock.click(); await page.waitForTimeout(20 + (k % 5) * 20); // second draw starts a slide
    const sl = await page.evaluate(() => document.querySelectorAll(".card-slide").length);
    await stock.click(); await page.waitForTimeout(900);            // tap during that slide
    const h1 = await page.evaluate(() => window.__solitaire.historyLength());
    if (h1 !== h0 + 2) { bad++; console.log(k, { h0, h1, sl }); }
    await ctx.close();
  }
  console.log(G, "lost", bad, "/", N);
  await b.close();
  b = null;
  if (bad) process.exit(1);
} catch (err) {
  console.error(err);
  if (b) await b.close().catch(() => {});
  process.exit(2);
}
