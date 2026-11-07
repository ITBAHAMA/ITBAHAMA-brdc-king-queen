// Shared helpers and live data for index.html (voters) and admin.html (organizers).
(() => {
  const C = window.KQ_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const CATS = [
    { key: "king", label: "King", title: "King of the Night" },
    { key: "queen", label: "Queen", title: "Queen of the Night" }
  ];
  const STATUSES = ["setup", "open", "closed", "revealed"];
  const STATUS_LABEL = { setup: "Opening soon", open: "Voting open", closed: "Voting closed", revealed: "Winners crowned" };
  const CROWN = '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.5 4.6 7.8l4.6 4.1L12 4.6l2.8 7.3 4.6-4.1L21 17.5z"/><rect fill="currentColor" x="3" y="19" width="18" height="2.2" rx="1.1"/></svg>';
  const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  function svg(markup) { const t = document.createElement("template"); t.innerHTML = markup; return t.content.firstChild; }
  const crown = () => svg(CROWN);
  const camera = () => svg(CAMERA);
  const initials = n => (n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";

  function photo(n) {
    const box = h("div", { class: "ph" });
    const src = n && typeof n.photo === "string" && n.photo.startsWith("data:image/") ? n.photo : null;
    if (src) {
      const img = h("img", { src, alt: "", loading: "lazy" });
      img.addEventListener("error", () => img.replaceWith(h("span", { class: "mono", text: initials(n.name) })));
      box.append(img);
    } else box.append(h("span", { class: "mono", text: initials(n && n.name) }));
    return box;
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
  }

  // Resize a photo to max 520px and return a JPEG data URL (~30–60 KB).
  async function photoToDataUrl(file) {
    let source;
    try { source = await createImageBitmap(file); }
    catch (e) {
      source = await new Promise((res, rej) => {
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("unreadable")); };
        img.src = url;
      });
    }
    const w = source.width, hgt = source.height;
    const sc = Math.min(1, 520 / Math.max(w, hgt));
    const c = document.createElement("canvas");
    c.width = Math.round(w * sc); c.height = Math.round(hgt * sc);
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    let q = 0.82, out = c.toDataURL("image/jpeg", q);
    while (out.length > 380000 && q > 0.4) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
    return out;
  }

  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  const ERRORS = {
    bad_pin: "Wrong PIN.",
    locked: "Too many wrong PINs. Wait 5 minutes and try again.",
    closed: "Voting isn't open right now.",
    invalid: "That didn't go through. Refresh the page and try again.",
    already_voted: "This device has already voted.",
    need_nominees: "Add at least one King and one Queen nominee first.",
    short_pin: "Use at least 6 characters for the new PIN."
  };
  function errText(e) {
    if (e && typeof e === "object" && e.error && ERRORS[e.error]) return ERRORS[e.error];
    if (e && /fetch|network/i.test(String(e.message || ""))) return "No connection. Check your internet and try again.";
    return "Something went wrong. Try again.";
  }

  function winners(rows) {
    rows = Array.isArray(rows) ? rows : [];
    const top = rows.length ? rows[0].votes : 0;
    return top > 0 ? rows.filter(r => r.votes === top) : [];
  }

  // ---------- live store ----------
  // Phones poll one tiny call (kq_state). When nothing changed it returns only {rev}, a few bytes.
  // Photos are downloaded separately, only when new or changed, and kept on the phone.
  // No live-update (Realtime) connections are used, so the shared connection pool is left alone.
  const store = { settings: null, nominees: [], results: null, loaded: false, offline: false, rev: null };
  const listeners = [];
  const emit = () => listeners.forEach(fn => { try { fn(store); } catch (e) { console.error(e); } });

  // photo cache: memory first, then this phone's storage, then the network
  const PHOTO_PREFIX = "kq_ph:";
  const mem = new Map();
  const pkey = (id, v) => PHOTO_PREFIX + id + ":" + v;
  function cachedPhoto(id, v) {
    const k = pkey(id, v);
    if (mem.has(k)) return mem.get(k);
    try { const x = localStorage.getItem(k); if (x) { mem.set(k, x); return x; } } catch (e) {}
    return null;
  }
  function keepPhoto(id, v, data) {
    const k = pkey(id, v); mem.set(k, data);
    try { localStorage.setItem(k, data); } catch (e) { /* storage full or blocked: memory cache still works */ }
  }
  function prunePhotos(keep) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PHOTO_PREFIX) && !keep.has(k)) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  let photoFetching = false;
  async function fillPhotos() {
    if (photoFetching) return;
    const missing = store.nominees.filter(n => n.photo_v && !cachedPhoto(n.id, n.photo_v));
    if (!missing.length) return;
    photoFetching = true;
    try {
      for (let i = 0; i < missing.length; i += 8) {           // small batches: first photos show sooner
        const ids = missing.slice(i, i + 8).map(n => n.id);
        const { data, error } = await sb.from("kq_nominees").select("id,photo,photo_v").in("id", ids);
        if (error) throw error;
        for (const row of data || []) if (row.photo && row.photo_v) keepPhoto(row.id, row.photo_v, row.photo);
        applyPhotos(); emit();
      }
    } catch (e) { /* try again on the next poll */ }
    finally { photoFetching = false; }
  }
  function applyPhotos() {
    for (const n of store.nominees) n.photo = n.photo_v ? cachedPhoto(n.id, n.photo_v) : null;
  }

  let opts = { fast: false }, timer = null, failures = 0, inflight = null;
  function interval() {
    if (store.offline) return Math.min(30000, 3000 * Math.pow(2, Math.min(failures, 4)));
    if (opts.fast) return 3000;
    const st = store.settings && store.settings.status;
    return st === "closed" ? 3000 : st === "open" ? 6000 : st === "revealed" ? 20000 : 12000;
  }
  async function poll() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const data = await rpc("kq_state", { p_rev: store.rev });
        failures = 0;
        const wasOffline = store.offline; store.offline = false;
        if (data && data.status) {
          store.rev = data.rev;
          store.settings = { status: data.status, event_name: data.event_name };
          store.nominees = (data.nominees || []).filter(n => n.category === "king" || n.category === "queen");
          store.results = data.results || null;
          applyPhotos();
          prunePhotos(new Set(store.nominees.filter(n => n.photo_v).map(n => pkey(n.id, n.photo_v))));
          store.loaded = true; emit();
          fillPhotos();
        } else if (wasOffline || !store.loaded) { store.loaded = true; emit(); }
      } catch (e) {
        failures++;
        if (!store.offline || !store.loaded) { store.offline = true; store.loaded = true; emit(); }
      } finally { inflight = null; }
    })();
    return inflight;
  }
  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;                        // phones in pockets stop polling
    timer = setTimeout(async () => { await poll(); schedule(); }, interval());
  }
  // Ask for fresh data soon (after an organizer action). Several calls in a row collapse into one.
  let soon = null;
  function queue() { clearTimeout(soon); soon = setTimeout(async () => { await poll(); schedule(); }, 150); }
  function refreshAll() { store.rev = null; queue(); }

  async function start(o) {
    opts = Object.assign(opts, o || {});
    await poll();
    schedule();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearTimeout(timer);
      else { poll().then(schedule); }
    });
    window.addEventListener("online", () => { poll().then(schedule); });
  }

  const status = () => { const s = store.settings && store.settings.status; return STATUSES.includes(s) ? s : "setup"; };
  const eventName = () => (store.settings && store.settings.event_name) || C.defaultEvent;
  const byCat = cat => store.nominees.filter(n => n.category === cat);
  const nomById = id => store.nominees.find(n => n.id === id);

  window.KQ = {
    sb, C, CATS, STATUSES, STATUS_LABEL, h, crown, camera, initials, photo, toast, photoToDataUrl,
    rpc, errText, winners, store, onChange: fn => listeners.push(fn), start, refreshAll, queue,
    status, eventName, byCat, nomById
  };
})();
