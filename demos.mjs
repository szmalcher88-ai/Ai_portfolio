// Copies the two "day in the life" animations from their repositories into site/demo/ and
// patches the copies. The originals are only read. Every patch must match exactly once, so a
// change in a source file stops the build instead of producing a half-patched copy.
//
// What the copies get on top of the originals:
//   - Inter from ../../assets/fonts instead of Google Fonts (one shared demo.css)
//   - a camera that follows the cursor: zoom in on what is clicked or typed, out while reading
//   - a short fade when the app switches screens
//   - default tempo 1.5x
//   - #N in the address starts at chapter N, and a link back to the portfolio
//   - ?embed: only the stage is shown and the portfolio page drives it through postMessage
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const SOURCES = {
  erp: "C:/Users/SzMal/ERP_invoice_AI/docs/day-in-the-life/dzien-pracy.html",
  ksiegowanie: "C:/Users/SzMal/Automatyzacja_ksiegowanie/docs/prezentacja/animacja/dzien-ledgerpilot.html",
  // HR System: the animation made for Portfolio 7 (it has its own camera in embed-bridge.js)
  hr: "C:/Users/SzMal/Portfolio 7/lines/hr.html",
  hrBridge: "C:/Users/SzMal/Portfolio 7/lines/embed-bridge.js",
};

// LedgerPilot chapter lengths in animation milliseconds (measured with ?measure, see README).
// The original learns them while playing; the portfolio progress bar needs them up front.
const LP_EST = [12640, 14069, 14935, 12129, 11405, 21643, 17043, 26680, 14367];

function patch(src, find, replace, label) {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1 match, found ${n}`);
  return src.replace(find, () => replace);
}

const HEAD = `<link rel="stylesheet" href="../demo.css">
<script>if (/[?&]embed\\b/.test(location.search)) document.documentElement.classList.add("embed");</script>
`;

// Shared camera. REDUCED, SPEED and BOX are the names used by each engine.
const camera = ({ REDUCED, SPEED, BOX }) => `
  // Portfolio copy: a camera that follows the cursor. From the wide shot it zooms in only once the
  // cursor has landed and the screen has stayed put for 0.65 s, so a click that opens another screen
  // does not zoom. While zoomed it pans with the cursor's own curve and duration, never further than
  // the cursor moves (so the cursor cannot slide backwards), and it zooms out only in a real reading
  // pause. Timing is in real time.
  const cam = document.getElementById("cam");
  const CAM = { z: 1, x: 0, y: 0, idle: 0, held: 0, wait: -1, sx: 0, sy: 0 };
  const CAM_EASE = "cubic-bezier(.65,0,.35,1)";
  function camSet(z, x, y, ms, ease) {
    if (${REDUCED}) return;
    CAM.z = z; CAM.x = x; CAM.y = y;
    cam.style.transition = ms ? \`transform \${Math.round(ms)}ms \${ease}\` : "none";
    cam.style.transform = z === 1 ? "" : \`translate(\${x.toFixed(1)}px, \${y.toFixed(1)}px) scale(\${z})\`;
  }
  function camAim(sx, sy) {
    const bw = ${BOX}.clientWidth, bh = ${BOX}.clientHeight, z = bw < 720 ? 1.6 : 1.25;
    const px = sx * scale, py = sy * scale;
    return [z, Math.min(0, Math.max(bw - bw * z, bw / 2 - px * z)), Math.min(0, Math.max(bh - bh * z, bh / 2 - py * z))];
  }
  // sx, sy: target in stage pixels; ms, ease: the real duration and curve of the cursor move.
  // Called before the engine updates cx, cy, so those are still where the cursor starts.
  function camFocus(sx, sy, ms, ease) {
    CAM.idle = 0;
    if (CAM.z === 1) { CAM.sx = sx; CAM.sy = sy; CAM.wait = ms + 650; return; }
    const bw = ${BOX}.clientWidth, bh = ${BOX}.clientHeight, k = scale * CAM.z;
    const vx = sx * k + CAM.x, vy = sy * k + CAM.y;
    if (vx > bw * 0.15 && vx < bw * 0.85 && vy > bh * 0.15 && vy < bh * 0.85) return;
    // pan only as far as needed to bring the target back to 22% from the edge it crossed
    let dx = 0, dy = 0;
    if (vx < bw * 0.15) dx = bw * 0.22 - vx; else if (vx > bw * 0.85) dx = bw * 0.78 - vx;
    if (vy < bh * 0.15) dy = bh * 0.22 - vy; else if (vy > bh * 0.85) dy = bh * 0.78 - vy;
    const x = Math.min(0, Math.max(bw - bw * CAM.z, CAM.x + dx)), y = Math.min(0, Math.max(bh - bh * CAM.z, CAM.y + dy));
    // a pan longer than the cursor's own move would drag the cursor backwards on screen
    const pan = Math.hypot(x - CAM.x, y - CAM.y), move = Math.hypot((sx - cx) * k, (sy - cy) * k);
    const inFrame = vx > bw * 0.04 && vx < bw * 0.96 && vy > bh * 0.04 && vy < bh * 0.96;
    if (pan <= move * 0.6) camSet(CAM.z, x, y, Math.max(ms, 450), ease);
    else if (!inFrame) camSet(1, 0, 0, Math.max(ms, 450), ease);
  }
  function camOut() { if (CAM.z !== 1) camSet(1, 0, 0, 1000, CAM_EASE); CAM.idle = 0; }
  // keep the zoom while something is being read or typed (ms in animation time)
  function camHold(ms = 0) { CAM.idle = Math.min(CAM.idle, -ms / ${SPEED}); }
  // dt in real ms: zoom in after the cursor rests; out after 2.6 s without action, never sooner than 2.5 s after zooming in
  function camTick(dt) {
    if (CAM.wait >= 0) {
      CAM.wait -= dt;
      if (CAM.wait < 0) { const [z, x, y] = camAim(CAM.sx, CAM.sy); CAM.held = 0; CAM.idle = Math.min(CAM.idle, 0); camSet(z, x, y, 900, CAM_EASE); }
      return;
    }
    if (CAM.z === 1) return;
    CAM.idle += dt; CAM.held += dt;
    if (CAM.idle > 2600 && CAM.held > 2500) camOut();
  }
  function camReset() { camSet(1, 0, 0, 0); CAM.idle = 0; CAM.held = 0; CAM.wait = -1; }
  // While paused, waits sleep here instead of polling requestAnimationFrame every frame
  let pfWaiting = [];
  function pfIdle(cb) { return new Promise((r) => pfWaiting.push(() => { r(); if (cb) cb(); })); }
  function pfWake() { const w = pfWaiting; pfWaiting = []; w.forEach((f) => requestAnimationFrame(f)); }
  // Screen change: the camera goes back to the wide shot and only the content area fades in (not the
  // sidebar). If it was zoomed in, a copy of the old zoomed frame dissolves on top, so the cut reads as
  // a dissolve rather than a jump. Must run before the new screen is rendered.
  // The apps re-render often, so the fade is re-applied to new elements with the time already elapsed.
  let pfFadeAt = -1e9;
  function screenIn() {
    // the frame as it is on screen right now: a zoom may have only just started, or a zoom-out may
    // still be running (CAM.z is then already 1), so only the computed scale decides
    const now = ${REDUCED} ? "none" : getComputedStyle(cam).transform;
    if (now !== "none" && new DOMMatrix(now).a > 1.02) {
      const ghost = cam.cloneNode(true);
      ghost.querySelectorAll("#cursor, #ripple, .ripple").forEach((e) => e.remove());
      ghost.style.pointerEvents = "none";
      ghost.style.transition = "none";
      ghost.style.transform = now;
      cam.after(ghost);
      const from = cam.querySelectorAll("*"), to = ghost.querySelectorAll("*");
      from.forEach((e, i) => { if (e.scrollTop && to[i]) to[i].scrollTop = e.scrollTop; });
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "cubic-bezier(.4,0,.2,1)" }).finished.then(() => ghost.remove());
    }
    camReset();
    pfFadeAt = performance.now();
  }
  function pfFade(el) {
    const t = performance.now() - pfFadeAt;
    if (!el || ${REDUCED} || t > 250) return;
    el.style.animation = \`pf-in 240ms cubic-bezier(.2,.7,.2,1) \${-Math.round(t)}ms both\`;
  }
`;

// Bridge: the portfolio page sends {demo:"cmd", action, value}; the copy answers with its state.
const bridge = ({ STATE, PLAY, PAUSE, CHAPTER, SPEED, COUNT, START }) => `
  // Portfolio copy: start from #N, and in ?embed let the portfolio page drive the player
  const EMBED = document.documentElement.classList.contains("embed");
  function pfState() { ${STATE} }
  function pfNotify() { if (EMBED) parent.postMessage(pfState(), "*"); }
  if (EMBED) {
    addEventListener("message", (e) => {
      const m = e.data;
      if (!m || m.demo !== "cmd") return;
      if (m.action === "play") { ${PLAY} }
      else if (m.action === "pause") { ${PAUSE} }
      else if (m.action === "chapter") { ${CHAPTER} }
      else if (m.action === "speed") { ${SPEED} = m.value; }
      pfNotify();
    });
    setInterval(() => { if (!paused) pfNotify(); }, 250);
  }
  const pfStart = Math.max(0, Math.min(${COUNT} - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
  const pfMeasure = location.search.match(/[?&]measure=?([\\d.]*)/);
  if (pfMeasure) { ${SPEED} = +pfMeasure[1] || 6; window.__pfMeasure = true; }
  ${START}
})();
`;

const BACK = (hash) => `<a class="pf-back" href="../../#${hash}">← Wróć do portfolio</a>`;

function erp(src) {
  src = src.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\n/g, "");
  src = patch(src, "<style>", HEAD + "<style>", "erp head");
  src = patch(src, '<div class="stage-box" id="stageBox">', '<div class="stage-box" id="stageBox"><div class="cam" id="cam">', "erp cam open");
  src = patch(src, '\n    </div>\n    <div class="cap">', '\n    </div></div>\n    <div class="cap">', "erp cam close");
  src = patch(src, '<div class="head">', BACK("zamowienia") + '\n  <div class="head">', "erp back link");
  src = patch(src, "Tempo 1×</button>", "Tempo 1,5×</button>", "erp speed label");
  src = patch(src, "  let scale = 1;\n", "  let scale = 1;\n" + camera({ REDUCED: "reduced", SPEED: "speed", BOX: "box" }), "erp camera");
  src = patch(src, "stage.style.transform = `scale(${scale})`; };", "stage.style.transform = `scale(${scale})`; camReset(); };", "erp fit");
  src = patch(
    src,
    "const r = el(t).getBoundingClientRect(), s = stage.getBoundingClientRect();\n    return [(r.left - s.left) / scale + Math.min(r.width / scale / 2, 60), (r.top - s.top) / scale + r.height / scale / 2];",
    "const r = el(t).getBoundingClientRect(), s = stage.getBoundingClientRect(), k = s.width / 1280;\n    return [(r.left - s.left) / k + Math.min(r.width / k / 2, 60), (r.top - s.top) / k + r.height / k / 2];",
    "erp at()",
  );
  src = patch(src, "if (!paused) { left -= dt * speed; sceneElapsed += dt * speed; }", "if (!paused) { left -= dt * speed; sceneElapsed += dt * speed; camTick(dt); }", "erp wait");
  src = patch(src, "async function moveTo(t, ms = 900) {\n    const [x, y] = at(t);", "async function moveTo(t, ms = 900) {\n    const [x, y] = at(t);\n    camFocus(x, y, reduced ? 0 : ms / speed, 'cubic-bezier(.45,.05,.25,1)');", "erp moveTo");
  src = patch(src, 'await wait(text[i - 1] === " " ? 70 : 45);', 'camHold(); await wait(text[i - 1] === " " ? 70 : 45);', "erp type");
  src = patch(src, "const show = (name, st = {}) => { view = name; state = st; render(); };", "const show = (name, st = {}) => { const changed = view !== null && view !== name; view = name; state = st; if (changed) screenIn(); render(); };", "erp show");
  src = patch(src, "const render = () => { screen.innerHTML = S[view](state); };", "const render = () => { screen.innerHTML = S[view](state); pfFade(screen.querySelector('.ct')); };", "erp render fade");
  src = patch(src, "const id = ++run; finished = false; setPaused(false);", "const id = ++run; finished = false; setPaused(false); camReset();", "erp chapter cam reset");
  src = patch(src, 'document.getElementById("caption").textContent = text; };', 'document.getElementById("caption").textContent = text; pfNotify(); };', "erp say");
  src = patch(src, "left <= 0 ? resolve() : requestAnimationFrame(tick);", "left <= 0 ? resolve() : paused ? pfIdle(() => { last = performance.now(); tick(last); }) : requestAnimationFrame(tick);", "erp idle when paused");
  src = patch(src, 'const setPaused = (p) => { paused = p;', 'const setPaused = (p) => { paused = p; if (!p) pfWake();', "erp wake");
  src = patch(src, "(function progress() {", '(function progress() {\n    if (document.documentElement.classList.contains("embed")) return;', "erp no bar loop in embed");
  src = patch(src, "let run = 0, paused = false, speed = 1, current = 0,", "let run = 0, paused = false, speed = 1.5, current = 0,", "erp speed");
  src = patch(src, 'finished = true; playBtn.textContent = "Odtwórz ponownie";', 'finished = true; playBtn.textContent = "Odtwórz ponownie"; camOut(); pfNotify();', "erp finished");
  src = patch(
    src,
    "\n  play(0);\n})();",
    "\n" +
      bridge({
        STATE: `const before = scenes.slice(0, current).reduce((s, x) => s + x.est, 0);
    return { demo: "state", names: scenes.map((s) => s.name), est: scenes.map((s) => s.est), cur: current, paused, ended: finished, speed,
      progress: finished ? 1 : (before + Math.min(sceneElapsed, scenes[current].est)) / total,
      kicker: document.getElementById("kicker").textContent, caption: document.getElementById("caption").textContent };`,
        PLAY: "if (finished) play(0); else setPaused(false);",
        PAUSE: "setPaused(true);",
        CHAPTER: "play(m.value);",
        SPEED: "speed",
        COUNT: "scenes.length",
        START: "play(pfStart);\n  if (EMBED) setPaused(true);",
      }),
    "erp start",
  );
  return src;
}

function ksiegowanie(src) {
  src = src.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\n/g, "");
  src = patch(src, "<style>\n/* Layout", HEAD + "<style>\n/* Layout", "lp head");
  src = patch(src, '<div class="stage" id="stage">', '<div class="cam" id="cam"><div class="stage" id="stage">', "lp cam open");
  src = patch(src, '        </div>\n      </div>\n      <div class="controls">', '        </div></div>\n      </div>\n      <div class="controls">', "lp cam close");
  src = patch(src, '<main class="wrap">', '<main class="wrap">\n  ' + BACK("ksiegowanie"), "lp back link");
  src = patch(src, "  let scale = 1;\n  function fit() {", "  let scale = 1;\n" + camera({ REDUCED: "reduce", SPEED: "SPEED", BOX: "screenEl" }) + "  function fit() {", "lp camera");
  src = patch(src, "screenEl.style.height = H * scale + 'px';\n  }", "screenEl.style.height = H * scale + 'px';\n    camReset();\n  }", "lp fit");
  src = patch(src, "const SPEED = window.__lpSpeed || 1;", "let SPEED = 1.5;", "lp speed");
  src = patch(src, "      await frame();\n", "      if (paused) { await pfIdle(); last = performance.now(); }\n      await frame();\n", "lp idle when paused");
  src = patch(src, "  function setPaused(p) {\n    paused = p;", "  function setPaused(p) {\n    paused = p;\n    if (!p) pfWake();", "lp wake");
  src = patch(src, "if (!paused) { t += dt; chapterSpent += dt; }", "if (!paused) { t += dt; chapterSpent += dt; camTick(dt / SPEED); }", "lp wait");
  src = patch(
    src,
    "const r = e.getBoundingClientRect(), a = app.getBoundingClientRect();\n    return { x: (r.left - a.left + r.width * fx) / scale, y: (r.top - a.top + r.height * fy) / scale, h: r.height / scale, top: (r.top - a.top) / scale };",
    "const r = e.getBoundingClientRect(), a = app.getBoundingClientRect(), k = a.width / W;\n    return { x: (r.left - a.left + r.width * fx) / k, y: (r.top - a.top + r.height * fy) / k, h: r.height / k, top: (r.top - a.top) / k };",
    "lp where()",
  );
  src = patch(src, "Math.round(ms / 16));", "Math.round(ms / 16 / SPEED));", "lp scrollTo");
  src = patch(src, "const dur = reduce ? 0 : Math.min(1100, Math.max(320, ms * (0.55 + dist / 900)));", "const dur = reduce ? 0 : Math.min(1100, Math.max(320, ms * (0.55 + dist / 900)));\n    camFocus(p.x, p.y, dur / SPEED, 'cubic-bezier(.33,1,.68,1)');", "lp move cam");
  src = patch(src, "RUN++; const id = RUN;", "RUN++; const id = RUN; camReset();", "lp chapter cam reset");
  src = patch(src, "await wait(16); t += 16;", "await wait(16); t += 16 * SPEED;", "lp move speed");
  src = patch(src, "async function hover(name, ms) { await move(name); await wait(ms);", "async function hover(name, ms) { await move(name); camHold(ms); await wait(ms);", "lp hover");
  src = patch(src, "for (const ch of text) { set(ch); render(); await wait(", "for (const ch of text) { set(ch); render(); camHold(); await wait(", "lp type");
  src = patch(src, "const say = (t) => { $('say').textContent = t; };", "const say = (t) => { $('say').textContent = t; pfNotify(); };", "lp say");
  src = patch(src, "    app.innerHTML = html;\n", "    pfScreen();\n    app.innerHTML = html;\n    pfFade(document.getElementById('main'));\n", "lp render");
  src = patch(
    src,
    "  function render() {",
    "  let pfKey = '';\n  function pfScreen() {\n    const k = S.screen + '|' + S.tab + '|' + S.doc;\n    if (k !== pfKey) { const first = !pfKey; pfKey = k; if (!first) screenIn(); }\n  }\n  function render() {",
    "lp screen key",
  );
  src = patch(src, "const est = CH.map(() => 20000);", `const est = ${JSON.stringify(LP_EST)};`, "lp est");
  src = patch(src, "est[k] = Math.max(chapterSpent, 1000);", "est[k] = Math.max(chapterSpent, 1000); if (window.__pfMeasure) console.log('pf-measure', k, Math.round(chapterSpent));", "lp measure");
  src = patch(src, "$('end').hidden = false; setPaused(true); ended = true;", "$('end').hidden = false; setPaused(true); ended = true; camOut(); pfNotify();", "lp ended");
  src = patch(
    src,
    "\n  start(0, !reduce);\n})();",
    "\n" +
      bridge({
        STATE: `const done = est.slice(0, cur).reduce((a, b) => a + b, 0), total = est.reduce((a, b) => a + b, 0);
    return { demo: "state", names: CH.map((c) => c.title), est, cur, paused, ended, speed: SPEED,
      progress: ended ? 1 : (done + Math.min(chapterSpent, est[cur])) / total,
      kicker: CH[cur].title, caption: $('say').textContent };`,
        PLAY: "if (ended) { ended = false; start(0); } else setPaused(false);",
        PAUSE: "setPaused(true);",
        CHAPTER: "ended = false; start(m.value);",
        SPEED: "SPEED",
        COUNT: "CH.length",
        START: "start(pfStart, EMBED ? false : !reduce);",
      }),
    "lp start",
  );
  return src;
}

// HR System (Portfolio 7). It already has a camera and screen fades; the copy gets the portfolio's
// bridge instead of Portfolio 7's, no form-provider name, local fonts and no wheel capture.
function hr(src) {
  src = src.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\n/g, "");
  src = patch(src, "<style>", HEAD + "<style>", "hr head");
  // Portfolio 7's dark frame; the portfolio page draws its own frame around the stage
  src = patch(src, '<link rel="stylesheet" href="player-chrome.css">\n', "", "hr chrome");
  src = patch(src, '<div class="head">', BACK("hr") + '\n  <div class="head">', "hr back link");
  // the wheel's own SVG only: the rule also caught the small icons in the segment labels and pulled
  // them out of their frames to the label's corner
  src = patch(src, ".wstage svg { position: absolute; inset: 0; overflow: visible; }", ".wstage > svg { position: absolute; inset: 0; overflow: visible; }", "hr wheel icons");
  // PDF preview: the original translates only the field names (and only into German); the values stay
  // Polish. The copy has the whole profile in PL, DE and EN.
  src = patch(
    src,
    `    const de = st.pdf === "de";
    const L = de
      ? { t: "Mitarbeiterprofil", s: "Kompetenzprofil", pos: "Position", by: "Geburtsjahr", rh: "Beruflicher Werdegang", ce: "Kurse und Zertifikate", sk: "Fähigkeiten", la: "Sprachen", pr: "laufend", g: "Erstellt am" }
      : { t: "Profil pracownika", s: "Profil kompetencyjny", pos: "Stanowisko", by: "Rok urodzenia", rh: "Historia stanowisk", ce: "Kursy i certyfikaty", sk: "Umiejętności", la: "Języki", pr: "obecnie", g: "Wygenerowano" };`,
    `    const L = {
      pl: { t: "Profil pracownika", s: "Profil kompetencyjny", pos: "Stanowisko", by: "Rok urodzenia", rh: "Historia stanowisk", ce: "Kursy i certyfikaty", sk: "Umiejętności", la: "Języki", pr: "obecnie", g: "Wygenerowano",
        vPos: "Zbrojarz", vRh: "Zbrojarz, Budowy", vCe: "Szkolenie BHP", vSk: "Zbrojarz, Praca w zespole" },
      de: { t: "Mitarbeiterprofil", s: "Kompetenzprofil", pos: "Position", by: "Geburtsjahr", rh: "Beruflicher Werdegang", ce: "Kurse und Zertifikate", sk: "Fähigkeiten", la: "Sprachen", pr: "laufend", g: "Erstellt am",
        vPos: "Eisenflechter", vRh: "Eisenflechter, Baustellen", vCe: "Arbeitsschutzschulung (BHP)", vSk: "Eisenflechten, Teamarbeit" },
      en: { t: "Employee profile", s: "Competence profile", pos: "Position", by: "Year of birth", rh: "Employment history", ce: "Courses and certificates", sk: "Skills", la: "Languages", pr: "present", g: "Generated on",
        vPos: "Rebar fixer", vRh: "Rebar fixer, construction sites", vCe: "Health and safety training (BHP)", vSk: "Rebar fixing, teamwork" },
    }[st.pdf] || {};`,
    "hr pdf labels",
  );
  // "Profil i PDF" ran too fast even at 1x: about 5 s more, all of it in the reading pauses (the wheel,
  // the 183-day pool, the Polish and the German page, the "generated" toast); cursor moves keep their pace
  {
    const a = src.indexOf('{ name: "Profil i PDF", est: 10200,');
    const b = src.indexOf('{ name: "Uprawnienia"', a);
    if (a < 0 || b < 0) throw new Error("hr profile scene: not found");
    let blk = src.slice(a, b);
    for (const [find, repl] of [
      // measured at 1x: 16.9 s, so the progress bar does not stand still at the end of the chapter
      ["est: 10200", "est: 16900"],
      ['set({ sel: "wz" }, { wheelIn: 1 });\n      await wait(500);', 'set({ sel: "wz" }, { wheelIn: 1 });\n      await wait(1200);'],
      ['await look("pool", 1.3, 600);\n      await wait(1500);', 'await look("pool", 1.3, 600);\n      await wait(2600);'],
      ['set({ pdf: "pl" }, { pdfIn: 1 });\n      await wait(600);', 'set({ pdf: "pl" }, { pdfIn: 1 });\n      await wait(1500);'],
      ['await look("page", 1.12, 500);\n      await wait(800);', 'await look("page", 1.12, 500);\n      await wait(2300);'],
      ['toastIn: 1 });\n      await wait(1100);', 'toastIn: 1 });\n      await wait(1900);'],
    ]) blk = patch(blk, find, repl, `hr profile scene: ${find.slice(0, 30)}`);
    src = src.slice(0, a) + blk + src.slice(b);
  }
  src = patch(
    src,
    "<dd>Zbrojarz</dd><dt>${L.by}</dt><dd>1989</dd><dt>${L.rh}</dt><dd>Zbrojarz, Budowy (11.2024, ${L.pr})</dd><dt>${L.ce}</dt><dd>Szkolenie BHP</dd><dt>${L.sk}</dt><dd>Zbrojarz, Praca w zespole</dd>",
    "<dd>${L.vPos}</dd><dt>${L.by}</dt><dd>1989</dd><dt>${L.rh}</dt><dd>${L.vRh} (11.2024, ${L.pr})</dd><dt>${L.ce}</dt><dd>${L.vCe}</dd><dt>${L.sk}</dt><dd>${L.vSk}</dd>",
    "hr pdf values",
  );
  // no name of the form provider anywhere in the portfolio
  src = patch(src, "Usługi zewnętrzne (Tally, Gemini, Dysk i Kalendarz Google)", "Usługi zewnętrzne (Gemini, Dysk i Kalendarz Google)", "hr note");
  src = patch(src, "Zgłoszenie z formularza Tally (OLX)", "Zgłoszenie z formularza (OLX)", "hr history");
  src = patch(src, "Kandydat wysyła formularz Tally z ogłoszenia na OLX.", "Kandydat wysyła formularz z ogłoszenia na OLX.", "hr caption");
  src = patch(src, "jedno ocenione przez AI, drugie", "jedno sprawdzone przez AI, drugie", "hr outro wording");
  // final screen: "AI tylko proponuje" 10% larger and in the red of the HR mark (.hrm)
  src = patch(
    src,
    ".outro .row span { font-size: 14px; padding: 7px 13px; border-radius: 999px; border: 1px solid #2a2a2e; color: #e6e6e8; }",
    ".outro .row span { font-size: 14px; padding: 7px 13px; border-radius: 999px; border: 1px solid #2a2a2e; color: #e6e6e8; }\n" +
      ".outro .row span:first-child { font-size: 15.4px; padding: 7.7px 14.3px; background: #c0392b; border-color: #c0392b; color: #faf9f6; font-weight: 600; }\n" +
      // the row would stretch the other pills to the taller one's height
      ".outro .row { align-items: center; }",
    "hr outro pill",
  );
  const toasts = src.split('"Nowe zgłoszenie z formularza Tally"').length - 1;
  if (toasts !== 2) throw new Error(`hr toasts: expected 2 matches, found ${toasts}`);
  src = src.replaceAll('"Nowe zgłoszenie z formularza Tally"', '"Nowe zgłoszenie z formularza"');
  if (/tally/i.test(src)) throw new Error("hr: the form provider is still named somewhere");
  src = patch(src, 'capEl.classList.remove("swap"); void capEl.offsetWidth; capEl.classList.add("swap");\n  };', 'capEl.classList.remove("swap"); void capEl.offsetWidth; capEl.classList.add("swap");\n    pfNotify();\n  };', "hr say");
  src = patch(src, "(function progress() {", '(function progress() {\n    if (document.documentElement.classList.contains("embed")) return;', "hr no bar loop in embed");
  // before play the portfolio shows chapter 1 (it has its own play button), as for the other demos
  src = patch(
    src,
    'say("Start", "Naciśnij Odtwórz, aby zobaczyć dzień pracy działu kadr krok po kroku.");',
    'say(scenes[0].name, "Kandydat wysyła formularz z ogłoszenia na OLX. Aplikacja dostaje podpisany webhook, ten sam co na produkcji.");',
    "hr poster caption",
  );
  src = patch(src, 'finished = true; playBtn.textContent = "Odtwórz ponownie";', 'finished = true; playBtn.textContent = "Odtwórz ponownie"; pfNotify();', "hr finished");
  src = patch(src, 'const setPaused = (p) => { paused = p; playBtn.textContent = p ? "Odtwórz" : "Pauza"; };', 'const setPaused = (p) => { paused = p; playBtn.textContent = p ? "Odtwórz" : "Pauza"; pfNotify(); };', "hr paused");
  // Bridge, placed before the start code so the opening caption is already reported
  src = patch(
    src,
    "\n  const LINE = window.Line ||",
    `
  // Portfolio copy: in ?embed the portfolio page drives the player (same messages as the other demos)
  const EMBED = document.documentElement.classList.contains("embed");
  function pfState() {
    const before = scenes.slice(0, current).reduce((s, x) => s + x.est, 0);
    return { demo: "state", names: scenes.map((s) => s.name), est: scenes.map((s) => s.est), cur: current, paused: paused || !started, ended: finished, speed,
      progress: !started ? 0 : finished ? 1 : (before + Math.min(sceneElapsed, scenes[current].est)) / total,
      kicker: document.getElementById("kicker").textContent, caption: capEl.textContent };
  }
  function pfNotify() { if (EMBED) parent.postMessage(pfState(), "*"); }
  if (EMBED) {
    addEventListener("message", (e) => {
      const m = e.data;
      if (!m || m.demo !== "cmd") return;
      if (m.action === "play") startOrResume();
      else if (m.action === "pause") { if (started && !finished) setPaused(true); }
      else if (m.action === "chapter") { started = true; play(m.value); }
      else if (m.action === "speed") speed = m.value;
      pfNotify();
    });
    setInterval(() => { if (started && !paused && !finished) pfNotify(); }, 250);
  }
  const LINE = window.Line ||`,
    "hr bridge",
  );
  return src;
}

// Portfolio 7's shared player script: keep the camera and the embed switch, drop the wheel capture
// (on the portfolio page the wheel over the animation must scroll the page as usual)
function hrBridge(src) {
  return patch(
    src,
    `    // The embedded player never scrolls itself: hand the wheel to the page so it keeps scrolling smoothly.
    if (!params.has("big")) {
      addEventListener("wheel", (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        parent.postMessage({ source: "gigafactory-line", type: "wheel", dy: e.deltaY, mode: e.deltaMode }, "*");
      }, { passive: false });
    }
`,
    "",
    "hr bridge wheel",
  );
}

export function buildDemos(outDir) {
  for (const [name, fn] of [["erp", erp], ["ksiegowanie", ksiegowanie], ["hr", hr]]) {
    const out = `${outDir}/demo/${name}/index.html`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, fn(readFileSync(SOURCES[name], "utf8").replace(/\r\n/g, "\n")));
  }
  writeFileSync(`${outDir}/demo/hr/embed-bridge.js`, hrBridge(readFileSync(SOURCES.hrBridge, "utf8").replace(/\r\n/g, "\n")));
}
