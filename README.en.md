🇬🇧 English · [🇫🇷 Français](README.md)

# TCR No12 — "distance to next CP" ranking

During the Transcontinental Race, the official ranking only moves when a rider
**passes a control point (CP)** — even though there can be ~2000 km between two CPs. This tool
rebuilds a **continuous ranking** based on each rider's actual progress toward their next point.

It is displayed **on top of the official Follow My Challenge map**, straight from your
phone browser.

---

## 🚀 Step-by-step install guide (for everyone)

You need 3 building blocks: a **browser that supports extensions** (Firefox), an **extension that
can run small scripts** (Tampermonkey), and finally **the ranking script** itself. Count on ~5 min,
one time only.

### 1. Install Firefox

Android's default Chrome browser **does not support extensions**: it can't run the script.
Firefox can.

1. Open the **Play Store** (Android) or the **App Store** (iPhone).
2. Search for **"Firefox"** (publisher *Mozilla*), install it, open it.

### 2. Install the Tampermonkey extension

Tampermonkey is a "userscript manager": it's the one that will run the ranking on the race page.

1. In Firefox, tap the **⋮** menu (bottom right) → **Add-ons** (or *Extensions*).
2. Search for **"Tampermonkey"**, tap **Add to Firefox**, then **Allow / Add**.
3. A small Tampermonkey icon appears in the Firefox bar: the extension is ready.

### 3. Install the ranking script

1. In Firefox, open this link (that's the script):

   ```
   https://raw.githubusercontent.com/pierrepoulpe/fmc-intermediate-ranking/main/ranking.user.js
   ```

2. Tampermonkey shows an install page → tap **Install** (or *Update* if a version is already present).

### 4. Use it

1. Open the race map: `https://www.followmychallenge.com/live/tcrno12/`
2. Let the map load.
3. A **red 🏁 button** appears at the bottom right → tap it: the ranking opens.
4. Type your **name or bib number** in the search field: your row highlights in green and the
   screen scrolls to it, as you type.

The ranking **refreshes on its own every 20 s** as long as the panel is open.

### Updating the script later

Just reopen **the link from step 3** in Firefox: Tampermonkey will offer *Update*.
The displayed `@version` number confirms the new version was picked up.

> ℹ️ **On iPhone**, Firefox doesn't offer Tampermonkey the same way: you have to go through the
> **Userscripts** app (free, App Store) linked to Safari, then add the same link there.
> On Android, the Firefox + Tampermonkey route above is the simplest.

---

## How it works (technical details)

### Why a browser-side script?

- The official TCRNo12 tracker is **Follow My Challenge** (`followmychallenge.com/live/tcrno12/`).
- The site is protected by a **Cloudflare** anti-bot wall (JavaScript challenge); DotWatcher.cc
  (fed by FMC) is too (Vercel). It's impossible to scrape the data from a server.
- Your **browser**, however, clears that challenge normally. So the computation runs
  **inside the page**, where the data is already loaded (`window.participantMarkers`).

### The waypoints

The TCR is **free-routed** between **mandatory parcours**. So we don't know each rider's exact
route → we reason **as the crow flies**. The waypoints ("bornes") are: the **4 official CPs** +
the **start and end of each mandatory parcours**, extracted from `itineraire.toml` and the GPX
endpoints (repo `ultrarouter`). Duplicates < 1.5 km merged. **18 waypoints**, ~3403 km as the
crow flies in total.

### The method

- Each rider is **projected** onto the waypoint polyline (local equirectangular projection)
  → this gives their **next waypoint** and their progress.
- The **displayed distance is as the crow flies** (haversine) to the next waypoint and to the
  next official CP — an accepted approximation.
- **Sorting**: first by the furthest next waypoint reached in the race, then, for a tie on the
  same waypoint, by **increasing straight-line distance** to that waypoint (closest first).
- Riders far from the theoretical line (on a free connector) are flagged "≈": their position in
  the ranking is more approximate.

---

## Files

| File | Role |
|---|---|
| `ranking.user.js` | **The ranking** (userscript to install). |
| `probe.user.js` | Diagnostic probe (userscript) — used to discover the structure of FMC's data. Not needed for normal use. |
| `probe.js` / `probe.bookmarklet.txt` | First version of the probe, as a bookmarklet. Historical. |
| `bornes.generated.txt` | List of the 18 waypoints generated from `itineraire.toml` + GPX. |

> If the panel shows fewer than 3 located riders, it displays a **diagnostic** (🔧 button,
> then *Copy*): the actual structure of the markers, useful for fixing how positions are read.
