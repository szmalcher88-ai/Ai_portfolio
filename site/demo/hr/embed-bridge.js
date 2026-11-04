/* Shared by the three line players.
   - ?embed      hides the page header, the player fills the iframe and waits for "play" from the portfolio page
   - ?autoplay   starts immediately even when embedded (used by the full-screen view)
   - messages    {source: "gigafactory", type: "play" | "pause" | "restart"} from the parent page
   - height      the player reports its height so the parent can size the iframe without scrollbars */
(() => {
  const params = new URLSearchParams(location.search);
  const embed = params.has("embed");
  const root = document.documentElement;
  if (embed) root.classList.add("embed");
  if (params.has("big")) root.classList.add("big");

  const handlers = { play: [], pause: [], restart: [] };
  window.Line = {
    embed,
    autoplay: !embed || params.has("autoplay"),
    on(type, fn) { handlers[type] && handlers[type].push(fn); },
  };

  addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== parent || !d || d.source !== "gigafactory" || !handlers[d.type]) return;
    handlers[d.type].forEach((fn) => fn());
  });

  if (embed && parent !== window) {
    let last = 0;
    const post = () => {
      const h = Math.ceil(document.querySelector(".player")?.getBoundingClientRect().height || root.scrollHeight);
      if (h === last) return;
      last = h;
      parent.postMessage({ source: "gigafactory-line", type: "height", value: h }, "*");
    };
    const watch = () => {
      const p = document.querySelector(".player");
      if (p) new ResizeObserver(post).observe(p);
      post();
    };
    document.readyState === "loading" ? addEventListener("DOMContentLoaded", watch) : watch();
  }
})();

/* Camera: a Screen Studio style zoom that follows the cursor while the person clicks and types,
   and pulls back to the whole screen for reading. Composes with the player's fit-to-width scale. */
window.LineCamera = function LineCamera(stage, W, H) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let fit = 1;
  const cur = { x: W / 2, y: H / 2, z: 1 };
  const tgt = { x: W / 2, y: H / 2, z: 1 };
  let last = performance.now(), dirty = true;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function apply() {
    const z = cur.z;
    const tx = clamp(W / 2 - cur.x * z, W * (1 - z), 0);
    const ty = clamp(H / 2 - cur.y * z, H * (1 - z), 0);
    stage.style.transform = `scale(${fit}) translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${z.toFixed(4)})`;
  }
  function tick(now) {
    const dt = Math.min(now - last, 200); last = now;
    const k = 1 - Math.exp(-dt / 260);
    let moving = false;
    for (const key of ["x", "y", "z"]) {
      const d = tgt[key] - cur[key];
      if (Math.abs(d) > (key === "z" ? 0.0005 : 0.05)) { cur[key] += d * k; moving = true; }
      else cur[key] = tgt[key];
    }
    if (moving || dirty) { apply(); dirty = false; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    get z() { return cur.z; },
    /* fit-to-width scale times the current zoom: divide screen-space distances by this to get stage pixels */
    get eff() { return fit * cur.z; },
    setFit(s) { fit = s; dirty = true; apply(); },
    focus(x, y, z = 1.32) {
      if (reduced) return;
      tgt.x = x; tgt.y = y; tgt.z = z;
    },
    reset() { tgt.x = W / 2; tgt.y = H / 2; tgt.z = 1; },
    snap() { Object.assign(cur, tgt); dirty = true; },
  };
};
