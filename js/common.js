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
  const store = { settings: null, nominees: [], results: null, loaded: false, offline: false };
  const listeners = [];
  const emit = () => listeners.forEach(fn => { try { fn(store); } catch (e) { console.error(e); } });

  async function fetchSettings() {
    const { data, error } = await sb.from("kq_settings").select("status,event_name").eq("id", 1).maybeSingle();
    if (error) throw error;
    store.settings = data;
  }
  async function fetchNominees() {
    const { data, error } = await sb.from("kq_nominees").select("id,name,category,unit,photo,created_at").order("created_at");
    if (error) throw error;
    store.nominees = (data || []).filter(n => n.category === "king" || n.category === "queen");
  }
  async function fetchResults() {
    const { data, error } = await sb.from("kq_results").select("data").eq("id", 1).maybeSingle();
    if (error) throw error;
    store.results = data ? data.data : null;
  }
  const fetchers = { kq_settings: fetchSettings, kq_nominees: fetchNominees, kq_results: fetchResults };

  let pending = new Set(), timer = null;
  function queue(table) {
    pending.add(table);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const tables = [...pending]; pending = new Set();
      try { await Promise.all(tables.map(t => fetchers[t]())); store.offline = false; }
      catch (e) { store.offline = true; }
      emit();
    }, 250);
  }
  const refreshAll = () => Object.keys(fetchers).forEach(queue);

  async function start() {
    try {
      await Promise.all([fetchSettings(), fetchNominees(), fetchResults()]);
      store.offline = false;
    } catch (e) { store.offline = true; }
    store.loaded = true;
    emit();
    sb.channel("kq-public")
      .on("postgres_changes", { event: "*", schema: "public", table: "kq_settings" }, () => queue("kq_settings"))
      .on("postgres_changes", { event: "*", schema: "public", table: "kq_nominees" }, () => queue("kq_nominees"))
      .on("postgres_changes", { event: "*", schema: "public", table: "kq_results" }, () => queue("kq_results"))
      .subscribe();
    // Safety net if live updates drop: light refresh of status and results, full refresh on return to the tab.
    setInterval(() => { if (!document.hidden) { queue("kq_settings"); queue("kq_results"); } }, 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
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
