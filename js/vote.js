// Voter page: one ballot per device.
(() => {
  const { h, crown, photo, toast, rpc, errText, winners, store, CATS, STATUS_LABEL, status, eventName, byCat, nomById } = window.KQ;
  const $ = s => document.querySelector(s);

  // A random id kept on this phone/browser. Clearing site data or switching browsers creates a new one.
  const DEVICE = (() => {
    const make = () => (crypto.randomUUID ? crypto.randomUUID() :
      "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
    try {
      let v = localStorage.getItem("kq_device_id");
      if (!v || !/^[0-9a-f-]{36}$/i.test(v)) { v = make(); localStorage.setItem("kq_device_id", v); }
      return v;
    } catch (e) { return make(); }
  })();

  const S = { pick: { king: null, queen: null }, myVote: null, myLoaded: false, busy: false, view: null, returnFocus: null };
  // A category counts as voted only while that nominee still exists; if an organizer removes them,
  // the phone may pick again in that category (the server only fills in the missing half).
  const votedFor = key => { const id = S.myVote && S.myVote[key + "_id"]; return id && nomById(id) ? id : null; };
  const ballotDone = () => CATS.every(c => votedFor(c.key));
  const canPick = key => status() === "open" && S.myLoaded && !votedFor(key);
  const choiceFor = key => votedFor(key) || S.pick[key];

  async function loadMyVote() {
    try {
      const v = await rpc("kq_my_vote", { p_device: DEVICE });
      S.myVote = v && (v.king_id || v.queen_id) ? v : null;
      S.myLoaded = true;
    } catch (e) { /* try again on next update */ }
    render();
  }

  function notice(title, body, cls) {
    return h("div", { class: "notice " + (cls || "") }, crown(), h("div", null, h("h3", { text: title }), body ? h("p", { text: body }) : null));
  }

  function render() {
    const st = status();
    $("#pill").dataset.s = st;
    $("#pill-t").textContent = store.loaded ? STATUS_LABEL[st] : "Loading";
    $("#ev-eyebrow").textContent = eventName();
    $("#splash-ev").textContent = eventName();
    maybeEndSplash();
    renderNotice(); renderResults(); renderBallot(); renderCastbar(); renderProfile();
  }

  function renderNotice() {
    const box = $("#notice"); box.replaceChildren();
    const st = status(), mine = S.myVote;
    if (!store.loaded) { box.append(notice("Opening the ballot box…", null)); return; }
    if (store.offline && !store.settings) { box.append(notice("Can't reach the ballot box", "Check your internet connection. This page updates on its own once it connects.")); return; }
    const done = ballotDone();
    const picked = done ? `${nomById(mine.king_id).name} for King and ${nomById(mine.queen_id).name} for Queen` : "";
    const missing = CATS.filter(c => !votedFor(c.key)).map(c => c.label);
    if (st === "setup") box.append(notice("Voting opens soon", "The organizers are finalizing the nominees. Keep this page open; the ballot appears here automatically."));
    else if (st === "open" && done) box.append(notice("Your ballot is in", `You voted ${picked}. Winners are crowned at the end of the night.`, "voted"));
    else if (st === "open" && mine && S.myLoaded) box.append(notice("Finish your ballot", `A nominee you voted for is no longer on the ballot. Pick a new ${missing.join(" and ")}, then tap Cast ballot.`));
    else if (st === "closed") box.append(notice("Voting is closed", done ? `Thanks for voting. You picked ${picked}. Watch the stage for the reveal.` : "Ballots are being counted. Watch the stage for the reveal."));
  }

  function renderResults() {
    const sec = $("#results"), r = store.results;
    if (status() !== "revealed" || !r) { sec.hidden = true; sec.replaceChildren(); return; }
    sec.hidden = false; sec.replaceChildren();
    sec.append(h("div", { class: "results-head" },
      h("h2", { text: "The crowns go to…" }),
      h("span", { class: "muted", text: (n => `${n} ${n === 1 ? "ballot" : "ballots"} counted`)(Number(r.total) || 0) })));
    const wrap = h("div", { class: "winners" });
    for (const c of CATS) {
      const rows = Array.isArray(r[c.key]) ? r[c.key] : [];
      const ws = winners(rows);
      const total = rows.reduce((a, x) => a + (Number(x.votes) || 0), 0) || 1;
      const card = h("article", { class: "win" });
      if (!ws.length) {
        card.append(h("div", { class: "win-title" }, crown(), c.title), h("p", { class: "muted", text: "No votes were cast in this category." }));
      } else {
        const top = ws[0].votes;
        card.append(h("div", { class: "win-top" }, photo(nomById(ws[0].id) || ws[0]),
          h("div", { style: "min-width:0" },
            h("div", { class: "win-title" }, crown(), c.title),
            h("div", { class: "win-name", text: ws.map(x => x.name).join(" & ") }),
            h("div", { class: "unit", style: "padding:0", text: ws.map(x => x.unit).filter(Boolean).join(" · ") }),
            h("div", { class: "win-votes", text: `${top} ${top === 1 ? "vote" : "votes"} · ${Math.round(top / total * 100)}%` }))));
        if (ws.length > 1) card.append(h("span", { class: "tie", text: `${ws.length}-way tie` }));
        const rest = rows.filter(x => !ws.includes(x)).slice(0, 4);
        if (rest.length) card.append(h("ul", { class: "runners" }, rest.map(x => h("li", null, h("span", { text: x.name }), h("span", { text: `${x.votes} ${x.votes === 1 ? "vote" : "votes"}` })))));
      }
      wrap.append(card);
    }
    sec.append(wrap);
  }

  function renderBallot() {
    const sec = $("#ballot"); sec.replaceChildren();
    const st = status();
    if (!store.loaded || st === "revealed" || (!store.settings && store.offline)) { sec.hidden = true; return; }
    sec.hidden = false;
    for (const c of CATS) {
      const selectable = canPick(c.key), locked = !!votedFor(c.key);
      const list = byCat(c.key);
      const col = h("div", { class: "col" },
        h("div", { class: "col-head" },
          h("h2", null, crown(), c.title),
          h("span", { class: "count", text: `${list.length} ${list.length === 1 ? "nominee" : "nominees"}` })));
      if (!list.length) col.append(h("div", { class: "empty", text: `${c.label} nominees will appear here.` }));
      else {
        const grid = h("div", { class: "grid" });
        for (const n of list) {
          const myPick = choiceFor(c.key);
          const chosen = myPick === n.id;
          const ph = photo(n);
          withEye(ph, n);
          const card = h("div", {
            class: "nom" + (chosen ? " chosen" : "") + (myPick && !chosen && !selectable ? " dim" : ""),
            "data-id": n.id
          }, ph, h("div", { class: "nom-name", text: n.name }), n.unit ? h("div", { class: "unit", text: n.unit }) : null);
          if (chosen) card.append(h("span", { class: "seal" }, crown(), locked ? "Your vote" : "Your pick"));
          card.append(h("button", {
            type: "button", class: "nom-hit", "aria-haspopup": "dialog",
            "aria-label": `${n.name}, ${c.label} nominee${chosen ? (locked ? ", your vote" : ", your pick") : ""}. Open profile`,
            onclick: e => openProfile(n.id, e.currentTarget)
          }));
          grid.append(card);
        }
        col.append(grid);
      }
      sec.append(col);
    }
  }

  function renderCastbar() {
    for (const c of CATS) if (S.pick[c.key] && !nomById(S.pick[c.key])) S.pick[c.key] = null;
    const show = store.loaded && status() === "open" && S.myLoaded && !ballotDone() && byCat("king").length && byCat("queen").length;
    $("#castbar").hidden = !show;
    document.body.classList.toggle("has-bar", !!show);
    if (!show) { $("#confirm").hidden = true; return; }
    const picks = $("#picks"); picks.replaceChildren();
    const cf = $("#cf-picks"); cf.replaceChildren();
    for (const c of CATS) {
      const n = nomById(choiceFor(c.key));
      picks.append(h("div", null, h("small", { text: c.label }), n ? h("b", { text: n.name }) : h("b", { class: "none", text: "Not picked yet" })));
      cf.append(h("div", null, h("span", { text: c.label }), h("b", { text: n ? n.name : "—" })));
    }
    $("#cast-btn").disabled = !CATS.every(c => nomById(choiceFor(c.key))) || S.busy;
    $("#cf-go").disabled = S.busy;
  }

  // ---------- full photo viewer (eye button) ----------
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  const hasPhoto = n => typeof n.photo === "string" && n.photo.startsWith("data:image/");
  function withEye(ph, n) {
    if (!hasPhoto(n)) return ph;
    const t = document.createElement("template"); t.innerHTML = EYE;
    ph.append(h("button", {
      type: "button", class: "eye-btn", "aria-label": `View ${n.name}'s photo`,
      onclick: e => { e.stopPropagation(); openPhoto(n, e.currentTarget); }
    }, t.content.firstChild));
    return ph;
  }
  let lbReturn = null;
  function openPhoto(n, from) {
    lbReturn = from || null;
    $("#lb-img").src = n.photo;
    $("#lb-img").alt = `Photo of ${n.name}`;
    $("#lb-cap").textContent = n.name;
    $("#lightbox").hidden = false;
    $("#lb-close").focus();
  }
  function closePhoto() {
    if ($("#lightbox").hidden) return;
    $("#lightbox").hidden = true;
    $("#lb-img").removeAttribute("src");
    if (lbReturn && document.contains(lbReturn)) lbReturn.focus();
  }
  $("#lb-close").addEventListener("click", closePhoto);
  $("#lightbox").addEventListener("click", e => { if (e.target.id !== "lb-close") closePhoto(); });
  // Capture phase so Escape/arrows close the photo first instead of the profile underneath.
  document.addEventListener("keydown", e => {
    if ($("#lightbox").hidden) return;
    if (e.key === "Escape") closePhoto();
    if (["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  // ---------- nominee profile ----------
  function openProfile(id, from) {
    S.view = id; S.returnFocus = from || null;
    $("#profile").hidden = false;
    renderProfile();
    const primary = $("#pf-actions .btn-gold");
    (primary || $("#pf-close")).focus();
  }
  function closeProfile() {
    if ($("#profile").hidden) return;
    $("#profile").hidden = true; S.view = null;
    const id = S.returnFocus && S.returnFocus.closest ? (S.returnFocus.closest(".nom") || {}).dataset : null;
    const back = id && id.id ? document.querySelector(`.nom[data-id="${id.id}"] .nom-hit`) : null;
    if (back) back.focus();
  }
  function step(dir) {
    const n = nomById(S.view); if (!n) return;
    const list = byCat(n.category), i = list.findIndex(x => x.id === n.id);
    const next = list[i + dir]; if (!next) return;
    S.view = next.id; renderProfile();
  }
  function renderProfile() {
    const box = $("#profile");
    if (box.hidden) return;
    const n = nomById(S.view);
    if (!n || status() === "revealed") { closeProfile(); return; }
    const c = CATS.find(x => x.key === n.category);
    const list = byCat(n.category), i = list.findIndex(x => x.id === n.id);
    const st = status(), mine = S.myVote;
    const selectable = canPick(c.key);
    const picked = S.pick[c.key] === n.id, voted = votedFor(c.key) === n.id;

    $("#pf-photo").replaceChildren(withEye(photo(n), n));
    const cat = $("#pf-cat"); cat.replaceChildren(crown(), `Nominee for ${c.title}`);
    $("#pf-name").textContent = n.name;
    $("#pf-meta").textContent = list.length > 1 ? `${i + 1} of ${list.length} ${c.label} nominees` : "";
    $("#pf-prev").disabled = i <= 0;
    $("#pf-next").disabled = i >= list.length - 1;

    const acts = $("#pf-actions"); acts.replaceChildren();
    if (selectable) {
      if (picked) {
        acts.append(
          h("button", { type: "button", class: "btn", onclick: () => { S.pick[c.key] = null; render(); } }, "Remove pick"),
          h("button", { type: "button", class: "btn btn-gold", onclick: () => { closeProfile(); } }, "Done"));
      } else {
        acts.append(h("button", { type: "button", class: "btn btn-gold", onclick: () => {
          S.pick[c.key] = n.id; closeProfile(); render();
          const other = CATS.find(x => x.key !== c.key);
          toast(S.pick[other.key] ? `${n.name} picked. Tap Cast ballot when you're ready.` : `${n.name} picked for ${c.label}. Now pick a ${other.label}.`);
        } }, crown(), `Pick for ${c.label}`));
      }
    } else {
      let note = "";
      if (voted) note = `You voted for ${n.name} as ${c.label}.`;
      else if (votedFor(c.key)) note = `You've already voted for a ${c.label} from this phone.`;
      else if (st === "setup") note = "Voting opens soon. You can pick once it opens.";
      else if (st === "closed") note = "Voting is closed.";
      if (note) acts.append(h("p", { class: "muted", style: "margin:0;flex-basis:100%;font-size:.92rem", text: note }));
      acts.append(h("button", { type: "button", class: "btn", onclick: closeProfile }, "Close"));
    }
  }
  $("#pf-close").addEventListener("click", closeProfile);
  $("#pf-prev").addEventListener("click", () => step(-1));
  $("#pf-next").addEventListener("click", () => step(1));
  $("#profile").addEventListener("click", e => { if (e.target === e.currentTarget) closeProfile(); });
  document.addEventListener("keydown", e => {
    if ($("#profile").hidden) return;
    if (e.key === "Escape") closeProfile();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  // Swipe left/right on the photo to browse nominees.
  (() => {
    let x0 = null;
    const el = $("#pf-photo");
    el.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  async function cast() {
    if (S.busy) return;
    S.busy = true; render();
    try {
      const king = choiceFor("king"), queen = choiceFor("queen");
      const res = await rpc("kq_cast_vote", { p_device: DEVICE, p_king: king, p_queen: queen });
      if (res && res.ok) { toast("Ballot cast. Thanks for voting!"); S.myVote = { king_id: king, queen_id: queen }; S.pick = { king: null, queen: null }; }
      else { toast(errText(res)); if (res && res.error === "already_voted") await loadMyVote(); }
    } catch (e) { toast(errText(e)); }
    finally { S.busy = false; $("#confirm").hidden = true; render(); }
  }

  $("#cast-btn").addEventListener("click", () => { $("#confirm").hidden = false; $("#cf-go").focus(); });
  $("#cf-back").addEventListener("click", () => { $("#confirm").hidden = true; });
  $("#cf-go").addEventListener("click", cast);
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#confirm").hidden = true; });

  // ---------- opening splash ----------
  // Stays until nominees and this phone's ballot are loaded, and at least long enough for the crown to finish.
  const REPEAT = (() => { try { const r = sessionStorage.getItem("kq_seen_splash"); sessionStorage.setItem("kq_seen_splash", "1"); return !!r; } catch (e) { return false; } })();
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN_MS = REDUCED ? 400 : REPEAT ? 1100 : 2600;
  const MAX_MS = 9000;
  let splashDone = false, splashTimer = null;
  function endSplash() {
    if (splashDone) return;
    splashDone = true; clearTimeout(splashTimer);
    const sp = $("#splash");
    sp.classList.add("leave");
    document.body.classList.add("entering");
    setTimeout(() => { sp.hidden = true; document.body.classList.remove("entering"); }, 1100);
  }
  function maybeEndSplash() {
    if (splashDone) return;
    const ready = store.loaded && (S.myLoaded || store.offline);
    if (!ready) return;
    const wait = MIN_MS - performance.now();
    clearTimeout(splashTimer);
    if (wait <= 0) endSplash(); else splashTimer = setTimeout(endSplash, wait);
  }
  setTimeout(() => { if (!splashDone) $("#splash-status").textContent = "Still connecting… check your internet if this takes long."; }, 5500);
  setTimeout(endSplash, MAX_MS);

  window.KQ.onChange(() => {
    const stale = S.myVote && CATS.some(c => S.myVote[c.key + "_id"] && !nomById(S.myVote[c.key + "_id"]));
    if (!S.myLoaded || (status() === "setup" && S.myVote) || stale) loadMyVote(); // reset or removed nominee
    render();
  });
  render();
  window.KQ.start();
})();
