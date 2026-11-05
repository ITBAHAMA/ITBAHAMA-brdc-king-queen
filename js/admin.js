// Organizer page: PIN gate, nominees with camera photos, voting status, live count, reveal, projector view.
(() => {
  const { h, crown, camera, photo, toast, rpc, errText, winners, store, CATS, STATUSES, STATUS_LABEL, status, eventName, byCat, nomById, photoToDataUrl, C } = window.KQ;
  const $ = s => document.querySelector(s);

  const S = {
    pin: null, busy: false, tally: null, draft: { src: null, working: false },
    rowWorking: null, pendingRemove: null, confirmReset: false, lastStatus: null, animate: false
  };
  const savePin = p => { try { p ? sessionStorage.setItem("kq_pin", p) : sessionStorage.removeItem("kq_pin"); } catch (e) {} };
  const loadPin = () => { try { return sessionStorage.getItem("kq_pin"); } catch (e) { return null; } };

  // ---------- auth ----------
  async function unlock(pin) {
    const res = await rpc("kq_admin_login", { p_pin: pin });
    if (!res || !res.ok) throw res || {};
    S.pin = pin; savePin(pin);
    showDesk();
  }
  function lock(msg) {
    S.pin = null; savePin(null); S.tally = null;
    $("#desk").hidden = true; $("#login").hidden = false; $("#lock-btn").hidden = true;
    closeStage(true);
    if (msg) { $("#login-err").textContent = msg; $("#login-err").hidden = false; }
    $("#pin").value = ""; $("#pin").focus();
  }
  function showDesk() {
    $("#login").hidden = true; $("#desk").hidden = false; $("#lock-btn").hidden = false;
    $("#login-err").hidden = true;
    pollTally(); render();
  }
  // Every admin call: PIN attached, wrong/locked PIN signs out.
  async function admin(name, args) {
    const res = await rpc(name, Object.assign({ p_pin: S.pin }, args || {}));
    if (res && !res.ok && (res.error === "bad_pin" || res.error === "locked")) { lock(errText(res)); throw { handled: true }; }
    if (!res || !res.ok) throw res || {};
    return res;
  }
  async function act(fn, okMsg) {
    if (S.busy) return;
    S.busy = true; render();
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { if (!e || !e.handled) toast(errText(e)); }
    finally { S.busy = false; render(); }
  }

  // ---------- live count ----------
  let tallyTimer = null;
  async function pollTally() {
    clearTimeout(tallyTimer);
    if (!S.pin) return;
    if (!document.hidden) {
      try { S.tally = await admin("kq_admin_tally"); render(); } catch (e) { /* retry next tick */ }
    }
    tallyTimer = setTimeout(pollTally, 4000);
  }

  // ---------- render ----------
  function render() {
    const st = status();
    if (S.lastStatus && S.lastStatus !== "revealed" && st === "revealed") S.animate = true;
    S.lastStatus = st;
    $("#pill").dataset.s = st;
    $("#pill-t").textContent = store.loaded ? STATUS_LABEL[st] : "Loading";
    $("#ev-eyebrow").textContent = eventName();
    if (S.pin) renderDesk();
    renderStage();
  }

  function renderDesk() {
    const st = status();
    const steps = $("#steps"); steps.replaceChildren();
    const idx = STATUSES.indexOf(st);
    ["Set up", "Voting open", "Voting closed", "Revealed"].forEach((label, i) =>
      steps.append(h("li", { class: i < idx ? "done" : i === idx ? "now" : "" }, label)));

    const a = $("#st-actions"); a.replaceChildren();
    const ready = byCat("king").length > 0 && byCat("queen").length > 0;
    const B = (label, cls, fn, msg, dis) => h("button", { type: "button", class: "btn " + cls, disabled: S.busy || dis ? true : null, onclick: () => act(fn, msg) }, label);
    const setStatus = s => () => admin("kq_admin_set_status", { p_status: s }).then(() => window.KQ.queue("kq_settings"));
    if (st === "setup") a.append(B("Open voting", "btn-green", setStatus("open"), "Voting is open.", !ready));
    if (st === "open") a.append(B("Close voting", "btn-gold", setStatus("closed"), "Voting closed."));
    if (st === "closed") {
      a.append(B("Reveal winners", "btn-gold", () => admin("kq_admin_reveal").then(() => { window.KQ.queue("kq_settings"); window.KQ.queue("kq_results"); }), "Winners revealed to everyone."));
      a.append(B("Reopen voting", "", setStatus("open"), "Voting is open again."));
    }
    if (st === "revealed") a.append(B("Hide results", "", setStatus("closed"), "Results hidden."));
    a.append(h("button", { type: "button", class: "btn", onclick: openStage }, "Present on screen"));
    if (st === "setup" && !ready) a.append(h("p", { class: "muted", style: "margin:0;font-size:.88rem;flex-basis:100%", text: "Add at least one King and one Queen nominee to open voting." }));

    // live count
    const t = S.tally;
    $("#turnout").textContent = t ? t.total : "–";
    const tbox = $("#tally"); tbox.replaceChildren();
    for (const c of CATS) {
      const rows = t && Array.isArray(t[c.key]) ? t[c.key] : [];
      const max = Math.max(1, ...rows.map(r => r.votes));
      const grp = h("div", null, h("h3", { text: c.label }));
      if (!rows.length) grp.append(h("p", { class: "muted", style: "margin:0;font-size:.88rem", text: t ? "No nominees yet." : "Loading…" }));
      rows.forEach((r, i) => grp.append(h("div", { class: "bar-row" + (i === 0 && r.votes > 0 ? " lead" : "") },
        h("span", { text: r.name, title: r.name }),
        h("div", { class: "bar" }, h("i", { style: `width:${(r.votes / max * 100).toFixed(1)}%` })),
        h("span", { text: r.votes }))));
      tbox.append(grp);
    }

    // nominees list
    const nl = $("#nom-list"); nl.replaceChildren();
    for (const c of CATS) for (const n of byCat(c.key)) {
      const ph = photo(n);
      if (S.rowWorking === n.id) ph.classList.add("busy");
      const acts = h("div", { class: "row-act" });
      const inputId = "re-" + n.id;
      const inp = h("input", { type: "file", id: inputId, class: "vh", accept: "image/*", capture: "environment" });
      inp.addEventListener("change", () => retake(n, inp));
      acts.append(inp, h("label", { class: "btn btn-sm", for: inputId, "aria-disabled": S.rowWorking ? "true" : null },
        S.rowWorking === n.id ? "Uploading…" : n.photo ? "Retake" : "Add photo"));
      const confirming = S.pendingRemove === n.id;
      acts.append(h("button", {
        type: "button", class: "btn btn-sm " + (confirming ? "btn-danger" : ""), disabled: S.busy || null,
        onclick: () => {
          if (!confirming) {
            S.pendingRemove = n.id; render();
            setTimeout(() => { if (S.pendingRemove === n.id) { S.pendingRemove = null; render(); } }, 4000);
          } else act(() => admin("kq_admin_remove_nominee", { p_id: n.id }).then(() => { S.pendingRemove = null; window.KQ.queue("kq_nominees"); }), `Removed ${n.name}.`);
        }
      }, confirming ? "Confirm remove" : "Remove"));
      nl.append(h("li", null, ph,
        h("div", { class: "meta" }, h("b", { text: n.name }), h("small", { text: `${c.label}${n.unit ? " · " + n.unit : ""}` })),
        acts));
    }
    if (!store.nominees.length) nl.append(h("li", { style: "grid-template-columns:1fr", class: "muted" }, "No nominees yet. Add the first one above."));

    renderDraft();
    const ev = $("#ev-name"); if (document.activeElement !== ev) ev.value = eventName();

    // reset
    const rb = $("#reset-box"); rb.replaceChildren();
    rb.append(h("h2", { text: "Reset ballots" }),
      h("p", { class: "sub", text: "Deletes every ballot and the results, and moves voting back to set up. Use it to clear test votes before the party. Nominees stay." }));
    const count = S.tally ? S.tally.total : 0;
    if (!S.confirmReset) rb.append(h("div", { class: "actions" }, h("button", { type: "button", class: "btn btn-danger btn-sm", disabled: S.busy || null, onclick: () => { S.confirmReset = true; render(); } }, "Reset all ballots")));
    else rb.append(h("div", { class: "actions" },
      h("button", { type: "button", class: "btn btn-danger btn-sm", disabled: S.busy || null, onclick: () => act(async () => {
        const r = await admin("kq_admin_reset"); S.confirmReset = false; window.KQ.refreshAll(); pollTally();
        toast(`Deleted ${r.deleted} ${r.deleted === 1 ? "ballot" : "ballots"}.`);
      }) }, `Delete ${count} ${count === 1 ? "ballot" : "ballots"}`),
      h("button", { type: "button", class: "btn btn-sm", onclick: () => { S.confirmReset = false; render(); } }, "Cancel")));
  }

  function renderDraft() {
    const d = S.draft, prev = $("#nm-prev");
    prev.replaceChildren(d.src ? h("img", { src: d.src, alt: "Nominee photo preview" }) : camera());
    prev.classList.toggle("has", !!d.src && !d.working);
    prev.classList.toggle("busy", !!d.working);
    $("#nm-photo-st").textContent = d.working ? "Preparing photo…" : d.src ? "Photo ready. It's saved when you add the nominee." : "On a phone, Take photo opens the camera.";
    $("#nm-clear").hidden = !d.src || d.working;
    $("#nm-add").disabled = S.busy || d.working;
  }

  // ---------- photos ----------
  async function onDraftFile(input) {
    const f = input.files && input.files[0]; input.value = "";
    if (!f || S.draft.working) return;
    S.draft = { src: S.draft.src, working: true }; renderDraft();
    try { S.draft = { src: await photoToDataUrl(f), working: false }; }
    catch (e) { S.draft.working = false; toast("That photo couldn't be read. Try a JPG or PNG."); }
    renderDraft();
  }
  async function retake(n, input) {
    const f = input.files && input.files[0]; input.value = "";
    if (!f || S.rowWorking) return;
    S.rowWorking = n.id; render();
    try {
      const data = await photoToDataUrl(f);
      await admin("kq_admin_set_photo", { p_id: n.id, p_photo: data });
      window.KQ.queue("kq_nominees");
      toast(`Photo updated for ${n.name}.`);
    } catch (e) { if (!e || !e.handled) toast(e && e.message === "unreadable" ? "That photo couldn't be read. Try a JPG or PNG." : errText(e)); }
    finally { S.rowWorking = null; render(); }
  }

  // ---------- projector view ----------
  function openStage() {
    location.hash = "stage";
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  }
  function closeStage(silent) {
    if (location.hash === "#stage") history.replaceState(null, "", location.pathname + location.search);
    try { document.fullscreenElement && document.exitFullscreen().catch(() => {}); } catch (e) {}
    if (!silent) render();
  }
  function renderStage() {
    const stg = $("#stage");
    const on = location.hash === "#stage" && !!S.pin;
    stg.hidden = !on;
    document.body.classList.toggle("staging", on);
    if (!on) return;
    const st = status();
    stg.replaceChildren();
    stg.classList.toggle("anim", S.animate);
    stg.append(h("button", { type: "button", class: "btn btn-sm stage-x", onclick: () => closeStage() }, "Exit"));
    stg.append(h("img", { class: "logo", src: "assets/logo.jpg", alt: "Bahama Realty and Development Corporation" }));
    stg.append(h("div", { class: "eyebrow", text: eventName() }));
    const count = S.tally ? S.tally.total : 0;
    if (st === "revealed" && store.results) {
      stg.append(h("h2", { text: "Your King & Queen" }));
      const w = h("div", { class: "stage-w" });
      for (const c of CATS) {
        const ws = winners(store.results[c.key]);
        w.append(h("div", { class: "sw" }, ws.length ? photo(nomById(ws[0].id) || ws[0]) : null,
          h("div", { class: "t" }, crown(), c.title),
          h("div", { class: "n", text: ws.length ? ws.map(x => x.name).join(" & ") : "No votes" }),
          ws.length ? h("div", { class: "u", text: ws.map(x => x.unit).filter(Boolean).join(" · ") }) : null));
      }
      stg.append(w);
    } else if (st === "open") {
      stg.append(h("h2", { text: "Voting is open" }), h("div", { class: "big", text: count }), h("p", { class: "lede", text: "ballots cast so far" }),
        h("p", { class: "lede", text: "Scan the QR code or open the voter link on your phone to vote." }));
    } else if (st === "closed") {
      stg.append(h("h2", { text: "The ballots are in" }), h("div", { class: "big", text: count }), h("p", { class: "lede", text: "ballots counted. Who will wear the crowns?" }));
    } else {
      stg.append(h("h2", { text: "Who wears the crown?" }), h("p", { class: "lede", text: "Voting for King and Queen of the Night opens soon." }));
    }
    if (S.animate) setTimeout(() => { S.animate = false; }, 1600);
  }

  // ---------- wiring ----------
  const voterUrl = new URL("./", location.href).href;
  $("#voter-url").textContent = voterUrl;
  $("#copy-url").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(voterUrl); toast("Voter link copied."); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("#voter-url")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Press Ctrl+C to copy."); }
  });

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const pin = $("#pin").value.trim();
    if (!pin) return;
    $("#login-btn").disabled = true; $("#login-err").hidden = true;
    try { await unlock(pin); }
    catch (err) { $("#login-err").textContent = errText(err); $("#login-err").hidden = false; }
    finally { $("#login-btn").disabled = false; }
  });
  $("#lock-btn").addEventListener("click", () => lock());

  $("#nm-cam").addEventListener("change", e => onDraftFile(e.target));
  $("#nm-pick").addEventListener("change", e => onDraftFile(e.target));
  $("#nm-clear").addEventListener("click", () => { S.draft = { src: null, working: false }; renderDraft(); });

  $("#add-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#nm-name").value.trim().replace(/\s+/g, " ").slice(0, 60);
    const category = $("#nm-cat").value === "queen" ? "queen" : "king";
    if (!name) { $("#nm-name").focus(); return; }
    if (S.draft.working) return;
    act(async () => {
      await admin("kq_admin_add_nominee", { p_name: name, p_category: category, p_unit: "", p_photo: S.draft.src || "" });
      $("#nm-name").value = ""; S.draft = { src: null, working: false };
      window.KQ.queue("kq_nominees"); pollTally();
      toast(`Added ${name} as a ${category === "king" ? "King" : "Queen"} nominee.`);
      $("#nm-name").focus();
    });
  });
  $("#ev-form").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("#ev-name").value.trim().slice(0, 70) || C.defaultEvent;
    act(() => admin("kq_admin_set_event", { p_name: v }).then(() => { $("#ev-name").blur(); window.KQ.queue("kq_settings"); }), "Event name saved.");
  });
  $("#pin-form").addEventListener("submit", e => {
    e.preventDefault();
    const np = $("#new-pin").value;
    act(async () => {
      await admin("kq_admin_change_pin", { p_new: np });
      S.pin = np; savePin(np); $("#new-pin").value = "";
    }, "PIN changed. Share the new PIN with your organizers.");
  });

  document.addEventListener("keydown", e => { if (e.key === "Escape" && location.hash === "#stage") closeStage(); });
  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.pin) pollTally(); });

  window.KQ.onChange(render);
  render();
  window.KQ.start();
  const saved = loadPin();
  if (saved) unlock(saved).catch(() => lock()); else $("#pin").focus();
})();
