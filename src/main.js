import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { createHeroField } from "./gl.js";

window.__pfReady = true;
gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = root.classList.contains("motion") && !reduce;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const EXPO = "expo.out";

// Mona Sans width axis, values from Portfolio 4: the headline rests at 110%, the hovered sentence
// opens to 114% (the longest one still ends before the gate line of the field), the intro starts at 76%
const W_REST = "110%";
const W_FOCUS = "114%";
const W_START = "76%";

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
  $$(".ht").forEach((el) => gsap.to(el, { "--w": +el.dataset.zone === z ? W_FOCUS : W_REST, duration: 0.7, ease: EXPO, overwrite: "auto" }));
}
$$(".hero [data-zone]").forEach((el) => {
  el.addEventListener("pointerenter", () => setZone(+el.dataset.zone));
  el.addEventListener("pointerleave", () => setZone(null));
});

/* ---------- Theme ---------- */
const sysDark = matchMedia("(prefers-color-scheme: dark)");
const themeNow = () => root.dataset.theme || (sysDark.matches ? "dark" : "light");
$(".theme-btn").addEventListener("click", (e) => {
  const next = themeNow() === "dark" ? "light" : "dark";
  const apply = () => {
    root.dataset.theme = next;
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
sysDark.addEventListener("change", () => field?.refreshColors());

/* ---------- HR recording: loads only when asked for ---------- */
$$(".shot-video").forEach((fig) => {
  const video = $("video", fig);
  $(".shot-play", fig).addEventListener("click", () => {
    video.controls = true;
    fig.classList.add("is-playing");
    video.play().catch(() => {});
    video.focus({ preventScroll: true });
  });
});

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
  for (const k of Object.keys(links)) {
    ScrollTrigger.create({ trigger: `#${k}`, start: "top 45%", end: "bottom 45%", onToggle: (s) => (s.isActive ? mark(k) : links[k].getAttribute("aria-current") && mark(null)) });
  }
})();

/* ---------- Motion ---------- */
if (motion) {
  // Hero: the letters stretch into place along the font's width axis. Opacity, rise and width are
  // separate tweens: the width opens slowly and evenly, so it reads as stretching, not as a blur.
  // Starts once the fonts are in (max 700 ms) and two frames have passed, so the heavy first frame
  // of the WebGL field does not swallow the beginning of the stretch
  const tl = gsap.timeline({ defaults: { ease: EXPO }, paused: true });
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 700))]).then(() =>
    requestAnimationFrame(() => requestAnimationFrame(() => tl.play())),
  );
  tl.to(".hero-visual", { opacity: 1, duration: 1.6, ease: "power2.out" }, 0)
    .fromTo(".ht", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out", stagger: 0.13 }, 0.1)
    .fromTo(".ht", { yPercent: 45 }, { yPercent: 0, duration: 1, stagger: 0.13 }, 0.1)
    .fromTo(".ht", { "--w": W_START }, { "--w": W_REST, duration: 1.3, ease: "power3.inOut", stagger: 0.13 }, 0.2)
    .fromTo(".hero-sub", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1 }, 0.58)
    .fromTo(".hero-cta", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1 }, 0.7);

  // Scrolling away from the hero sorts the rest of the mess. The copy drifts up the whole way,
  // but fades only in the second half, so the buttons never look disabled while still in reach.
  ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom top", scrub: true, onUpdate: (s) => field?.setSort(Math.pow(s.progress, 1.1)) });
  gsap.to(".hero-inner", { yPercent: -14, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
  gsap.fromTo(".hero-inner", { opacity: 1 }, { opacity: 0.15, ease: "none", immediateRender: false, scrollTrigger: { trigger: hero, start: "45% top", end: "bottom top", scrub: true } });

  // Section headings: each line rises out of its own mask, so the eye lands on the heading first
  $$("[data-split]").forEach((el) => {
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "split-line",
      // only a plain space separates words, so a no-break space keeps "z tych" or "w 15" together
      wordDelimiter: " ",
      reduceWhiteSpace: false,
      autoSplit: true,
      onSplit(self) {
        gsap.set(el, { visibility: "visible" });
        return gsap.from(self.lines, { yPercent: 105, duration: 1.05, stagger: 0.09, ease: EXPO, scrollTrigger: { trigger: el, start: "top 86%", once: true } });
      },
    });
  });

  // Text and screenshots arrive once, in reading order
  ScrollTrigger.batch("[data-reveal]", {
    start: "top 90%",
    once: true,
    onEnter: (els) =>
      gsap.to(els, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: EXPO,
        stagger: 0.08,
        onComplete: () => {
          els.forEach((el) => el.classList.add("is-in"));
          gsap.set(els, { clearProps: "transform,opacity" });
        },
      }),
  });

  // Nav progress
  gsap.to(".nav-progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

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

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
} else {
  root.classList.remove("motion");
}
