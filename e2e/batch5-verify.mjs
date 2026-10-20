// Batch 5 browser check. Needs playwright-core (see browser-test.mjs) and `GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --port 4173`.
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:4173/solitaire/", SH="/workspace/qa-shots/solitaire-batch5";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const R=[]; const ok=(P,n,c,note="")=>{R.push({P,n,pass:!!c,note});console.log(`${c?"PASS":"FAIL"} [${P}] ${n}${note?" — "+note:""}`);};
const VPS={desktop:{viewport:{width:1280,height:800}}, phone:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3}};
async function newPage(P, extra={}, init){ const ctx=await b.newContext({...VPS[P],...extra}); if(init) await ctx.addInitScript(init); const p=await ctx.newPage(); p.errs=[]; p.on("pageerror",e=>p.errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")p.errs.push(m.text());}); return [ctx,p]; }
const lumJs=`(()=>{window.__cr=(el)=>{const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);const [r,g,b]=m.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return 0.2126*r+0.7152*g+0.0722*b;};let bg="rgb(255,255,255)";for(let e=el;e;e=e.parentElement){const c=getComputedStyle(e).backgroundColor;if(c&&c!=="transparent"&&!/,\\s*0\\)$/.test(c)){bg=c;break;}}const L1=lum(getComputedStyle(el).color),L2=lum(bg);return +(((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2));};})()`;
async function winKlondike(p){ await p.evaluate(()=>{const s=structuredClone(window.__solitaire.getState());const all=[...s.tableau.flat(),...s.stock,...s.waste,...s.foundations.flat()];const by=Object.fromEntries(all.map(c=>[c.id,{...c,faceUp:true}]));const suits=["spades","hearts","diamonds","clubs"];s.foundations=suits.map(su=>Array.from({length:su==="spades"?12:13},(_,i)=>by[`${su}-${i+1}`]));s.tableau=Array.from({length:7},()=>[]);s.tableau[0]=[by["spades-13"]];s.stock=[];s.waste=[];s.won=false;s.moves=Math.max(s.moves,41);window.__solitaire.setState(s);}); await p.waitForTimeout(200); const r=await p.evaluate(()=>window.__solitaire.move({zone:"tableau",index:0},{zone:"foundation",index:0})); await p.waitForTimeout(500); return r; }
for (const P of ["desktop","phone"]) {
  // #3, #4 picker, #2 changelog
  let [ctx,p]=await newPage(P); await p.goto(BASE); await p.waitForTimeout(700);
  ok(P,"#3 No dead deals promise on picker", await p.locator('[data-testid="no-dead-deals"]').isVisible(), await p.locator('[data-testid="no-dead-deals"]').textContent());
  ok(P,"daily: Grok's pick card on picker", await p.locator('[data-testid="groks-pick"]').isVisible());
  ok(P,"#4 bedtime mode named on picker (night default)", await p.locator('[data-testid="bedtime-note"]').isVisible());
  ok(P,"#4 theme button names Bedtime mode", (await p.getAttribute("#btn-theme","aria-label")).includes("Bedtime"));
  await p.screenshot({path:`${SH}/${P}-03-04-picker.png`, fullPage:true});
  await p.goto(BASE+"changelog.html"); await p.waitForTimeout(300);
  const cl=await p.textContent("body"); ok(P,"#2 changelog has Made by Grok Bot + real shas", cl.includes("Made by Grok Bot")&&cl.includes("af06660")&&cl.includes("QA: PASS"));
  await p.screenshot({path:`${SH}/${P}-02-changelog.png`});
  ok(P,"no console errors (picker/changelog)", !p.errs.length, p.errs.join("|")); await ctx.close();
  // #4 timer hidden in night, shown in classic; sound off by default
  [ctx,p]=await newPage(P); await p.goto(BASE+"?game=klondike"); await p.waitForTimeout(700);
  ok(P,"#4 night: timer hidden", !(await p.locator("#meter-time").isVisible()));
  ok(P,"#4 sound off by default", (await p.getAttribute("#btn-mute","aria-pressed").catch(()=>null))!=="true", String(await p.getAttribute("#btn-mute","aria-label").catch(()=>"?")));
  // #8 seed hidden + contrast
  await p.evaluate(lumJs);
  ok(P,"#8 footer seed hidden", (await p.textContent("#status-seed")).trim()==="" && !(await p.locator("#status-seed").isVisible()));
  const crN=await p.evaluate(()=>window.__cr(document.getElementById("status-text"))); ok(P,"#8 status contrast night >= 4.5", crN>=4.5, `ratio ${crN}`);
  await p.screenshot({path:`${SH}/${P}-04-08-klondike-night.png`});
  await p.click("#btn-theme"); await p.waitForTimeout(200);
  ok(P,"#4 classic: timer shown", await p.locator("#meter-time").isVisible());
  const crC=await p.evaluate(()=>window.__cr(document.getElementById("status-text"))); ok(P,"#8 status contrast classic >= 4.5", crC>=4.5, `ratio ${crC}`);
  await p.screenshot({path:`${SH}/${P}-04-08-klondike-classic.png`});
  ok(P,"no console errors (klondike)", !p.errs.length, p.errs.join("|")); await ctx.close();
  // #5 shake every rejection: tap + drag, Klondike + FreeCell, normal and reduced motion
  for (const reduce of [false,true]) for (const game of ["klondike","freecell"]) for (const how of ["tap","drag"]) {
    [ctx,p]=await newPage(P,{reducedMotion:reduce?"reduce":"no-preference"}); await p.goto(BASE+`?game=${game}`); await p.waitForTimeout(700);
    const pair=await p.evaluate(()=>{const z=[...document.querySelectorAll('#table .card:not(.face-down)')].filter(c=>/tableau|cascade/.test(c.dataset.zone)).map(c=>({zone:c.dataset.zone,index:c.dataset.index}));const legal=JSON.stringify(window.__solitaire.listMoves());for(const s of z)for(const d of [...document.querySelectorAll('#table [data-drop]')].map(d=>d.dataset.drop)){if(!/tableau|cascade/.test(d)||d===`${s.zone}:${s.index}`)continue;const [dz,di]=d.split(":");if(!legal.includes(`"from":{"zone":"${s.zone}","index":${s.index}`)||true){ if(!legal.includes(`"to":{"zone":"${dz}","index":${di}}`)) return [s,d];}}return null;});
    await p.evaluate(()=>{window.__fx={shake:0,flash:0};new MutationObserver(ms=>{for(const m of ms){const t=m.target;if(t.classList?.contains("shake"))window.__fx.shake++;if(t.classList?.contains("reject-flash"))window.__fx.flash++;}}).observe(document.getElementById("table"),{attributes:true,subtree:true,attributeFilter:["class"]});});
    const src=p.locator(`#table .card[data-zone="${pair[0].zone}"][data-index="${pair[0].index}"]:not(.face-down)`).last(), dst=p.locator(`[data-drop="${pair[1]}"]`).first();
    const sb=await src.boundingBox(), db=await dst.boundingBox(); const tx=db.x+db.width/2, ty=db.y+db.height-4;
    if(how==="tap"){ if(P==="phone"){await src.tap();await p.waitForTimeout(120);await p.touchscreen.tap(tx,ty);}else{await src.click();await p.waitForTimeout(120);await p.mouse.click(tx,ty);} }
    else { const sx=sb.x+sb.width/2, sy=sb.y+Math.min(12,sb.height/2);
      if(P==="phone"){const c=await ctx.newCDPSession(p);await c.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:sx,y:sy}]});for(let k=1;k<=12;k++){await c.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:sx+(tx-sx)*k/12,y:sy+(ty-sy)*k/12}]});await p.waitForTimeout(16);}await c.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}
      else {await p.mouse.move(sx,sy);await p.mouse.down();await p.mouse.move(tx,ty,{steps:12});await p.mouse.up();} }
    await p.waitForTimeout(90);
    if(!reduce&&how==="tap") await p.screenshot({path:`${SH}/${P}-05-shake-${game}.png`});
    if(reduce&&how==="tap") await p.screenshot({path:`${SH}/${P}-05-reduced-flash-${game}.png`});
    const fx=await p.evaluate(()=>window.__fx); const st=await p.textContent("#status-text");
    ok(P,`#5 ${game} ${how} rejected → ${reduce?"outline flash (reduced motion)":"shake"}`, (reduce?fx.flash:fx.shake)>0 && /cannot/.test(st), `${JSON.stringify(pair)} ${JSON.stringify(fx)}`);
    await p.waitForTimeout(500); ok(P,`#5 ${game} ${how} cue cleared after`, await p.evaluate(()=>!document.querySelector("#table .shake, #table .reject-flash")));
    await ctx.close();
  }
  // #6 FreeCell sizing
  [ctx,p]=await newPage(P); await p.goto(BASE+"?game=freecell"); await p.waitForTimeout(800);
  const m=await p.evaluate(()=>{const c=document.querySelector('#table .card');const r=c.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),rank:parseFloat(getComputedStyle(c.querySelector('.corner')).fontSize),peek:document.body.style.getPropertyValue("--fc-peek"),overflow:document.documentElement.scrollWidth>innerWidth};});
  ok(P,"#6 FreeCell rank text >= 12px, no horizontal overflow", m.rank>=12 && !m.overflow, JSON.stringify(m));
  await p.screenshot({path:`${SH}/${P}-06-freecell.png`}); await ctx.close();
  // #7 Kings help
  [ctx,p]=await newPage(P); await p.goto(BASE+"?game=kings"); await p.waitForTimeout(700); await p.click("#btn-help"); await p.waitForTimeout(300);
  const kb=await p.locator('[data-testid="kings-help-short"] li').count(); const open=await p.evaluate(()=>document.querySelector('[data-testid="kings-help-more"]').open);
  ok(P,"#7 King's Corners help: 3 bullets + More (collapsed)", kb===3 && !open);
  await p.screenshot({path:`${SH}/${P}-07-kings-help.png`});
  await p.click('[data-testid="kings-help-more"] summary'); await p.waitForTimeout(200);
  ok(P,"#7 More opens the full rules", await p.locator('text=The deal is won when all 52 cards').isVisible());
  await p.screenshot({path:`${SH}/${P}-07-kings-help-more.png`, fullPage:true});
  ok(P,"no console errors (freecell/kings)", !p.errs.length, p.errs.join("|")); await ctx.close();
  // #1 share card after daily + #9 install prompt with fake beforeinstallprompt
  [ctx,p]=await newPage(P,{permissions:["clipboard-read","clipboard-write"]}); await p.goto(BASE+"?game=klondike&daily=1"); await p.waitForTimeout(700);
  await p.evaluate(()=>{const e=new Event("beforeinstallprompt",{cancelable:true});e.prompt=()=>{window.__prompted=true;};e.userChoice=Promise.resolve({outcome:"dismissed"});window.dispatchEvent(e);});
  await winKlondike(p);
  const share=p.locator('[data-testid="share-card"]'); ok(P,"#1 share card on daily win", await share.isVisible(), await p.textContent('[data-testid="share-text"]').catch(()=>""));
  const url=await p.getAttribute('[data-testid="share-btn"]',"data-url"); ok(P,"#1 share link has seed + draw", /game=klondike&seed=\d+&draw=[13]/.test(url), url);
  await p.screenshot({path:`${SH}/${P}-01-share-card.png`});
  const hasShare=await p.evaluate(()=>!!navigator.share);
  if(!hasShare){ await p.click('[data-testid="share-btn"]'); await p.waitForTimeout(300); const clip=await p.evaluate(()=>navigator.clipboard.readText()); ok(P,"#1 clipboard fallback copies text + link", clip.includes(url)&&clip.includes("moves"), await p.textContent('[data-testid="share-note"]')); }
  else ok(P,"#1 Web Share API present (not invoked headless)", true);
  // same-deal link reproduces the board
  const seedState=await p.evaluate(()=>window.__solitaire.getState().seed);
  // close win -> install hint
  await p.locator('[data-testid="win-modal"] [data-act="again"]').click().catch(()=>{}); await p.waitForTimeout(500);
  const ih=await p.locator('[data-testid="install-hint"]').isVisible(); ok(P,"#9 install prompt shows after win when beforeinstallprompt fired", ih);
  await p.screenshot({path:`${SH}/${P}-09-install-hint.png`});
  if(ih){ await p.click('[data-testid="install-dismiss"]'); await p.waitForTimeout(200); }
  ok(P,"#9 dismissed and remembered", (await p.evaluate(()=>JSON.parse(localStorage.getItem("grok-solitaire:prefs")).installHint))==="dismissed");
  ok(P,"no console errors (daily win)", !p.errs.length, p.errs.join("|"));
  const [c2,p2]=[ctx, await ctx.newPage()]; await p2.goto(url.replace("https://radls.github.io/solitaire/",BASE)); await p2.waitForTimeout(700);
  ok(P,"#1 shared link opens same deal", (await p2.evaluate(()=>window.__solitaire.getState().seed))===seedState);
  await ctx.close();
  // #9 no beforeinstallprompt -> never shows
  [ctx,p]=await newPage(P); await p.goto(BASE+"?game=klondike"); await p.waitForTimeout(600); await winKlondike(p);
  await p.locator('[data-testid="win-modal"] [data-act="again"]').click().catch(()=>{}); await p.waitForTimeout(500);
  ok(P,"#9 no install prompt without beforeinstallprompt", !(await p.locator('[data-testid="install-hint"]').isVisible())); await ctx.close();
}
// ---- be8b44d QA fixes ----
const IOS_UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const AF=process.env.AF_BASE||"http://127.0.0.1:4174/solitaire/";
const fakeBip=(p)=>p.evaluate(()=>{const e=new Event("beforeinstallprompt",{cancelable:true});e.prompt=()=>{};e.userChoice=Promise.resolve({outcome:"dismissed"});window.dispatchEvent(e);});
async function winAndClose(p){ await winKlondike(p); await p.locator('[data-testid="win-modal"] [data-act="again"]').click().catch(()=>{}); await p.waitForTimeout(500); }
for (const P of ["desktop","phone"]) {
  // W1: shown once, reload, win again -> no prompt
  let [ctx,p]=await newPage(P); await p.goto(BASE+"?game=klondike"); await p.waitForTimeout(600); await fakeBip(p); await winAndClose(p);
  ok(P,"W1 prompt shows on first win", await p.locator('[data-testid="install-hint"]').isVisible());
  await p.reload(); await p.waitForTimeout(700); await fakeBip(p); await winAndClose(p);
  ok(P,"W1 after reload + second win: no prompt", !(await p.locator('[data-testid="install-hint"]').isVisible()), JSON.stringify(await p.evaluate(()=>JSON.parse(localStorage.getItem("grok-solitaire:prefs")).installHint)));
  await ctx.close();
  // W2: iOS Safari UA, no beforeinstallprompt: compare with af06660
  const ios={};
  for (const [tag,base] of [["af06660",AF],["new",BASE]]) {
    [ctx,p]=await newPage(P,{userAgent:IOS_UA}); await p.goto(base+"?game=klondike"); await p.waitForTimeout(600); await winAndClose(p);
    const vis=await p.locator('[data-testid="install-hint"]').isVisible();
    ios[tag]={vis, share: vis?(await p.textContent("#install-share")).trim():"", go: await p.locator("#install-go").isVisible()};
    if(tag==="new"){ await p.screenshot({path:`${SH}/${P}-09-ios-hint.png`});
      if(vis){ await p.click('[data-testid="install-dismiss"]'); await p.waitForTimeout(200); }
      ok(P,"W2 iOS hint dismissible", !(await p.locator('[data-testid="install-hint"]').isVisible()));
      await p.reload(); await p.waitForTimeout(700); await winAndClose(p);
      ok(P,"W2 iOS hint not again after dismiss + reload", !(await p.locator('[data-testid="install-hint"]').isVisible())); }
    await ctx.close();
  }
  ok(P,"W2 iOS no-event hint matches af06660 (text shown, Install hidden)", ios.new.vis && ios.new.share==="Tap Share, then Add to Home Screen." && !ios.new.go && JSON.stringify(ios.new)===JSON.stringify(ios.af06660), JSON.stringify(ios));
  // non-iOS, no event -> still nothing
  [ctx,p]=await newPage(P); await p.goto(BASE+"?game=klondike"); await p.waitForTimeout(600); await winAndClose(p);
  ok(P,"W2 non-iOS without event: no hint", !(await p.locator('[data-testid="install-hint"]').isVisible())); await ctx.close();
  // nit: bad deal link
  [ctx,p]=await newPage(P); await p.goto(BASE+"?game=freecell&deal=abc"); await p.waitForTimeout(700);
  ok(P,"nit bad deal link shows note", (await p.textContent("#status-text")).includes("Link deal not found"));
  await p.goto(BASE+"?game=freecell&deal=617"); await p.waitForTimeout(700);
  ok(P,"good deal link opens deal 617, no note", (await p.evaluate(()=>window.__solitaire.getState().dealNumber))===617 && !(await p.textContent("#status-text")).includes("not found"));
  ok(P,"no console errors (fix checks)", !p.errs.length, p.errs.join("|")); await ctx.close();
}
const f=R.filter(r=>!r.pass); console.log(`\n${R.length-f.length}/${R.length} pass`); 
(await import("node:fs")).writeFileSync(`${SH}/results.json`,JSON.stringify(R,null,1));
await b.close(); process.exit(f.length?1:0);
