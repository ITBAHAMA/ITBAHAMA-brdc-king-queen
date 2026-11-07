// Floating dots behind the voter page hero.
// 60–80 dots drift upward with depth: far dots are small, faint and slow; near dots are larger,
// brighter and faster. Dots wrap from the top back to the bottom.
// Plain 2D canvas (no WebGL), colours from the site's CSS tokens, pauses when hidden or off-screen,
// and draws a single still frame for people who turn on reduced motion.
(() => {
  const canvas = document.getElementById("hero-dots");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN_DOTS = 60, MAX_DOTS = 80;

  // Colours come from the design tokens so the dots follow the site palette.
  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const GOLD = token("--gold", [220, 181, 99]);
  const GREEN = token("--green-hi", [140, 199, 98]);
  const IVORY = token("--text", [238, 241, 231]);

  let w = 0, h = 0, dpr = 1, dots = [];

  function makeDot(randomY) {
    const z = Math.pow(Math.random(), 1.6);          // more far dots than near ones, like real depth
    const roll = Math.random();
    const rgb = roll < 0.55 ? GOLD : roll < 0.85 ? GREEN : IVORY;
    return {
      z,
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h + Math.random() * 40,
      r: 0.6 + z * 2.2,                               // radius: 0.6 px far -> 2.8 px near
      speed: 7 + z * 38,                              // px per second: 7 far -> 45 near
      alpha: 0.18 + z * 0.62,
      sway: 3 + z * 10,                               // gentle side-to-side drift
      swayRate: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.6 + Math.random() * 1.4,
      rgb
    };
  }

  function targetCount() {
    // Scale with the hero's area, always between 60 and 80.
    const area = w * h;
    return Math.max(MIN_DOTS, Math.min(MAX_DOTS, Math.round(area / 9000)));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nw = Math.max(1, Math.round(rect.width)), nh = Math.max(1, Math.round(rect.height));
    const ndpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nw === w && nh === h && ndpr === dpr && dots.length) return;
    const sx = w ? nw / w : 1, sy = h ? nh / h : 1;
    w = nw; h = nh; dpr = ndpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!dots.length) {
      for (let i = 0; i < targetCount(); i++) dots.push(makeDot(true));
    } else {
      for (const d of dots) { d.x *= sx; d.y *= sy; }  // keep the scene when the hero changes size
      const n = targetCount();
      while (dots.length < n) dots.push(makeDot(true));
      if (dots.length > n) dots.length = n;
    }
    dots.sort((a, b) => a.z - b.z);                   // far dots first, near dots drawn on top
    if (REDUCED || !running) draw(performance.now() / 1000);
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const x = d.x + Math.sin(t * d.swayRate + d.phase) * d.sway;
      const a = d.alpha * (0.75 + 0.25 * Math.sin(t * d.twinkle + d.phase));
      const [r, g, b] = d.rgb;
      if (d.z > 0.62) {                               // soft glow on the nearest dots
        const halo = d.r * 3.2;
        const grd = ctx.createRadialGradient(x, d.y, 0, x, d.y, halo);
        grd.addColorStop(0, `rgba(${r},${g},${b},${(a * 0.35).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x, d.y, halo, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  let raf = 0, last = 0, running = false, onScreen = true;
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    for (const d of dots) {
      d.y -= d.speed * dt;
      if (d.y < -d.r * 4) {                           // wrap: re-enter from the bottom at a new spot
        d.y = h + d.r * 4 + Math.random() * 20;
        d.x = Math.random() * w;
      }
    }
    draw(now / 1000);
    if (running) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (REDUCED || running || !onScreen || document.hidden) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => { onScreen = es[0].isIntersecting; onScreen ? play() : pause(); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", () => { document.hidden ? pause() : play(); });
  if (window.matchMedia) {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => location.reload();       // rare; simplest way to switch modes cleanly
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener && mq.addListener(onChange);
  }

  resize();
  if (REDUCED) draw(0); else play();
})();
