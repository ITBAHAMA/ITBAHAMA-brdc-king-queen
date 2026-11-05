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

  const S = { pick: { king: null, queen: null }, myVote: null, myLoaded: false, busy: false };

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
    renderNotice(); renderResults(); renderBallot(); renderCastbar();
  }

  function renderNotice() {
    const box = $("#notice"); box.replaceChildren();
    const st = status(), mine = S.myVote;
    if (!store.loaded) { box.append(notice("Opening the ballot box…", null)); return; }
    if (store.offline && !store.settings) { box.append(notice("Can't reach the ballot box", "Check your internet connection. This page updates on its own once it connects.")); return; }
    const picked = mine ? `${(nomById(mine.king_id) || {}).name || "a nominee"} for King and ${(nomById(mine.queen_id) || {}).name || "a nominee"} for Queen` : "";
    if (st === "setup") box.append(notice("Voting opens soon", "The organizers are finalizing the nominees. Keep this page open; the ballot appears here automatically."));
    else if (st === "open" && mine) box.append(notice("Your ballot is in", `You voted ${picked}. Winners are crowned at the end of the night.`, "voted"));
    else if (st === "closed") box.append(notice("Voting is closed", mine ? `Thanks for voting. You picked ${picked}. Watch the stage for the reveal.` : "Ballots are being counted. Watch the stage for the reveal."));
  }

  function renderResults() {
    const sec = $("#results"), r = store.results;
    if (status() !== "revealed" || !r) { sec.hidden = true; sec.replaceChildren(); return; }
    sec.hidden = false; sec.replaceChildren();
    sec.append(h("div", { class: "results-head" },
      h("h2", { text: "The crowns go to…" }),
      h("span", { class: "muted", text: `${Number(r.total) || 0} ballots counted` })));
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
    const mine = S.myVote;
    const selectable = st === "open" && S.myLoaded && !mine;
    for (const c of CATS) {
      const list = byCat(c.key);
      const col = h("div", { class: "col" },
        h("div", { class: "col-head" },
          h("h2", null, crown(), c.title),
          h("span", { class: "count", text: `${list.length} ${list.length === 1 ? "nominee" : "nominees"}` })));
      if (!list.length) col.append(h("div", { class: "empty", text: `${c.label} nominees will appear here.` }));
      else {
        const grid = h("div", { class: "grid" });
        for (const n of list) {
          const myPick = mine ? mine[c.key + "_id"] : S.pick[c.key];
          const chosen = myPick === n.id;
          const btn = h("button", {
            type: "button",
            class: "nom" + (myPick && !chosen && !selectable ? " dim" : ""),
            "aria-pressed": chosen ? "true" : "false",
            "aria-label": `${n.name}${n.unit ? ", " + n.unit : ""}${selectable ? ". Vote for " + c.label : ""}`,
            disabled: selectable ? null : true,
            onclick: () => { S.pick[c.key] = S.pick[c.key] === n.id ? null : n.id; render(); }
          }, photo(n), h("div", { class: "nom-name", text: n.name }), n.unit ? h("div", { class: "unit", text: n.unit }) : null);
          if (chosen) btn.append(h("span", { class: "seal" }, crown(), mine ? "Your vote" : "Your pick"));
          grid.append(btn);
        }
        col.append(grid);
      }
      sec.append(col);
    }
  }

  function renderCastbar() {
    for (const c of CATS) if (S.pick[c.key] && !nomById(S.pick[c.key])) S.pick[c.key] = null;
    const show = store.loaded && status() === "open" && S.myLoaded && !S.myVote && byCat("king").length && byCat("queen").length;
    $("#castbar").hidden = !show;
    document.body.classList.toggle("has-bar", !!show);
    if (!show) { $("#confirm").hidden = true; return; }
    const picks = $("#picks"); picks.replaceChildren();
    const cf = $("#cf-picks"); cf.replaceChildren();
    for (const c of CATS) {
      const n = nomById(S.pick[c.key]);
      picks.append(h("div", null, h("small", { text: c.label }), n ? h("b", { text: n.name }) : h("b", { class: "none", text: "Not picked yet" })));
      cf.append(h("div", null, h("span", { text: c.label }), h("b", { text: n ? n.name : "—" })));
    }
    $("#cast-btn").disabled = !(S.pick.king && S.pick.queen) || S.busy;
    $("#cf-go").disabled = S.busy;
  }

  async function cast() {
    if (S.busy) return;
    S.busy = true; render();
    try {
      const res = await rpc("kq_cast_vote", { p_device: DEVICE, p_king: S.pick.king, p_queen: S.pick.queen });
      if (res && res.ok) { toast("Ballot cast. Thanks for voting!"); S.myVote = { king_id: S.pick.king, queen_id: S.pick.queen }; }
      else { toast(errText(res)); if (res && res.error === "already_voted") await loadMyVote(); }
    } catch (e) { toast(errText(e)); }
    finally { S.busy = false; $("#confirm").hidden = true; render(); }
  }

  $("#cast-btn").addEventListener("click", () => { $("#confirm").hidden = false; $("#cf-go").focus(); });
  $("#cf-back").addEventListener("click", () => { $("#confirm").hidden = true; });
  $("#cf-go").addEventListener("click", cast);
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#confirm").hidden = true; });

  window.KQ.onChange(() => {
    if (!S.myLoaded || (status() === "setup" && S.myVote)) loadMyVote(); // a reset clears ballots
    render();
  });
  render();
  window.KQ.start();
})();
