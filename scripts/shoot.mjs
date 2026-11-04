// Screenshots of the running site for visual review (Playwright, Chromium):
//   node scripts/shoot.mjs [url] [--w 1440] [--h 900] [--scheme light|dark] [--reduced] [--out dir]
// Walks the whole page first so scroll-triggered reveals run, then captures the hero viewport and
// every top-level section. Writes report.json with horizontal overflow and page errors.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("http")) || "http://localhost:5200/";
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const W = Number(opt("w", 1440));
const H = Number(opt("h", 900));
const scheme = opt("scheme", "dark");
const reduced = args.includes("--reduced");
const out = path.resolve(opt("out", `.checks/shots-${W}-${scheme}${reduced ? "-reduced" : ""}`));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(out, "00-hero.png") });

const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += Math.round(H * 0.5)) {
  await page.mouse.wheel(0, Math.round(H * 0.5));
  await page.waitForTimeout(220);
}
await page.waitForTimeout(1500);

const ids = await page.evaluate(() =>
  [...document.querySelectorAll("main > section, main > .marquee, footer")].map((s) => s.id || s.className.split(" ")[0]),
);
let n = 1;
for (const id of ids) {
  if (id === "start") continue;
  const loc = id === "foot" || id === "marquee" ? page.locator(`.${id}`).first() : page.locator(`#${id}`);
  try {
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await loc.screenshot({ path: path.join(out, `${String(n++).padStart(2, "0")}-${id}.png`) });
  } catch (e) {
    errors.push(`shot ${id}: ${e.message.split("\n")[0]}`);
  }
}

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ url, W, H, scheme, reduced, overflow, errors }, null, 2));
console.log(JSON.stringify({ out, overflow, errors }, null, 2));
await browser.close();
