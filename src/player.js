// One player UI for two kinds of demo:
//  - "frame": the patched HTML animation in an iframe (demo/*/?embed), driven by postMessage
//  - "video": the HR reel, an MP4 cut at 2x (media/make-hr-reel.py)
// Both report the same state: chapter names and weights, current chapter, progress, caption.

// Chapter starts come from media/hr-chapters.json; captions from the HR README and the recording's overlays
const HR = {
  rate: 2,
  duration: 86.55,
  chapters: [
    [0, "Pulpit i tablica pracowników", "Logowanie z listy dostępu, liczniki dokumentów, tablica pracowników i kafelek projektu z adresem budowy."],
    [7.67, "Synchronizacja z Dyskiem Google", "Jedno kliknięcie dopasowuje foldery pracowników, zdjęcia i daty z nazw plików. Plik bez daty w nazwie czeka na odczyt treści."],
    [16.28, "Profil pracownika i PDF", "Profil-koło: informacje, doświadczenie, wynagrodzenie i czas pracy. Profil kompetencji w PDF po polsku, niemiecku albo angielsku."],
    [26.82, "Lista „Do sprawdzenia”", "Daty odczytane z treści dokumentów czekają na człowieka. HR zatwierdza albo pomija, a kalendarz pokazuje ważność dokumentów."],
    [36.47, "Zgłoszenia i ocena AI", "Trzy zgłoszenia z formularza Tally. AI ocenia CV względem ogłoszenia, a reguły wiarygodności i próg z ustawień pilnują wyniku."],
    [48.12, "Umawianie spotkania", "Termin w aplikacji i w kalendarzu zespołu. Wpis trafia do historii kandydata."],
    [58.17, "Kandydat ręcznie i duplikaty", "Ręczne dodanie kandydata z ostrzeżeniem o możliwym duplikacie, wyszukiwanie po telefonie, zmiana statusu i notatka."],
    [70.17, "Tabela „Po spotkaniu”", "Status i ocenę po rozmowie edytuje się w miejscu. Każda zmiana trafia do historii."],
    [75.28, "Ustawienia i role", "Lista dostępu, próg AI, retencja kandydatów i folder KADRY. Rola Podgląd nie dostaje z serwera PESEL-u ani płac."],
  ],
};

const SPEEDS = [1, 1.5, 2];
const label = (s) => `${String(s).replace(".", ",")}×`;
const all = new Set();

class Player {
  constructor(el, reduce) {
    this.el = el;
    this.kind = el.dataset.kind;
    this.reduce = reduce;
    this.screen = el.querySelector(".player-screen");
    this.track = el.querySelector(".pl-track");
    this.num = el.querySelector(".pl-num");
    this.kicker = el.querySelector(".pl-kicker");
    this.text = el.querySelector(".pl-text");
    this.toggleBtn = el.querySelector(".pl-toggle");
    this.speedBtn = el.querySelector(".pl-speed");
    this.speed = parseFloat(el.dataset.speed) || 1;
    this.s = { names: [], weights: [], cur: 0, progress: 0, paused: true, ended: false, kicker: "", caption: "" };
    this.started = false;
    this.userPaused = false;
    this.inView = false;
    this.segs = [];

    this.toggleBtn.addEventListener("click", () => this.toggle(true));
    el.querySelector(".player-big").addEventListener("click", () => this.toggle(true));
    this.speedBtn.addEventListener("click", () => this.cycleSpeed());
    el.querySelector(".pl-full").addEventListener("click", () => this.fullscreen());
    this.track.addEventListener("click", (e) => {
      const b = e.target.closest(".seg");
      if (b) this.chapter(+b.dataset.i);
    });
    all.add(this);

    if (this.kind === "video") this.initVideo();
    else this.initFrame();
    this.observe();
    this.paint();
  }

  // ---------- iframe ----------
  initFrame() {
    this.ready = false;
    window.addEventListener("message", (e) => {
      if (!this.frame || e.source !== this.frame.contentWindow || !e.data || e.data.demo !== "state") return;
      const d = e.data;
      if (!this.ready) {
        this.ready = true;
        this.send("speed", this.speed);
        if (this.wantPlay) this.send("play");
        setTimeout(() => this.el.classList.add("is-ready"), 120);
      }
      Object.assign(this.s, { names: d.names, weights: d.est || this.s.weights, cur: d.cur, progress: d.progress, paused: d.paused, ended: d.ended, kicker: d.kicker, caption: d.caption });
      this.base = { p: d.progress, t: performance.now() };
      this.paint();
      if (!d.paused && !d.ended) this.frameLoop();
    });
  }
  // The iframe reports four times a second; in between, the bar is extrapolated at the current tempo
  frameLoop() {
    if (this.raf) return;
    const step = () => {
      this.raf = 0;
      if (this.s.paused || this.s.ended) return;
      this.paint();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  shownProgress() {
    const s = this.s;
    if (this.kind !== "frame" || !this.base || s.paused || s.ended) return s.progress;
    const total = s.weights.reduce((a, b) => a + b, 0) || 1;
    const chapterEnd = s.weights.slice(0, s.cur + 1).reduce((a, b) => a + b, 0) / total;
    let p = Math.min(chapterEnd, this.base.p + ((performance.now() - this.base.t) * this.speed) / total);
    if (this.shown && this.shown.cur === s.cur) p = Math.max(p, this.shown.p);
    return p;
  }
  mountFrame() {
    if (this.frame) return;
    const f = document.createElement("iframe");
    f.src = this.el.dataset.src;
    f.title = `Animacja dnia pracy: ${this.el.closest(".case")?.querySelector(".case-title")?.textContent ?? ""}`;
    f.setAttribute("tabindex", "-1");
    f.setAttribute("aria-hidden", "true");
    f.setAttribute("loading", "eager");
    this.screen.insertBefore(f, this.screen.querySelector(".player-big"));
    this.frame = f;
  }
  send(action, value) {
    if (this.frame && this.ready) this.frame.contentWindow.postMessage({ demo: "cmd", action, value }, "*");
  }

  // ---------- video ----------
  initVideo() {
    const v = (this.video = this.screen.querySelector("video"));
    const starts = HR.chapters.map((c) => c[0]);
    this.s.names = HR.chapters.map((c) => c[1]);
    this.s.weights = starts.map((t, i) => (starts[i + 1] ?? HR.duration) - t);
    const sync = () => {
      const t = v.currentTime, d = v.duration || HR.duration;
      let cur = 0;
      while (cur < starts.length - 1 && t >= starts[cur + 1]) cur++;
      Object.assign(this.s, { cur, progress: Math.min(1, t / d), paused: v.paused, ended: v.ended, kicker: HR.chapters[cur][1], caption: HR.chapters[cur][2] });
      this.paint();
    };
    let raf = 0;
    const loop = () => { sync(); raf = v.paused ? 0 : requestAnimationFrame(loop); };
    v.addEventListener("play", () => { if (!raf) raf = requestAnimationFrame(loop); });
    for (const ev of ["pause", "ended", "seeked", "loadedmetadata"]) v.addEventListener(ev, sync);
    v.addEventListener("loadeddata", () => this.el.classList.add("is-ready"));
    v.playbackRate = this.speed / HR.rate;
    v.addEventListener("click", () => this.toggle(true));
  }

  // ---------- shared ----------
  observe() {
    // Autoplay only once the player has stayed mostly in view for 300 ms, so jumping past it to an
    // anchor neither starts nor loads anything
    let autoT = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        this.inView = e.intersectionRatio >= 0.55;
        clearTimeout(autoT);
        if (this.inView && !this.userPaused && !this.reduce && !this.s.ended) {
          autoT = setTimeout(() => { if (this.inView && !this.userPaused && !this.s.ended) this.play(); }, 300);
        } else if (e.intersectionRatio < 0.2 && !this.s.paused) this.pause();
      },
      { threshold: [0, 0.2, 0.55, 0.8], rootMargin: "0px" },
    );
    io.observe(this.el);
    // load early (when within ~a screen) but only if it stays near for 250 ms
    let nearT = 0;
    const near = new IntersectionObserver(
      ([e]) => {
        clearTimeout(nearT);
        if (e.isIntersecting) nearT = setTimeout(() => { this.mount(); near.disconnect(); }, 250);
      },
      { rootMargin: "120% 0px" },
    );
    near.observe(this.el);
  }
  mount() {
    if (this.kind === "frame") this.mountFrame();
    else if (this.video.preload === "none") { this.video.preload = "auto"; this.video.load(); }
  }
  play() {
    for (const p of all) if (p !== this && !p.s.paused) p.pause();
    this.started = true;
    if (this.kind === "video") {
      if (this.video.ended) this.video.currentTime = 0;
      this.video.play().catch(() => { this.s.paused = true; this.paint(); });
    } else {
      this.mount();
      this.wantPlay = true;
      this.send("play");
      this.base = { p: this.s.progress, t: performance.now() };
      this.frameLoop();
    }
    this.s.paused = false;
    this.paint();
  }
  pause() {
    if (this.kind === "video") this.video.pause();
    else { this.wantPlay = false; this.send("pause"); }
    this.s.paused = true;
    this.paint();
  }
  toggle(byUser) {
    if (this.s.paused || this.s.ended) { this.userPaused = false; this.play(); }
    else { if (byUser) this.userPaused = true; this.pause(); }
  }
  chapter(i) {
    for (const p of all) if (p !== this && !p.s.paused) p.pause();
    this.userPaused = false;
    this.started = true;
    if (this.kind === "video") {
      // a seek before the metadata is in would be undone by load(), so wait for it
      const seek = () => {
        this.video.currentTime = HR.chapters[i][0] + 0.05;
        this.video.play().catch(() => { this.s.paused = true; this.paint(); });
      };
      this.mount();
      if (this.video.readyState >= 1) seek();
      else this.video.addEventListener("loadedmetadata", seek, { once: true });
    } else {
      this.mount();
      this.wantPlay = true;
      this.send("chapter", i);
    }
  }
  cycleSpeed() {
    this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
    this.speedBtn.textContent = label(this.speed);
    this.speedBtn.setAttribute("aria-label", `Tempo ${label(this.speed)}, zmień`);
    if (this.kind === "video") this.video.playbackRate = this.speed / HR.rate;
    else {
      this.send("speed", this.speed);
      if (this.shown) this.base = { p: this.shown.p, t: performance.now() };
    }
  }
  fullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (this.el.requestFullscreen) return this.el.requestFullscreen().catch(() => {});
    if (this.kind === "video" && this.video.webkitEnterFullscreen) return this.video.webkitEnterFullscreen();
    const n = this.s.cur + 1;
    window.open(`${this.el.dataset.full}#${n}`, "_blank", "noopener");
  }

  buildTrack() {
    const { names, weights } = this.s;
    const total = weights.reduce((a, b) => a + b, 0) || names.length;
    this.track.innerHTML = names
      .map((n, i) => `<button type="button" class="seg" data-i="${i}" style="--w:${(((weights[i] || total / names.length) / total) * 100).toFixed(2)}" aria-label="Rozdział ${i + 1}: ${n}"><i></i><span class="seg-tip">${n}</span></button>`)
      .join("");
    this.segs = [...this.track.children];
    this.builtFor = names.join("|");
    this.paintedCur = undefined;
  }
  paint() {
    const s = this.s;
    if (s.names.length && this.builtFor !== s.names.join("|")) this.buildTrack();
    const total = s.weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const prog = this.shownProgress();
    this.shown = { cur: s.cur, p: prog };
    const at = prog * total;
    const curChanged = this.paintedCur !== s.cur;
    this.paintedCur = s.cur;
    this.segs.forEach((seg, i) => {
      const w = s.weights[i] || 0;
      const p = i < s.cur ? 1 : i > s.cur ? 0 : Math.max(0, Math.min(1, (at - acc) / (w || 1)));
      seg.style.setProperty("--p", s.ended ? 1 : p.toFixed(4));
      if (curChanged) {
        if (i === s.cur) seg.setAttribute("aria-current", "step");
        else seg.removeAttribute("aria-current");
      }
      acc += w;
    });
    const num = s.names.length ? `${s.cur + 1}/${s.names.length}` : this.num.textContent;
    if (this.num.textContent !== num) this.num.textContent = num;
    if (s.kicker && this.kicker.textContent !== s.kicker) {
      this.kicker.textContent = s.kicker;
      const head = this.kicker.parentElement;
      head.classList.remove("swap");
      void head.offsetWidth;
      head.classList.add("swap");
    }
    if (s.caption && this.text.textContent !== s.caption) {
      this.text.textContent = s.caption;
      this.text.classList.remove("swap");
      void this.text.offsetWidth;
      this.text.classList.add("swap");
    }
    const playing = !s.paused && !s.ended;
    const state = `${playing}|${s.ended}|${this.started}`;
    if (this.paintedState === state) return;
    this.paintedState = state;
    this.el.classList.toggle("is-playing", playing);
    this.el.classList.toggle("is-ended", s.ended);
    this.el.classList.toggle("show-big", !playing && (!this.started || s.ended));
    this.toggleBtn.setAttribute("aria-label", s.ended ? "Odtwórz od początku" : playing ? "Pauza" : "Odtwórz");
  }
}

export function initPlayers(reduce) {
  return [...document.querySelectorAll("[data-player]")].map((el) => new Player(el, reduce));
}
