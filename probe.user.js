// ==UserScript==
// @name         TCR probe (FMC data schema)
// @namespace    tcr-ranking
// @version      2.0
// @description  Deep-inspect Follow My Challenge live map objects (participants, CPs, route) to build a "distance to next CP" ranking.
// @match        https://www.followmychallenge.com/live/tcrno12/*
// @match        https://followmychallenge.com/live/tcrno12/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  if (window.__tcrProbe2) return;
  window.__tcrProbe2 = true;
  var MAX = 1400, out = [];
  function w(s) { out.push(s); }
  function trunc(s, n) { s = String(s); n = n || 200; return s.length > n ? s.slice(0, n) + "…" : s; }

  // describe latlng from a marker of unknown flavour (MapLibre / Leaflet / custom)
  function getLatLng(m) {
    try { if (typeof m.getLngLat === "function") { var a = m.getLngLat(); return [a.lat, a.lng]; } } catch (e) {}
    try { if (typeof m.getLatLng === "function") { var b = m.getLatLng(); return [b.lat, b.lng]; } } catch (e) {}
    try { if (m._lngLat) return [m._lngLat.lat, m._lngLat.lng]; } catch (e) {}
    try { if (m._latlng) return [m._latlng.lat, m._latlng.lng]; } catch (e) {}
    return null;
  }
  // shallow list of primitive props (+ one level into plain-object props)
  function primProps(o, depth) {
    var r = [];
    if (!o || typeof o !== "object") return r;
    for (var k in o) {
      var v; try { v = o[k]; } catch (e) { continue; }
      var t = typeof v;
      if (v === null || t === "number" || t === "string" || t === "boolean") {
        r.push(k + "=" + trunc(v, 60));
      } else if (t === "object" && depth > 0 && !Array.isArray(v) && k[0] !== "_map" ) {
        var sub = primProps(v, 0);
        if (sub.length) r.push(k + ":{" + sub.slice(0, 12).join(", ") + "}");
      }
    }
    return r;
  }

  function dumpEntry(label, entry) {
    w("\n[" + label + "]");
    try { w("id=" + trunc(entry.id, 80)); } catch (e) {}
    var keys = []; for (var k in entry) keys.push(k); w("entry keys: " + keys.join(","));
    var m = entry.marker || entry;
    var ll = getLatLng(m);
    w("latlng: " + (ll ? ll[0].toFixed(6) + "," + ll[1].toFixed(6) : "?"));
    var mk = []; for (var kk in m) mk.push(kk); w("marker keys: " + mk.slice(0, 30).join(","));
    w("marker primProps: " + primProps(m, 1).slice(0, 30).join(" | "));
    // popup / element text (often carries the rider name / distance)
    try { if (typeof m.getElement === "function") { var el = m.getElement(); if (el) w("element.innerText: " + trunc(el.innerText || el.textContent, 160)); } } catch (e) {}
    try { if (typeof m.getPopup === "function") { var p = m.getPopup(); if (p && p.getContent) { var ct = p.getContent(); w("popup: " + trunc(typeof ct === "string" ? ct : (ct && ct.innerText), 200)); } } } catch (e) {}
    try { if (m.options) w("options: " + primProps(m.options, 1).slice(0, 20).join(" | ")); } catch (e) {}
  }

  // find the MapLibre/Leaflet map instance and dump geojson sources (route!)
  function dumpMap() {
    w("\n--- MAP SOURCES ---");
    var found = false, keys = Object.keys(window);
    for (var i = 0; i < keys.length && !found; i++) {
      var v; try { v = window[keys[i]]; } catch (e) { continue; }
      if (v && typeof v.getStyle === "function" && typeof v.getSource === "function") {
        found = true; w("map instance: window." + keys[i]);
        var st; try { st = v.getStyle(); } catch (e) { w("getStyle err"); return; }
        var srcs = st && st.sources ? Object.keys(st.sources) : [];
        w("sources: " + srcs.join(", "));
        srcs.forEach(function (sid) {
          try {
            var sdef = st.sources[sid];
            if (sdef.type !== "geojson") return;
            var data = sdef.data;
            if (typeof data === "string") { w(sid + " -> geojson URL: " + data); return; }
            var s = v.getSource(sid);
            var d = (s && (s._data || s.serialize && s.serialize().data)) || data;
            if (!d) return;
            var feats = d.type === "FeatureCollection" ? d.features : [d];
            w(sid + " geojson: " + feats.length + " feature(s)");
            feats.slice(0, 3).forEach(function (f, idx) {
              var g = f.geometry || {};
              var coords = g.coordinates || [];
              var n = Array.isArray(coords) ? (Array.isArray(coords[0]) ? coords.length : 1) : 0;
              w("  #" + idx + " geom=" + g.type + " ncoords=" + n + " props=" + trunc(JSON.stringify(f.properties || {}), 220));
              if (g.type === "LineString" && coords.length) w("    first=" + JSON.stringify(coords[0]) + " last=" + JSON.stringify(coords[coords.length - 1]));
            });
          } catch (e) { w(sid + " err " + e.message); }
        });
      }
    }
    if (!found) w("(no map instance found on window)");
  }

  // hunt for a participants data registry (object/array keyed by rider with name/dist)
  function huntRegistry() {
    w("\n--- REGISTRY HUNT ---");
    var keys = Object.keys(window), n = 0;
    for (var i = 0; i < keys.length && n < 6; i++) {
      var k = keys[i], v; try { v = window[k]; } catch (e) { continue; }
      if (!v || typeof v !== "object") continue;
      if (k.indexOf("Marker") >= 0 || k === "FMC_MAP_LAYERS" || k === "segmentLayerConfig") continue;
      var vals = Array.isArray(v) ? v : Object.keys(v).map(function (x) { try { return v[x]; } catch (e) { return null; } });
      if (!vals.length || typeof vals[0] !== "object" || !vals[0]) continue;
      var ik = Object.keys(vals[0]).join(",");
      if (/name|dist|cp|check|progress|last|rank|km|posit|speed|elapsed/i.test(ik) && vals.length > 3) {
        n++;
        w("window." + k + " (" + (Array.isArray(v) ? "array" : "object") + ", " + vals.length + ") sample keys: " + ik);
        try { w("  sample: " + trunc(JSON.stringify(vals[0]), 400)); } catch (e) {}
      }
    }
    if (!n) w("(no obvious registry)");
  }

  // does the DOM leaderboard show distances?
  function domScan() {
    w("\n--- DOM km/CP SNIPPETS ---");
    var all = document.querySelectorAll("body *"), hits = [], seen = {};
    for (var i = 0; i < all.length && hits.length < 12; i++) {
      var t = all[i].childElementCount === 0 ? (all[i].innerText || "") : "";
      if (t && /\d\s?km|CP\s?\d|\d{3,}\s?k/i.test(t) && !seen[t]) { seen[t] = 1; hits.push(trunc(t.replace(/\s+/g, " "), 80)); }
    }
    w(hits.length ? hits.join("\n") : "(none)");
  }

  function report() {
    out = [];
    w("=== TCR PROBE v2 ===\nhref: " + location.href);
    var P = window.participantMarkers, C = window.cpMarkers, S = window.segmentLayerConfig;
    w("\ncounts: participants=" + (P && P.length) + " cps=" + (C && C.length) + " segments=" + (S && S.length));
    if (S) { w("\n--- SEGMENTS (full) ---"); try { w(JSON.stringify(S)); } catch (e) {} }
    if (P && P.length) { w("\n--- PARTICIPANT SAMPLES ---"); for (var i = 0; i < Math.min(2, P.length); i++) dumpEntry("participant " + i, P[i]); }
    if (C && C.length) { w("\n--- CP MARKERS (all) ---"); for (var j = 0; j < C.length; j++) dumpEntry("cp " + j, C[j]); }
    dumpMap();
    huntRegistry();
    domScan();
    return out.join("\n");
  }

  function overlay() {
    var txt;
    try { txt = report(); } catch (e) { txt = "REPORT ERROR: " + e.message + "\n" + e.stack; }
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#111;color:#eee;font:12px/1.4 monospace;padding:10px;overflow:auto";
    var bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:8px;margin-bottom:8px";
    var cp = document.createElement("button"); cp.textContent = "📋 Copier"; cp.style.cssText = "flex:1;padding:12px;font-size:15px";
    var cl = document.createElement("button"); cl.textContent = "✕ Fermer"; cl.style.cssText = "padding:12px;font-size:15px";
    var ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "width:100%;height:75vh;background:#000;color:#0f0;font:11px/1.35 monospace";
    cp.onclick = function () { ta.select(); try { navigator.clipboard.writeText(txt); } catch (e) {} try { document.execCommand("copy"); } catch (e) {} cp.textContent = "✓ Copié"; };
    cl.onclick = function () { d.remove(); };
    bar.appendChild(cp); bar.appendChild(cl); d.appendChild(bar); d.appendChild(ta); document.body.appendChild(d);
  }

  function arm() { setTimeout(overlay, 12000); }
  if (document.readyState === "complete") arm(); else window.addEventListener("load", arm);
})();
