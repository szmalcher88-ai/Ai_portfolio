import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { createHeroField } from "./gl.js";
import { initPlayers } from "./player.js";

window.__pfReady = true;
gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = root.classList.contains("motion") && !reduce;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const EXPO = "expo.out";

/* ---------- Hero field ---------- */
const hero = $(".hero");
const annot = $(".hero-annot");
let field = null;
try {
  field = createHeroField($(".hero-gl"), { reduce });
} catch (e) {
  console.warn("hero field off:", e);
}
if (!field) $(".hero-visual").hidden = true;

function placeLabels() {
  if (!field) return;
  const l = field.labels();
  annot.style.setProperty("--gate-x", `${l.gate}%`);
  annot.style.setProperty("--ok-y", `${l.ok}%`);
  annot.style.setProperty("--human-y", `${l.human}%`);
}
placeLabels();
new ResizeObserver(placeLabels).observe(hero);

// The three sentences of the headline point at their part of the field
function setZone(z) {
  if (z === null) delete hero.dataset.focus;
  else hero.dataset.focus = z;
  field?.setFocus(z === null ? -1 : z);
  if (!motion) return;
  // 114%: the longest sentence still ends before the gate line of the field
  $$(".ht").forEach((el) => gsap.to(el, { "--w": +el.dataset.zone === z ? "114%" : "110%", duration: 0.7, ease: EXPO, overwrite: "auto" }));
}
$$(".hero [data-zone]").forEach((el) => {
  el.addEventListener("pointerenter", () => setZone(+el.dataset.zone));
  el.addEventListener("pointerleave", () => setZone(null));
});

/* ---------- Theme ---------- */
const themeMeta = $('meta[name="theme-color"]');
const themeNow = () => (root.dataset.theme === "dark" ? "dark" : "light");
$(".theme-btn").addEventListener("click", (e) => {
  const next = themeNow() === "dark" ? "light" : "dark";
  const apply = () => {
    root.dataset.theme = next;
    themeMeta?.setAttribute("content", next === "dark" ? "#0c0e0b" : "#f1f3ee");
    try { localStorage.setItem("theme", next); } catch (err) { /* private mode */ }
    field?.refreshColors();
  };
  if (!document.startViewTransition || reduce) return apply();
  const r = e.currentTarget.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) * 1.05;
  // .vt switches CSS transitions off, so the new view inside the circle is already in its final colours
  root.classList.add("vt");
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
  vt.finished.finally(() => root.classList.remove("vt"));
});

/* ---------- Players ---------- */
initPlayers(reduce);

/* ---------- Project index: preview follows the cursor ---------- */
(() => {
  const preview = $(".preview");
  if (!preview || !finePointer) return;
  const imgs = $$("img", preview);
  let front = 0;
  const show = (src) => {
    if (imgs[front].getAttribute("src") === src) return;
    const back = imgs[1 - front];
    back.setAttribute("src", src);
    gsap.set(imgs[front], { zIndex: 1 });
    gsap.set(back, { zIndex: 2 });
    gsap.fromTo(back, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out", overwrite: true });
    front = 1 - front;
  };
  const rows = $$(".prow");
  rows.forEach((r) => { const i = new Image(); i.src = r.dataset.preview; });
  // Card sits to the right of the cursor, so it never covers the name being hovered. Where it would
  // cover the arrow buttons at the end of the rows, it moves to the left of the cursor instead; it only
  // comes back once the cursor is clearly away from them, so it does not flicker at the edge.
  gsap.set(preview, { xPercent: 0, yPercent: -50, scale: 0.85, opacity: 0, transformOrigin: "0% 50%" });
  const xTo = gsap.quickTo(preview, "x", { duration: 0.55, ease: "power3" });
  const yTo = gsap.quickTo(preview, "y", { duration: 0.55, ease: "power3" });
  const rTo = gsap.quickTo(preview, "rotation", { duration: 0.8, ease: "power3" });
  const GAP = 32;
  let side = 1; // 1: right of the cursor, -1: left of it
  const arrowsLeft = () => Math.min(...rows.map((r) => $(".prow-arrow", r).getBoundingClientRect().left));
  const px = (cx) => {
    const w = preview.offsetWidth;
    const limit = arrowsLeft() - 16;
    if (side === 1 && cx + GAP + w > limit) side = -1;
    else if (side === -1 && cx + GAP + w < limit - 60) side = 1;
    // on the left its right edge also keeps clear of the arrows when the cursor is on one
    return gsap.utils.clamp(16, innerWidth - w - 16, side === 1 ? cx + GAP : Math.min(cx - GAP, limit) - w);
  };
  // The card leans into horizontal movement and settles upright as soon as the cursor stops
  let lastX = 0, settle = 0;
  const list = $(".plist");
  list.addEventListener("pointermove", (e) => {
    const before = side;
    const x = px(e.clientX);
    if (side !== before) {
      // switch sides in one step instead of sliding across the cursor and the arrows
      gsap.set(preview, { transformOrigin: side === 1 ? "0% 50%" : "100% 50%" });
      xTo(x, x);
    } else {
      xTo(x);
    }
    yTo(e.clientY);
    rTo(gsap.utils.clamp(-5, 5, (e.clientX - lastX) * 0.35));
    lastX = e.clientX;
    clearTimeout(settle);
    settle = setTimeout(() => rTo(0), 90);
  });
  rows.forEach((r) =>
    r.addEventListener("pointerenter", (e) => {
      show(r.dataset.preview);
      if (+gsap.getProperty(preview, "opacity") < 0.05) {
        const x = px(e.clientX);
        gsap.set(preview, { x, y: e.clientY, rotation: 0, transformOrigin: side === 1 ? "0% 50%" : "100% 50%" });
        xTo(x, x);
        yTo(e.clientY, e.clientY);
      }
      gsap.to(preview, { opacity: 1, scale: 1, duration: 0.45, ease: EXPO, overwrite: "auto" });
    }),
  );
  list.addEventListener("pointerleave", () => gsap.to(preview, { opacity: 0, scale: 0.85, duration: 0.35, ease: "power2.out", overwrite: "auto" }));
})();

/* ---------- Copy e-mail ---------- */
$$("[data-copy]").forEach((btn) => {
  const say = btn.parentElement.querySelector(".copy-say");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.classList.add("done");
      say.textContent = "Skopiowano";
    } catch (e) {
      say.textContent = "Nie udało się skopiować";
    }
    setTimeout(() => { btn.classList.remove("done"); say.textContent = ""; }, 2200);
  });
});

/* ---------- Nav: active section ---------- */
(() => {
  const links = Object.fromEntries($$("[data-nav]").map((a) => [a.dataset.nav, a]));
  const mark = (k) => Object.entries(links).forEach(([key, a]) => (key === k ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  const zones = [["projekty", "#projekty", "#zamowienia"]];
  for (const [k, from, to] of zones) {
    ScrollTrigger.create({ trigger: from, endTrigger: to, start: "top 45%", end: "bottom 45%", onToggle: (s) => (s.isActive ? mark(k) : links[k].getAttribute("aria-current") && mark(null)) });
  }
})();

/* ---------- Motion ---------- */
if (motion) {
  // Hero: the letters stretch into place along the font's width axis. Opacity, rise and width are
  // separate tweens: the width opens slowly and evenly, so it reads as stretching, not as a blur.
  // Starts once Mona Sans is in (max 700 ms) and two frames have passed, so the heavy first frame of
  // the WebGL field does not swallow the beginning of the stretch
  const tl = gsap.timeline({ defaults: { ease: EXPO }, paused: true });
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 700))]).then(() =>
    requestAnimationFrame(() => requestAnimationFrame(() => tl.play())),
  );
  tl.to(".hero-visual", { opacity: 1, duration: 1.6, ease: "power2.out" }, 0)
    .fromTo(".ht", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out", stagger: 0.13 }, 0.22)
    .fromTo(".ht", { yPercent: 45 }, { yPercent: 0, duration: 1, stagger: 0.13 }, 0.22)
    .fromTo(".ht", { "--w": "76%" }, { "--w": "110%", duration: 1.3, ease: "power3.inOut", stagger: 0.13 }, 0.32)
    .fromTo(".hero-sub", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1 }, 0.7);

  // Scrolling away from the hero sorts the rest of the mess. The copy drifts up the whole way,
  // but fades only in the second half, so the buttons never look disabled while still in reach.
  ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom top", scrub: true, onUpdate: (s) => field?.setSort(Math.pow(s.progress, 1.1)) });
  gsap.to(".hero-inner", { yPercent: -14, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
  gsap.fromTo(".hero-inner", { opacity: 1 }, { opacity: 0.15, ease: "none", immediateRender: false, scrollTrigger: { trigger: hero, start: "45% top", end: "bottom top", scrub: true } });

  // Headings: each line rises out of its own mask; case titles also open up along the width axis
  $$("[data-split]").forEach((el) => {
    const big = el.classList.contains("case-title");
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "split-line",
      autoSplit: true,
      onSplit(self) {
        gsap.set(el, { visibility: "visible" });
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 86%" } });
        tl.from(self.lines, { yPercent: 105, duration: big ? 1.2 : 1.05, stagger: 0.09, ease: EXPO }, 0);
        if (big) tl.from(self.lines, { fontStretch: "84%", duration: 1.3, stagger: 0.09, ease: "power3.inOut" }, 0.1);
        return tl;
      },
    });
  });

  // No "once: true" on these triggers: a trigger the page is already past (a reload restores the scroll
  // position near the end) would remove itself while the next one is being created, GSAP then throws and
  // the rest of this script never runs. The triggers stay and a flag makes each reveal run once.
  ScrollTrigger.batch("[data-reveal]", {
    start: "top 90%",
    onEnter: (els) => {
      const todo = els.filter((el) => !el.dataset.shown);
      if (!todo.length) return;
      todo.forEach((el) => (el.dataset.shown = "1"));
      gsap.to(todo, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: EXPO,
        stagger: 0.08,
        onComplete: () => {
          todo.forEach((el) => el.classList.add("is-in"));
          gsap.set(todo, { clearProps: "transform,opacity" });
        },
      });
    },
  });

  // Flow: each step appears, then its connector draws to the next icon, which pops in on arrival
  $$(".flow").forEach((flow) => {
    const steps = $$(".flow-step", flow);
    const icons = $$(".flow-icon", flow);
    gsap.set(steps, { opacity: 0, y: 24, "--draw": 0 });
    gsap.set(icons, { scale: 0.4 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: flow, start: "top 80%" } });
    steps.forEach((step, i) => {
      const at = i * 0.6;
      tl.to(step, { opacity: 1, y: 0, duration: 0.9, ease: EXPO }, at)
        .to(icons[i], { scale: 1, duration: 0.8, ease: "back.out(2.2)" }, at);
      if (i < steps.length - 1) tl.to(step, { "--draw": 1, duration: 0.6, ease: "power2.inOut" }, at + 0.15);
    });
  });

  // Counters
  const fmt = new Intl.NumberFormat("pl-PL");
  $$("[data-count]").forEach((el) => {
    const end = +el.dataset.count, o = { v: 0 };
    let counted = false;
    el.textContent = "0";
    ScrollTrigger.create({
      trigger: el,
      start: "top 90%",
      onEnter: () => {
        if (counted) return;
        counted = true;
        el.classList.add("counting");
        gsap.to(o, { v: end, duration: end > 100 ? 1.8 : 1.1, ease: "power3.out", onUpdate: () => (el.textContent = fmt.format(Math.round(o.v))), onComplete: () => el.classList.remove("counting") });
      },
    });
  });

  // Nav progress: a line on the bar's outline. While scrolling it runs along the bottom edge; at the
  // very end of the page it carries on from where it is, speeding up round the whole frame, and the bar
  // glows once in the page's lime. Scrolling back up pulls it back to the bottom edge.
  (() => {
    const nav = $("#nav");
    const svg = $(".nav-ring", nav);
    const path = $("path", svg);
    const st = { d: 0 };
    let total = 0, bottom = 0, around = false, p = 0;
    const draw = () => path.style.setProperty("stroke-dasharray", `${st.d} ${total + 4}`);
    const shape = () => {
      const w = nav.clientWidth, h = nav.clientHeight, s = 1, r = h / 2 - s;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      // starts at the left end of the bottom edge, goes right, up the right end, back along the top
      path.setAttribute("d", `M${s + r} ${h - s}H${w - s - r}A${r} ${r} 0 0 0 ${w - s - r} ${s}H${s + r}A${r} ${r} 0 0 0 ${s + r} ${h - s}Z`);
      total = path.getTotalLength();
      bottom = Math.max(0, w - 2 * s - 2 * r);
    };
    const follow = () => gsap.to(st, { d: p * bottom, duration: 0.35, ease: "power3.out", overwrite: true, onUpdate: draw });
    const lightUp = () => {
      nav.classList.remove("is-lit");
      void nav.offsetWidth; // restart the glow if it ran before
      nav.classList.add("is-lit");
    };
    const update = (self) => {
      p = self.progress;
      if (!around && p >= 0.995) {
        around = true;
        gsap.to(st, { d: total, duration: 1.15, ease: "power3.in", overwrite: true, onUpdate: draw, onComplete: lightUp });
      } else if (around && p < 0.98) {
        around = false;
        nav.classList.remove("is-lit");
        follow();
      } else if (!around) {
        follow();
      }
    };
    shape();
    draw();
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: update, onRefresh: update });
    new ResizeObserver(() => {
      shape();
      st.d = around ? total : p * bottom;
      draw();
    }).observe(nav);
  })();

  // Magnetic buttons
  if (finePointer) {
    $$(".magnetic").forEach((btn) => {
      const xTo = gsap.quickTo(btn, "x", { duration: 0.5, ease: "power3" });
      const yTo = gsap.quickTo(btn, "y", { duration: 0.5, ease: "power3" });
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.22);
        yTo((e.clientY - r.top - r.height / 2) * 0.3);
      });
      btn.addEventListener("pointerleave", () => { xTo(0); yTo(0); gsap.to(btn, { scale: 1, duration: 0.3, ease: "power3.out", overwrite: "auto" }); });
      // press: GSAP owns this button's transform, so the CSS :active scale cannot apply here
      btn.addEventListener("pointerdown", () => gsap.to(btn, { scale: 0.97, duration: 0.12, ease: "power2.out", overwrite: "auto" }));
      btn.addEventListener("pointerup", () => gsap.to(btn, { scale: 1, duration: 0.35, ease: "back.out(3)", overwrite: "auto" }));
    });
  }

  // Pulsing status dots and the tool icons run only while on screen
  const onScreen = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("idle", !e.isIntersecting)));
  $$(".live-dot, .tools").forEach((d) => onScreen.observe(d));

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
} else {
  // No motion: everything visible
  root.classList.remove("motion");
}
