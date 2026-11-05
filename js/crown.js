// Faceted glass crown for the voter page hero.
// Refracts a hand-built studio environment, splits light into a spectrum along facet edges
// (more dispersion at grazing angles), carries a blue tint, and turns slowly.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

const host = document.getElementById("hero-crown");
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function supportsWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch (e) { return false; }
}

if (host && supportsWebGL()) start();

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  // ---------- environment: dark blue studio with bright softboxes and party lights ----------
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 vDir; void main(){ float h = vDir.y; vec3 c = mix(vec3(0.008,0.014,0.035), vec3(0.06,0.12,0.32), smoothstep(-0.3,1.0,h)); c += vec3(0.02,0.05,0.12) * pow(1.0-abs(h), 6.0); gl_FragColor = vec4(c,1.0); }"
    })
  ));
  const panel = (w, h, rgb, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(7, 7, [4.0, 4.2, 4.6], 0, 11, 1);                // overhead softbox
  panel(1.4, 12, [2.6, 3.0, 3.8], -9, 1, 3);             // cool strip, left
  panel(1.0, 12, [3.4, 3.4, 3.4], 9, 0, -2);             // white strip, right
  panel(12, 1.1, [3.2, 2.2, 0.9], 0, -1.5, -10);         // warm gold bar behind (ties to the site's gold)
  panel(9, 1.4, [0.5, 1.2, 3.6], 0, -3.5, 9);            // blue floor bounce, front
  panel(1.0, 7, [1.2, 2.0, 4.0], 7, 4, 7);               // blue kicker
  for (let i = 0; i < 18; i++) {                         // ring of small party lights
    const a = (i / 18) * Math.PI * 2;
    panel(0.45, 0.45, i % 3 === 0 ? [5, 4.2, 2.4] : [4.5, 4.8, 5.5], Math.cos(a) * 11, 5 + Math.sin(i * 1.7) * 1.5, Math.sin(a) * 11);
  }
  const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
  cubeCam.update(renderer, env);

  // ---------- dispersive glass material ----------
  const glass = (tint, ior, spread) => new THREE.ShaderMaterial({
    uniforms: {
      uEnv: { value: cubeRT.texture },
      uTint: { value: new THREE.Color(...tint) },
      uIor: { value: ior },
      uSpread: { value: spread },
      uExposure: { value: 1.3 }
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform samplerCube uEnv; uniform vec3 uTint; uniform float uIor; uniform float uSpread; uniform float uExposure;
      varying vec3 vN; varying vec3 vP;
      const int SAMPLES = 12;
      // Weight of red, green and blue for a point t in [0,1] along the visible spectrum (red -> violet).
      vec3 spectral(float t){
        vec3 w = 1.0 - abs(4.0 * t - vec3(0.6, 2.0, 3.4)) / 1.4;
        w.r += 0.35 * clamp(1.0 - abs(4.0 * t - 3.9) / 0.6, 0.0, 1.0); // violet tail
        return clamp(w, 0.0, 1.0);
      }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      void main(){
        vec3 I = normalize(vP - cameraPosition);
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        float ndv = clamp(dot(-I, N), 0.0, 1.0);
        float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        float edge = pow(1.0 - ndv, 1.6);              // grazing facets split light the most
        vec3 acc = vec3(0.0); vec3 wsum = vec3(0.0);
        for (int i = 0; i < SAMPLES; i++) {
          float t = (float(i) + 0.5) / float(SAMPLES);
          float ior = uIor + (t - 0.5) * uSpread * (0.5 + 3.0 * edge);
          vec3 d = refract(I, N, 1.0 / ior);
          // fake second interface: bend again on the way out through a tilted back facet
          vec3 back = normalize(-N + 0.55 * vec3(N.z, -N.x, N.y));
          vec3 d2 = refract(d, back, ior);
          if (dot(d2, d2) < 0.001) d2 = reflect(d, back);  // total internal reflection
          vec3 w = spectral(t);
          acc += textureCube(uEnv, d2, 1.2).rgb * w;   // slight blur keeps tiny lights from sparkling into noise
          wsum += w;
        }
        vec3 refr = acc / wsum * uTint;
        vec3 refl = textureCube(uEnv, reflect(I, N)).rgb;
        vec3 col = mix(refr, refl, fres);
        vec3 L = normalize(vec3(-0.35, 0.9, 0.55));
        col += pow(max(dot(reflect(I, N), L), 0.0), 140.0) * 4.0 * mix(vec3(0.75,0.85,1.0), vec3(1.0), fres);
        col = aces(col * uExposure);
        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
      }`
  });

  // ---------- faceted crown geometry ----------
  function crownGeometry() {
    const POINTS = 6, A = POINTS * 2, T = 0.12;
    // rows bottom -> top: [y, radius, angular offset in half-steps]
    const row = (k, i) => {
      if (k === 0) return [-0.66, 0.9, 0];
      if (k === 1) return [-0.42, 1.0, 0.5];
      if (k === 2) return [-0.14, 1.03, 0];
      if (k === 3) return i % 2 === 0 ? [0.36, 1.1, 0.0] : [0.12, 1.04, 0];
      return i % 2 === 0 ? [0.98, 1.2, 0] : [0.2, 1.05, 0];
    };
    const ROWS = 5;
    const P = (k, i, inner) => {
      const [y, r, off] = row(k, ((i % A) + A) % A);
      const a = ((i + off) / A) * Math.PI * 2;
      const rr = inner ? r - T : r;
      return [Math.cos(a) * rr, y, Math.sin(a) * rr];
    };
    const pos = [];
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let k = 0; k < ROWS - 1; k++) for (let i = 0; i < A; i++) {
      const j = i + 1;
      tri(P(k, i), P(k + 1, i), P(k, j)); tri(P(k, j), P(k + 1, i), P(k + 1, j));                   // outside
      tri(P(k, i, 1), P(k, j, 1), P(k + 1, i, 1)); tri(P(k, j, 1), P(k + 1, j, 1), P(k + 1, i, 1)); // inside
    }
    const top = ROWS - 1;
    for (let i = 0; i < A; i++) {
      const j = i + 1;
      tri(P(top, i), P(top, i, 1), P(top, j)); tri(P(top, j), P(top, i, 1), P(top, j, 1));          // top rim
      tri(P(0, i), P(0, j), P(0, i, 1)); tri(P(0, j), P(0, j, 1), P(0, i, 1));                      // bottom rim
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals(); // non-indexed, so every triangle keeps its own flat facet normal
    return g;
  }

  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(crownGeometry(), glass([0.55, 0.76, 1.0], 1.75, 0.16)));

  const gemMat = glass([0.32, 0.56, 1.0], 2.15, 0.24);
  const tipGeo = new THREE.IcosahedronGeometry(0.085, 0);
  const bandGeo = new THREE.OctahedronGeometry(0.12, 0);
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2;
    const tip = new THREE.Mesh(tipGeo, gemMat);
    tip.position.set(Math.cos(a) * 1.2, 1.07, Math.sin(a) * 1.2);
    crown.add(tip);
    const b = (p + 0.5) / 6 * Math.PI * 2;
    const gem = new THREE.Mesh(bandGeo, gemMat);
    gem.position.set(Math.cos(b) * 1.06, -0.28, Math.sin(b) * 1.06);
    gem.scale.set(1, 1.35, 0.55);
    gem.lookAt(Math.cos(b) * 3, -0.28, Math.sin(b) * 3);
    crown.add(gem);
  }

  const scene = new THREE.Scene();
  scene.add(crown);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.05, 5.6);
  camera.lookAt(0, 0.12, 0);

  // ---------- size, loop, visibility ----------
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  let visible = true, last = performance.now(), angle = 0.35, raf = 0, first = true;
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!REDUCED) angle += dt * 0.32;                       // about one turn every 20 seconds
    const t = now / 1000;
    crown.rotation.y = angle;
    crown.rotation.x = 0.16 + (REDUCED ? 0 : Math.sin(t * 0.45) * 0.05);
    crown.rotation.z = REDUCED ? 0 : Math.sin(t * 0.33) * 0.035;
    crown.position.y = REDUCED ? 0 : Math.sin(t * 0.7) * 0.04;
    renderer.render(scene, camera);
    if (first) { first = false; host.classList.add("live"); }
    if (!REDUCED && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(host);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); host.classList.remove("live"); });
  kick();
}
