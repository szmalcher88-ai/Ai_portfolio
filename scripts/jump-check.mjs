// Checks the scope links: each click must scroll to its project's player and start the asked chapter.
//   node scripts/jump-check.mjs [url]
import { chromium } from "playwright";

const url = process.argv.find((a) => a.startsWith("http")) || "http://localhost:5200/";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);

const links = await page.$$eval("[data-jump]", (as) => as.map((a, i) => ({ i, to: a.dataset.jump, ch: +a.dataset.ch, text: a.querySelector(".jump-t").textContent })));
const results = [];
// first link of each project from a cold start, then the rest (warm iframe)
for (const l of links) {
  await page.locator("#zakres").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.locator("[data-jump]").nth(l.i).click();
  await page.waitForTimeout(l.to === "hr" ? 3500 : 4500);
  const got = await page.evaluate((id) => {
    const fig = document.querySelector(`#${id} [data-player]`);
    const r = fig.getBoundingClientRect();
    const cur = fig.querySelector('.seg[aria-current="step"]');
    const playing = [...document.querySelectorAll("[data-player]")].filter((p) => p.classList.contains("is-playing")).map((p) => p.closest(".case").id);
    return { num: fig.querySelector(".pl-num").textContent, kicker: fig.querySelector(".pl-kicker").textContent, seg: cur ? +cur.dataset.i : null, inView: r.top < innerHeight && r.bottom > 0, playing, hash: location.hash };
  }, l.to);
  results.push({ link: `${l.to}#${l.ch} ${l.text}`, ok: got.seg === l.ch && got.inView && got.playing.join() === l.to, ...got });
}
console.table(results.map((r) => ({ ok: r.ok, link: r.link.slice(0, 60), num: r.num, kicker: r.kicker, playing: r.playing.join() })));
console.log(JSON.stringify({ failed: results.filter((r) => !r.ok).length, errors }));
await browser.close();
