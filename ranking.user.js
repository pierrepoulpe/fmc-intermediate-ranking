// ==UserScript==
// @name         TCR No12 — classement "distance au prochain CP"
// @namespace    tcr-ranking
// @version      1.2
// @description  Reconstruit un classement live basé sur la progression vers le prochain point (CP + début/fin de parcours), à vol d'oiseau. Tourne sur la page Follow My Challenge.
// @match        https://www.followmychallenge.com/live/tcrno12/*
// @match        https://followmychallenge.com/live/tcrno12/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/pierrepoulpe/fmc-intermediate-ranking/main/ranking.user.js
// @downloadURL  https://raw.githubusercontent.com/pierrepoulpe/fmc-intermediate-ranking/main/ranking.user.js
// ==/UserScript==
(function () {
  "use strict";

  // ---- Bornes ordonnées (CP officiels + début/fin de chaque parcours obligatoire) ----
  // Source: itineraire.toml + extrémités des GPX (repo ultrarouter). Doublons < 1.5 km fusionnés.
  const BORNES = [
    { n: "Départ Trondheim", la: 63.43014, lo: 10.39518, t: "start" },
    { n: "fin Start Parcours", la: 62.57674, lo: 11.37700, t: "pend" },
    { n: "début Parcours 1a", la: 61.31322, lo: 8.92118, t: "pstart" },
    { n: "fin Parcours 1a", la: 61.33434, lo: 8.80901, t: "pend" },
    { n: "CP1 Brekke", la: 60.85714, lo: 7.10532, t: "cp" },
    { n: "fin Parcours 1b", la: 60.60199, lo: 7.50312, t: "pend" },
    { n: "début Parcours 2a", la: 50.07348, lo: 17.09031, t: "pstart" },
    { n: "fin Parcours 2a", la: 50.08288, lo: 17.23152, t: "pend" },
    { n: "début Parcours 2b", la: 49.19043, lo: 19.43594, t: "pstart" },
    { n: "fin Parcours 2b", la: 48.96395, lo: 19.58613, t: "pend" },
    { n: "CP2 Jasná", la: 48.97824, lo: 19.59697, t: "cp" },
    { n: "début Parcours 3", la: 43.84077, lo: 18.44834, t: "pstart" },
    { n: "CP3 Trebević", la: 43.83075, lo: 18.47073, t: "cp" },
    { n: "début Parcours 4", la: 41.97379, lo: 20.40310, t: "pstart" },
    { n: "fin Parcours 4", la: 41.68589, lo: 20.42493, t: "pend" },
    { n: "CP4 Jorgo", la: 40.15211, lo: 20.59901, t: "cp" },
    { n: "début Finish Parcours", la: 37.64048, lo: 21.64536, t: "pstart" },
    { n: "Arrivée", la: 37.02428, lo: 22.10307, t: "finish" },
  ];

  const R = 6371.0;
  const rad = (d) => (d * Math.PI) / 180;
  function hav(aLa, aLo, bLa, bLo) {
    const p1 = rad(aLa), p2 = rad(bLa), dp = rad(bLa - aLa), dl = rad(bLo - aLo);
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // precompute cumulative straight-line distance to each borne
  const CUM = [0];
  for (let i = 1; i < BORNES.length; i++)
    CUM[i] = CUM[i - 1] + hav(BORNES[i - 1].la, BORNES[i - 1].lo, BORNES[i].la, BORNES[i].lo);
  const TOTAL = CUM[CUM.length - 1];

  // Project a point onto the borne polyline. Returns progress(km), leg index, next borne, off-route(km).
  function project(la, lo) {
    let best = { d: Infinity };
    for (let i = 0; i < BORNES.length - 1; i++) {
      const A = BORNES[i], B = BORNES[i + 1];
      const lat0 = rad((A.la + B.la) / 2), mPerDegLat = 110540, mPerDegLon = 111320 * Math.cos(lat0);
      const ax = 0, ay = 0;
      const bx = (B.lo - A.lo) * mPerDegLon, by = (B.la - A.la) * mPerDegLat;
      const px = (lo - A.lo) * mPerDegLon, py = (la - A.la) * mPerDegLat;
      const abx = bx - ax, aby = by - ay, apx = px - ax, apy = py - ay;
      const ab2 = abx * abx + aby * aby || 1;
      let t = (apx * abx + apy * aby) / ab2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * abx, cy = ay + t * aby;
      const off = Math.hypot(px - cx, py - cy) / 1000; // km perpendicular
      if (off < best.d) {
        const legLen = CUM[i + 1] - CUM[i];
        best = { d: off, leg: i, t: t, progress: CUM[i] + t * legLen, next: i + 1 };
      }
    }
    const B = BORNES[best.next];
    best.distNext = hav(la, lo, B.la, B.lo); // vol d'oiseau vers la prochaine borne
    best.nextBorne = B;
    // prochain CP officiel (type cp ou finish)
    let ci = best.next;
    while (ci < BORNES.length && !(BORNES[ci].t === "cp" || BORNES[ci].t === "finish")) ci++;
    if (ci < BORNES.length) { best.nextCP = BORNES[ci]; best.distCP = hav(la, lo, BORNES[ci].la, BORNES[ci].lo); }
    return best;
  }

  // ---- lire lat/lng d'un marker (MapLibre / Leaflet / custom) ----
  function markerLatLng(m) {
    if (!m) return null;
    try { if (typeof m.getLngLat === "function") { const a = m.getLngLat(); if (a) return [a.lat, a.lng]; } } catch (e) {}
    try { if (typeof m.getLatLng === "function") { const b = m.getLatLng(); if (b) return [b.lat, b.lng]; } } catch (e) {}
    try { if (m._lngLat) return [m._lngLat.lat, m._lngLat.lng]; } catch (e) {}
    try { if (m._latlng) return [m._latlng.lat, m._latlng.lng]; } catch (e) {}
    return null;
  }

  // ---- best-effort registry id -> nom lisible ----
  let REG = null;
  function buildRegistry() {
    if (REG) return REG;
    REG = {};
    try {
      const keys = Object.keys(window);
      for (const k of keys) {
        if (/Marker|MAP_LAYERS|segmentLayer/.test(k)) continue;
        let v; try { v = window[k]; } catch (e) { continue; }
        if (!v || typeof v !== "object") continue;
        const items = Array.isArray(v) ? v : Object.values(v);
        if (!items.length || typeof items[0] !== "object" || !items[0]) continue;
        const ik = Object.keys(items[0]).join(",");
        if (!/name|rider|entrant|cap|dossard|label|firstname/i.test(ik)) continue;
        for (const it of items) {
          if (!it) continue;
          const id = it.id != null ? it.id : (it.trackerId != null ? it.trackerId : it.cap);
          const nm = it.name || it.fullName || it.label ||
            ([it.firstname, it.lastname].filter(Boolean).join(" ")) ||
            it.rider || (it.cap != null ? "#" + it.cap : null);
          if (id != null && nm) REG[String(id)] = String(nm);
        }
      }
    } catch (e) {}
    return REG;
  }
  function nameFor(entry) {
    const reg = buildRegistry();
    const id = entry.id;
    if (id != null && reg[String(id)]) return reg[String(id)];
    const GENERIC = /^(map ?marker|marker|point|undefined|null)$/i;
    const ok = (s) => s && (s = String(s).trim()) && !GENERIC.test(s) && s.length <= 40 ? s : null;
    const m = entry.marker;
    try {
      const el = m && typeof m.getElement === "function" ? m.getElement() : null;
      if (el) {
        // data-* attributes often hold the rider name / cap number
        if (el.dataset) for (const k in el.dataset) { const v = ok(el.dataset[k]); if (v) return v; }
        for (const a of ["data-name", "data-rider", "data-cap", "data-dossard", "data-label"]) {
          const v = ok(el.getAttribute(a)); if (v) return v;
        }
        const img = el.querySelector && el.querySelector("img[alt]");
        if (img) { const v = ok(img.alt); if (v) return v; }
        // number baked into a background-image / img src filename (e.g. .../cap/123.png)
        const src = (img && img.src) || (el.style && el.style.backgroundImage) || "";
        const mnum = String(src).match(/(\d{1,4})(?:[-_.]|\.png|\.svg)/);
        if (mnum) return "#" + mnum[1];
        const tx = ok(el.innerText || el.textContent);
        if (tx) return tx;
        // non-generic title only as a weak fallback
        const t = ok(el.getAttribute("title") || el.getAttribute("aria-label"));
        if (t) return t;
      }
    } catch (e) {}
    // marker options (Leaflet) sometimes carry a title
    try { const o = m && m.options; if (o) { const v = ok(o.title || o.alt); if (v) return v; } } catch (e) {}
    return id != null ? String(id) : "?";
  }

  // ---- debug: structure réelle des markers (pour identifier le nom/dossard) ----
  function markerDebug() {
    const P = window.participantMarkers || [];
    let s = "MARKER DEBUG (" + P.length + " participants)\n";
    for (let i = 0; i < Math.min(4, P.length); i++) {
      const e = P[i], m = e.marker;
      s += "\n#" + i + " entry.id=" + JSON.stringify(e.id) + "  entry keys=" + Object.keys(e).join(",") + "\n";
      try {
        const el = m && typeof m.getElement === "function" ? m.getElement() : null;
        if (el) {
          s += "  el.tag=" + el.tagName + " class=" + el.className + "\n";
          s += "  el.title=" + JSON.stringify(el.getAttribute("title")) + " aria=" + JSON.stringify(el.getAttribute("aria-label")) + "\n";
          s += "  el.dataset=" + JSON.stringify(Object.assign({}, el.dataset)) + "\n";
          s += "  el.innerText=" + JSON.stringify((el.innerText || "").slice(0, 60)) + "\n";
          s += "  el.outerHTML=" + (el.outerHTML || "").slice(0, 300) + "\n";
        } else s += "  (pas d'élément DOM)\n";
        const mk = []; for (const k in m) mk.push(k);
        s += "  marker keys=" + mk.slice(0, 40).join(",") + "\n";
        try { s += "  marker.options=" + JSON.stringify(m.options).slice(0, 200) + "\n"; } catch (x) {}
      } catch (e2) { s += "  err " + e2.message + "\n"; }
    }
    return s;
  }

  // ---- calcul du classement ----
  function computeRanking() {
    const P = window.participantMarkers;
    if (!P || !P.length) return { error: "window.participantMarkers introuvable", rows: [] };
    const rows = [], bad = [];
    for (const entry of P) {
      const ll = markerLatLng(entry.marker || entry);
      if (!ll || isNaN(ll[0]) || isNaN(ll[1])) { bad.push(entry); continue; }
      const pr = project(ll[0], ll[1]);
      rows.push({
        name: nameFor(entry), la: ll[0], lo: ll[1],
        progress: pr.progress, distNext: pr.distNext, nextIdx: pr.next, nextBorne: pr.nextBorne.n,
        nextCP: pr.nextCP ? pr.nextCP.n : "—", distCP: pr.distCP != null ? pr.distCP : null,
        off: pr.d,
      });
    }
    // tri : borne suivante la plus avancée d'abord, puis vol d'oiseau à cette borne (croissant)
    rows.sort((a, b) => (b.nextIdx - a.nextIdx) || (a.distNext - b.distNext));
    rows.forEach((r, i) => (r.rank = i + 1));
    return { rows: rows, total: P.length, valid: rows.length, badCount: bad.length, bad: bad };
  }

  // ---- diagnostic (repli si la lecture échoue) ----
  function diagnostic(res) {
    let s = "DIAGNOSTIC — lecture des positions incomplète\n";
    s += "participants=" + (res.total || 0) + " valides=" + (res.valid || 0) + " sans_position=" + (res.badCount || 0) + "\n";
    const P = window.participantMarkers;
    if (P && P.length) {
      const e = res.bad && res.bad.length ? res.bad[0] : P[0];
      s += "\n--- exemple d'entrée ---\nid=" + (e && e.id) + "\n";
      const m = e && (e.marker || e);
      const mk = []; for (const k in m) mk.push(k);
      s += "marker keys: " + mk.slice(0, 40).join(",") + "\n";
      s += "getLngLat? " + (m && typeof m.getLngLat) + "  getLatLng? " + (m && typeof m.getLatLng) + "\n";
      try { s += "_lngLat=" + JSON.stringify(m && m._lngLat) + " _latlng=" + JSON.stringify(m && m._latlng) + "\n"; } catch (x) {}
    }
    return s;
  }

  // ---- UI ----
  const LS_ME = "tcr_me";
  let panel;
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  function render() {
    const res = computeRanking();
    const me = (localStorage.getItem(LS_ME) || "").toLowerCase();
    const BTN = "padding:6px 10px;background:#e8e8e8;color:#000;border:1px solid #888;border-radius:5px;font-size:13px";
    let html = "";
    html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">';
    html += '<b style="font-size:15px">🏁 Classement « prochain CP »</b>';
    html += '<button id="tcrRefresh" style="' + BTN + ';margin-left:auto">Actualiser</button>';
    html += '<button id="tcrDebug" style="' + BTN + '">🔧</button>';
    html += '<button id="tcrClose" style="' + BTN + '">Fermer</button>';
    html += "</div>";
    html += '<input id="tcrMe" placeholder="Rechercher mon nom / dossard…" value="' + esc(localStorage.getItem(LS_ME) || "") +
      '" style="width:100%;padding:9px;margin-bottom:6px;box-sizing:border-box;background:#fff;color:#000;font-size:15px;border:2px solid #bf0000;border-radius:5px">';

    if (res.error || res.valid < 3) {
      html += '<pre style="white-space:pre-wrap;color:#f88">' + esc(res.error || "") + "\n" + esc(diagnostic(res)) + "</pre>";
      html += '<p style="color:#fc8">↑ Copie ça et envoie-le à Claude pour ajuster la lecture des positions.</p>';
      html += '<button id="tcrCopyDiag" style="padding:6px 10px">📋 Copier le diagnostic</button>';
      panel.__diag = (res.error || "") + "\n" + diagnostic(res);
    } else {
      html += '<div style="font-size:11px;color:#9c9;margin-bottom:4px">' + res.valid + "/" + res.total + " coureurs localisés · distances à vol d'oiseau · total parcours ≈ " + Math.round(TOTAL) + " km</div>";
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;border-bottom:1px solid #555">' +
        "<th>#</th><th>Coureur</th><th>Prochaine borne</th><th style='text-align:right'>vol d'oiseau</th><th style='text-align:right'>prochain CP</th></tr></thead><tbody>";
      for (const r of res.rows) {
        html += '<tr class="tcrRow" data-nm="' + esc(r.name.toLowerCase()) + '" style="border-bottom:1px solid #2a2a2a">' +
          "<td>" + r.rank + "</td>" +
          "<td>" + esc(r.name) + "</td>" +
          "<td>" + esc(r.nextBorne) + (r.off > 60 ? ' <span title="loin de la ligne théorique" style="color:#c96">≈</span>' : "") + "</td>" +
          '<td style="text-align:right">' + r.distNext.toFixed(0) + " km</td>" +
          '<td style="text-align:right;color:#9bd">' + esc(r.nextCP) + "<br>" + (r.distCP != null ? r.distCP.toFixed(0) + " km" : "") + "</td>" +
          "</tr>";
      }
      html += "</tbody></table>";
    }
    panel.querySelector(".tcrBody").innerHTML = html;
    wire();
    applySearch(localStorage.getItem(LS_ME) || "", false); // (ré)applique le surlignage, sans re-scroller
  }

  // surlignage + défilement en direct, sans recalcul
  function applySearch(term, scroll) {
    term = (term || "").trim().toLowerCase();
    const rows = panel.querySelectorAll(".tcrRow");
    let first = null;
    rows.forEach((tr) => {
      const hit = term && tr.getAttribute("data-nm").indexOf(term) >= 0;
      tr.style.background = hit ? "#1e5e1e" : "";
      tr.style.fontWeight = hit ? "bold" : "";
      tr.style.color = hit ? "#fff" : "";
      if (hit && !first) first = tr;
    });
    if (scroll && first) first.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function wire() {
    const q = (id) => panel.querySelector("#" + id);
    if (q("tcrClose")) q("tcrClose").onclick = () => (panel.style.display = "none");
    if (q("tcrRefresh")) q("tcrRefresh").onclick = render;
    if (q("tcrDebug")) q("tcrDebug").onclick = () => {
      const t = markerDebug();
      const body = panel.querySelector(".tcrBody");
      body.innerHTML = '<button id="tcrBack" style="padding:6px 10px;margin-bottom:6px">← Retour</button>' +
        '<button id="tcrCopyDbg" style="padding:6px 10px;margin:0 0 6px 6px">📋 Copier</button>' +
        '<textarea style="width:100%;height:70vh;background:#000;color:#0f0;font:11px monospace">' + esc(t) + "</textarea>";
      body.querySelector("#tcrBack").onclick = render;
      body.querySelector("#tcrCopyDbg").onclick = () => { try { navigator.clipboard.writeText(t); } catch (e) {} body.querySelector("#tcrCopyDbg").textContent = "✓ Copié"; };
    };
    if (q("tcrMe")) q("tcrMe").oninput = (e) => { localStorage.setItem(LS_ME, e.target.value); applySearch(e.target.value, true); };
    if (q("tcrCopyDiag")) q("tcrCopyDiag").onclick = () => {
      const t = panel.__diag || "";
      try { navigator.clipboard.writeText(t); } catch (e) {}
      q("tcrCopyDiag").textContent = "✓ Copié";
    };
  }

  function ensureUI() {
    if (panel) return;
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:0;right:0;bottom:0;width:min(94vw,460px);z-index:2147483647;background:#141414;color:#eee;font:13px/1.45 system-ui,sans-serif;padding:10px;overflow:auto;box-shadow:-4px 0 16px #0008";
    panel.innerHTML = '<div class="tcrBody"></div>';
    document.body.appendChild(panel);

    const fab = document.createElement("button");
    fab.textContent = "🏁";
    fab.title = "Classement distance au prochain CP";
    fab.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;width:52px;height:52px;border-radius:50%;border:none;background:#bf0000;color:#fff;font-size:22px;box-shadow:0 2px 8px #0007";
    fab.onclick = () => { panel.style.display = "block"; render(); };
    document.body.appendChild(fab);

    panel.style.display = "none";
  }

  function boot() {
    ensureUI();
    // rafraîchit les positions tant que le panneau est ouvert (sauf pendant une saisie de recherche)
    setInterval(() => {
      if (!panel || panel.style.display === "none") return;
      const a = document.activeElement;
      if (a && a.id === "tcrMe") return; // ne pas voler le focus pendant la frappe
      render();
    }, 20000);
  }

  // attendre que participantMarkers soit peuplé
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if ((window.participantMarkers && window.participantMarkers.length) || tries > 40) {
      clearInterval(t);
      boot();
    }
  }, 1000);
})();
