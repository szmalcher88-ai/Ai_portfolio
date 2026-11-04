// Hero field: unread input (grey dots) drifts from the left, passes the checks at the gate,
// leaves as tidy rows (green dashes) or, for a few items, drops to the "for a person" lane (amber).
// Once a person has checked an item it flashes, turns green and floats up to the verified rows.
// One draw call; every particle's path is a pure function of its seeds and time, so the CPU only
// updates a handful of uniforms per frame.

const VS = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uAspect;
uniform float uGate;
uniform float uSort;
uniform float uPx;
uniform vec2 uMouse;
uniform float uMouseOn;
uniform vec3 uFocus;
uniform vec2 uMask;
uniform vec3 uLane;
varying float vA;
varying float vKind;
varying float vFlash;
varying float vGreen;

float wobble(float x, float s, float t) {
  return sin(x * 2.1 + s * 19.1 + t * 0.23) * 0.55
       + sin(x * 5.3 + s * 7.7 - t * 0.41) * 0.3
       + sin(x * 10.7 + s * 3.1 + t * 0.6) * 0.12;
}

void main() {
  float lanes = uLane.x;
  float isHuman = step(aSeed.w, 0.065);
  // items for a person run at half pace, so past the gate they have time for the whole round trip
  // (down to the person and back up to the verified rows) at one steady speed
  float speed = mix(0.016, 0.034, aSeed.y) * mix(1.0, 0.5, isHuman);
  float u = fract(aSeed.x + uTime * speed);
  float xL = -uAspect - 0.12;
  float xR = uAspect + 0.12;
  float x = mix(xL, xR, u);

  float lane = floor(fract(aSeed.z * 7.13 + aSeed.w * 3.7) * lanes);
  float laneY = mix(uLane.y, uLane.z, (lane + 0.5) / lanes);
  float yc = (aSeed.z * 2.0 - 1.0) * 0.9 + wobble(x, aSeed.z * 10.0, uTime) * 0.2;
  float order = smoothstep(uGate - 1.1, uGate - 0.05, x);
  order = order + uSort * (1.0 - order);
  float y = mix(yc, laneY, order);

  float post = smoothstep(uGate - 0.015, uGate + 0.015, x);
  // Items for a person: drop to the tray, wait there while being checked, then (decision at tDec,
  // different for every item) float up and right into one of the upper verified rows
  float W = xR - uGate;
  float tP = clamp((x - uGate) / W, 0.0, 1.0);
  // Timeline past the gate (tP, at the half pace above):
  //   0 .. tTray      down to the person: first to the right, then curving down
  //   tTray .. tDec   waiting in the tray while being checked
  //   tDec .. tJoin   approved: green, up to one of the upper verified rows at the same speed
  //   tJoin ..        along that row at the speed of the other rows, out at the right edge
  float tTray = 0.25;
  float tDec = mix(0.3, 0.38, fract(aSeed.y * 7.31 + aSeed.z * 1.7));
  float tUp = 0.29;
  float tJoin = tDec + tUp;
  // how far right the tray reaches: less on the narrow phone field, so the dots stay off the label
  float reach = mix(0.17, 0.3, smoothstep(1.2, 1.55, uAspect));
  float out1 = clamp(tP / tTray, 0.0, 1.0);
  float trayPx = uGate + W * (reach * (1.0 - (1.0 - out1) * (1.0 - out1)) + reach * 0.2 * smoothstep(tTray, tDec, tP));
  float trayY = -0.84 + fract(aSeed.y * 13.7) * 0.07;
  float upLane = lanes - 1.0 - floor(fract(aSeed.z * 5.13) * ceil(lanes * 0.5));
  float upY = mix(uLane.y, uLane.z, (upLane + 0.5) / lanes);
  float g = clamp((tP - tDec) / tUp, 0.0, 1.0);
  float x0 = uGate + W * reach * 1.2;
  float xJ = min(x0 + W * 0.42, xR - 0.35);
  float px = x;
  if (isHuman > 0.5 && x > uGate) {
    px = tP < tDec ? trayPx : (tP < tJoin ? mix(x0, xJ, g) : xJ + (tP - tJoin) * 2.0 * W);
  }
  float toTray = isHuman * smoothstep(0.0, tTray, tP) * step(uGate, x);
  y = mix(y, trayY, toTray);
  y = mix(y, upY, isHuman * smoothstep(0.0, 1.0, g));
  float approve = isHuman * step(uGate, x) * exp(-abs(tP - tDec) * 90.0);
  vGreen = isHuman * smoothstep(tDec - 0.005, tDec + 0.06, tP);

  vec2 p = vec2(px, y);
  vec2 d = p - uMouse;
  float dl = length(d);
  float push = uMouseOn * (1.0 - order) * smoothstep(0.36, 0.0, dl);
  p += (d / max(dl, 0.0001)) * push * 0.2;
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);

  float kind = isHuman * post * 2.0 + (1.0 - isHuman) * post;
  vKind = kind;
  // only some of the sorted items stay visible as rows, so the lanes read as rows, not lines
  float keep = mix(1.0, step(fract(aSeed.x * 91.7 + aSeed.z * 3.3), 0.3), post * (1.0 - isHuman));
  float edge = smoothstep(xL, xL + 0.4, x) * (1.0 - smoothstep(xR - 0.3, xR, p.x));
  float sx = p.x / uAspect * 0.5 + 0.5;
  float mask = mix(0.32, 1.0, smoothstep(uMask.x, uMask.y, sx));
  float base = mix(0.24 + aSeed.y * 0.4, 1.0, post) * mix(mask, 1.0, post);
  float focus = kind < 0.5 ? uFocus.x : (kind < 1.5 ? uFocus.y : uFocus.z);
  vFlash = exp(-abs(x - uGate) * 22.0);
  // the moment of the decision: a short flash, like the one at the gate
  vA = base * edge * keep * (1.0 + focus * 1.3 + vFlash * 0.8 + approve * 0.9);
  float size = kind > 1.5 ? 7.0 : (kind > 0.5 ? 13.0 : mix(2.4, 4.6, aSeed.y));
  gl_PointSize = uPx * size * (1.0 + vFlash * 0.5 + focus * 0.25 + approve * 0.7);
}
`;

const FS = `
precision mediump float;
uniform vec3 uRaw;
uniform vec3 uOk;
uniform vec3 uHuman;
varying float vA;
varying float vKind;
varying float vFlash;
varying float vGreen;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (vKind > 0.5 && vKind < 1.5) {
    vec2 q = abs(c) - vec2(0.38, 0.06);
    float dd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    a = 1.0 - smoothstep(0.0, 0.035, dd);
  } else {
    a = 1.0 - smoothstep(0.3, 0.5, length(c));
  }
  vec3 col = vKind > 1.5 ? mix(uHuman, uOk, vGreen) : (vKind > 0.5 ? uOk : mix(uRaw, uOk, vFlash * 0.7));
  float alpha = clamp(a * vA, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function hex(css) {
  const h = css.trim().replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function createHeroField(canvas, { reduce }) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) return null;

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {};
  for (const n of ["uTime", "uAspect", "uGate", "uSort", "uPx", "uMouse", "uMouseOn", "uFocus", "uMask", "uLane", "uRaw", "uOk", "uHuman"]) U[n] = gl.getUniformLocation(prog, n);

  const narrow = () => canvas.clientWidth < 760;
  let count = 0;
  const buf = gl.createBuffer();
  const aSeed = gl.getAttribLocation(prog, "aSeed");
  function seed() {
    count = narrow() ? 1500 : 3400;
    const data = new Float32Array(count * 4);
    // fixed seed: the field looks the same on every visit
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < data.length; i++) data[i] = rnd();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 0, 0);
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const state = {
    time: 18,
    sort: 0,
    mouse: [9, 9],
    mouseOn: 0,
    mouseTarget: 0,
    focus: [0, 0, 0],
    focusTarget: [0, 0, 0],
    aspect: 1,
    gate: 0.3,
    running: false,
    visible: true,
  };

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    gl.uniform3fv(U.uRaw, hex(cs.getPropertyValue("--gl-raw")));
    gl.uniform3fv(U.uOk, hex(cs.getPropertyValue("--gl-ok")));
    gl.uniform3fv(U.uHuman, hex(cs.getPropertyValue("--gl-human")));
  }

  // Layout: where the gate sits and how far the text mask reaches, in screen fractions
  let layout = { gateX: 0.66, maskFrom: 0.38, maskTo: 0.6 };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    state.aspect = w / h;
    layout = narrow() ? { gateX: 0.55, maskFrom: -1, maskTo: 0 } : { gateX: 0.68, maskFrom: 0.38, maskTo: 0.64 };
    state.gate = (layout.gateX * 2 - 1) * state.aspect;
    const prev = count;
    if ((narrow() ? 1500 : 3400) !== prev) seed();
    gl.uniform1f(U.uAspect, state.aspect);
    gl.uniform1f(U.uGate, state.gate);
    gl.uniform1f(U.uPx, dpr);
    gl.uniform2f(U.uMask, layout.maskFrom, layout.maskTo);
    // lanes: [count, bottom y, top y]
    gl.uniform3f(U.uLane, narrow() ? 7 : 11, narrow() ? -0.5 : -0.5, narrow() ? 0.62 : 0.66);
    draw();
  }

  function draw() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, state.time);
    gl.uniform1f(U.uSort, state.sort);
    gl.uniform2f(U.uMouse, state.mouse[0], state.mouse[1]);
    gl.uniform1f(U.uMouseOn, state.mouseOn);
    gl.uniform3fv(U.uFocus, state.focus);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  let last = 0, raf = 0;
  function frame(now) {
    raf = 0;
    if (!state.running) return;
    const dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    state.time += dt;
    state.mouseOn += (state.mouseTarget - state.mouseOn) * Math.min(1, dt * 6);
    for (let i = 0; i < 3; i++) state.focus[i] += (state.focusTarget[i] - state.focus[i]) * Math.min(1, dt * 5);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (reduce || state.running || !state.visible || document.hidden) return;
    state.running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    state.running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  seed();
  colors();
  resize();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; state.visible ? start() : stop(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  if (!reduce) {
    const host = canvas.closest(".hero");
    host.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      state.mouse = [((e.clientX - r.left) / r.width * 2 - 1) * state.aspect, -((e.clientY - r.top) / r.height * 2 - 1)];
      state.mouseTarget = 1;
    });
    host.addEventListener("pointerleave", () => { state.mouseTarget = 0; });
  }
  start();

  return {
    get layout() { return layout; },
    setFocus(zone) {
      state.focusTarget = [0, 1, 2].map((z) => (z === zone ? 1 : 0));
      if (reduce) { state.focus = state.focusTarget.slice(); draw(); }
    },
    setSort(v) { state.sort = v; if (!state.running) draw(); },
    refreshColors() { colors(); draw(); },
    // lane positions in screen fractions, for the labels
    labels() {
      const toY = (y) => (1 - (y + 1) / 2) * 100;
      return { ok: toY(narrow() ? 0.62 : 0.66) - 6, human: toY(-0.84) - 3, gate: layout.gateX * 100 };
    },
  };
}
