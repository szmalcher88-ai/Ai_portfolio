// Builds site/ from src/ and public/: bundles the script, minifies the styles, copies the fonts and
// inlines Phosphor icons into the HTML ({{icon:name}} or {{icon:name:fill|bold}}).
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from "node:fs";

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

// Mona Sans (large type, with the width axis) from Portfolio 4; Geist and Geist Mono from Portfolio 1
const fonts = {
  "mona-sans-latin.woff2": "mona-sans/files/mona-sans-latin-standard-normal.woff2",
  "mona-sans-latin-ext.woff2": "mona-sans/files/mona-sans-latin-ext-standard-normal.woff2",
  "geist-latin.woff2": "geist/files/geist-latin-wght-normal.woff2",
  "geist-latin-ext.woff2": "geist/files/geist-latin-ext-wght-normal.woff2",
  "geist-mono-latin.woff2": "geist-mono/files/geist-mono-latin-wght-normal.woff2",
  "geist-mono-latin-ext.woff2": "geist-mono/files/geist-mono-latin-ext-wght-normal.woff2",
};
for (const [to, from] of Object.entries(fonts)) copyFileSync(`${NM}/@fontsource-variable/${from}`, `${OUT}/assets/fonts/${to}`);

const icon = (name, weight = "regular") => {
  const file = weight === "regular" ? name : `${name}-${weight}`;
  return readFileSync(`${NM}/@phosphor-icons/core/assets/${weight}/${file}.svg`, "utf8")
    .trim()
    .replace("<svg ", '<svg class="i" aria-hidden="true" focusable="false" ');
};
const html = readFileSync("src/index.html", "utf8").replace(/\{\{icon:([a-z-]+)(?::([a-z]+))?\}\}/g, (_, n, w) => icon(n, w));
writeFileSync(`${OUT}/index.html`, html);

for (const f of ["favicon.svg", "_headers"]) copyFileSync(`src/${f}`, `${OUT}/${f}`);
// Screenshots and the HR recording (from Portfolio 4) are copied as they are
cpSync("public", OUT, { recursive: true });
console.log("built", OUT);
