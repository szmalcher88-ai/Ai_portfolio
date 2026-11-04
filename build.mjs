// Builds site/ from src/: bundles the script, minifies the styles, copies fonts, inlines
// Phosphor icons into the HTML ({{icon:name}} or {{icon:name:fill|bold}}) and makes the patched
// animation copies (demos.mjs). Images and the HR reel are made separately (see README.md).
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { buildDemos } from "./demos.mjs";

const OUT = "site";
const NM = "node_modules";
mkdirSync(`${OUT}/assets/fonts`, { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2020",
  outfile: `${OUT}/assets/app.js`,
  legalComments: "none",
});

const css = await esbuild.transform(readFileSync("src/styles.css", "utf8"), { loader: "css", minify: true, target: ["chrome111", "safari16.4", "firefox115"] });
writeFileSync(`${OUT}/assets/app.css`, css.code);
const demoCss = await esbuild.transform(readFileSync("src/demo.css", "utf8"), { loader: "css", minify: true });
mkdirSync(`${OUT}/demo`, { recursive: true });
writeFileSync(`${OUT}/demo/demo.css`, demoCss.code);

const fonts = {
  "mona-sans-latin.woff2": "@fontsource-variable/mona-sans/files/mona-sans-latin-standard-normal.woff2",
  "mona-sans-latin-ext.woff2": "@fontsource-variable/mona-sans/files/mona-sans-latin-ext-standard-normal.woff2",
  // small type from Portfolio 1
  "geist-latin.woff2": "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  "geist-latin-ext.woff2": "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2",
  "geist-mono-latin.woff2": "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
  "geist-mono-latin-ext.woff2": "@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2",
  // Inter and JetBrains Mono stay only inside the animation copies: they are the fonts of the recreated app screens
  "jetbrains-mono-latin.woff2": "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  "jetbrains-mono-latin-ext.woff2": "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2",
  "inter-latin.woff2": "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  "inter-latin-ext.woff2": "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2",
};
for (const [to, from] of Object.entries(fonts)) copyFileSync(`${NM}/${from}`, `${OUT}/assets/fonts/${to}`);

const icon = (name, weight = "regular") => {
  const file = weight === "regular" ? name : `${name}-${weight}`;
  return readFileSync(`${NM}/@phosphor-icons/core/assets/${weight}/${file}.svg`, "utf8")
    .trim()
    .replace("<svg ", '<svg class="i" aria-hidden="true" focusable="false" ');
};
const html = readFileSync("src/index.html", "utf8").replace(/\{\{icon:([a-z-]+)(?::([a-z]+))?\}\}/g, (_, n, w) => icon(n, w));
writeFileSync(`${OUT}/index.html`, html);

for (const f of ["favicon.svg", "_headers"]) copyFileSync(`src/${f}`, `${OUT}/${f}`);
buildDemos(OUT);
console.log("built", OUT);
