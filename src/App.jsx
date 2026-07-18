import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus, ClipboardList, BookOpen, Beer, Sparkles, Check, CheckCircle2,
  AlertTriangle, Clock, X, ArrowRight, Trash2, Search, Loader2, Bell, Calendar, History, ChevronDown, Database, Download, Upload, Copy, QrCode, Camera, FileText, Package, MoreHorizontal, BarChart3, Pencil, Printer, RotateCcw, Compass, Lock, Share,
} from "lucide-react";

// ---------- Brand ----------
const C = {
  ink: "#1C3636", inkSoft: "#2C4A47", brass: "#B8862B", brassSoft: "#D1A44A",
  stone: "#E8E7E2", surface: "#FCFBF9", line: "#DBD8D0", cream: "#F3EFE6",
  paper: "#FBF8F2", alert: "#A23B3B",
};
const TYPE_ACCENT = { cask: "#B8862B", keg: "#3E8C82", keykeg: "#3E8C82", cider: "#5E8C4F" };
// One definition of each dietary badge's colour, warm and teal-tinted to match the app's
// own palette. Used everywhere a badge appears, so they can't drift out of sync again.
const DIET_BADGE_STYLE = {
  vegan: { background: "#EDF3E7", color: "#3F6B33", borderColor: "#C7DAB8" },
  gluten: { background: "#E8F2F1", color: "#1F5C54", borderColor: "#BFDDD9" },
  hazy: { background: "#F7E9E7", color: C.alert, borderColor: "#E8CCC8" },
};
const CAT_ACCENT = { IPA: "#E3A93E", Pale: "#E8D976", Bitter: "#D6823C", "Stout/Porter": "#6E4A32", Stout: "#6E4A32", Porter: "#6E4A32", Cider: "#5E8C4F", Sour: "#A13B5C", Misc: "#96A19B" };
const STORE_KEY = "curfew-cellar:data:v1";
const MODEL = "claude-sonnet-4-6";
// Updated by hand every time a new App.jsx is handed over. Check this against what you were
// just given, if it doesn't match, the deploy hasn't actually landed yet, whatever the app
// looks like otherwise. Shown in Backup & Restore.
const APP_BUILD = "2026-07-17 07:27";
// ---- Cloud sync (active only in the deployed app; the preview uses window.storage) ----
const SB_URL = "https://fnqhrckxmzioinbokicb.supabase.co";
const SB_KEY = "sb_publishable_RyO06sDdZg3bH7Mt6hwHEQ_EA9RNkJ8";
const BAR_EMAIL = "kyle.parkour@gmail.com";
const CLOUD_ID = "default";
let _sb = null;
let _rev = null; // last seen lastUpdated, used to ignore our own echoes
const _loadSB = () => new Promise((resolve, reject) => {
  if (typeof window === "undefined") return reject(new Error("no window"));
  if (window.supabase) return resolve(window.supabase);
  const el = document.createElement("script");
  el.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  el.onload = () => resolve(window.supabase);
  el.onerror = () => reject(new Error("cloud library failed to load"));
  document.head.appendChild(el);
});
const _client = async () => {
  if (_sb) return _sb;
  const lib = await _loadSB();
  _sb = lib.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return _sb;
};
const _revOf = (v) => { try { return JSON.parse(v).lastUpdated || null; } catch (e) { return null; } };
const _loadJsPDF = () => new Promise((resolve, reject) => {
  if (typeof window === "undefined") return reject(new Error("no window"));
  if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
  const el = document.createElement("script");
  el.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  el.onload = () => resolve(window.jspdf && window.jspdf.jsPDF);
  el.onerror = () => reject(new Error("PDF library failed to load"));
  document.head.appendChild(el);
});
const cloudStore = {
  async session() { try { const c = await _client(); const { data } = await c.auth.getSession(); return data ? data.session : null; } catch (e) { return null; } },
  async signIn(password) { try { const c = await _client(); const { error } = await c.auth.signInWithPassword({ email: BAR_EMAIL, password }); return error ? (error.message || "Sign in failed") : null; } catch (e) { return "Cannot reach the cloud. Check your connection."; } },
  async signOut() { try { const c = await _client(); await c.auth.signOut(); } catch (e) {} },
  async get(key) {
    try {
      const c = await _client();
      const { data, error } = await c.from("cellar").select("data").eq("id", CLOUD_ID).maybeSingle();
      if (!error) {
        if (data && data.data) { const v = JSON.stringify(data.data); _rev = _revOf(v); try { localStorage.setItem(key, v); } catch (e) {} return { key, value: v, cloudOk: true }; }
        return { key, value: null, cloudOk: true }; // reached the cloud, genuinely no row yet
      }
    } catch (e) { /* offline or failed: fall back to the local cache, but flag that we have not confirmed the cloud */ }
    try { const v = localStorage.getItem(key); if (v) { _rev = _revOf(v); return { key, value: v, cloudOk: false }; } } catch (e) {}
    return { key, value: null, cloudOk: false };
  },
  async set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
    const rev = _revOf(value);
    if (rev && rev === _rev) return { key, value };
    try {
      const c = await _client();
      // Guard against clobbering a write that landed on another phone since we last synced:
      // check what's actually in the row right now before overwriting it.
      const { data: current } = await c.from("cellar").select("data").eq("id", CLOUD_ID).maybeSingle();
      const remoteRev = current && current.data ? _revOf(JSON.stringify(current.data)) : null;
      if (remoteRev && _rev && remoteRev !== _rev) {
        // Someone else's change is in the row and we haven't seen it yet. Don't overwrite
        // it with our (now stale) snapshot; hand it back so the caller can pull it in instead.
        return { key, value, conflict: true, remoteValue: JSON.stringify(current.data) };
      }
      _rev = rev;
      await c.from("cellar").upsert({ id: CLOUD_ID, data: JSON.parse(value), updated_at: new Date().toISOString() }, { onConflict: "id" });
    } catch (e) { /* offline: cache holds, resyncs on next change */ }
    return { key, value };
  },
  async subscribe(onRemote) {
    try {
      const c = await _client();
      c.channel("cellar-sync").on("postgres_changes", { event: "*", schema: "public", table: "cellar" }, (payload) => {
        try { const row = payload.new; if (!row || !row.data) return; const v = JSON.stringify(row.data); const rev = _revOf(v); if (rev && rev === _rev) return; _rev = rev; onRemote(v); } catch (e) {}
      }).subscribe();
    } catch (e) {}
  },
};
const store = (typeof window !== "undefined" && window.storage) ? window.storage : cloudStore;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- Reference data ----------
const STATUSES = [
  { key: "in_cellar", label: "In Store", dateKey: "delivered" },
  { key: "racked", label: "Racked", dateKey: "racked" },
  { key: "vented", label: "Vented", dateKey: "vented" },
  { key: "tapped", label: "Tapped and Ready", dateKey: "tapped" },
  { key: "on", label: "Pouring", dateKey: "on" },
  { key: "off", label: "Finished", dateKey: "off" },
];
const STATUS_INDEX = Object.fromEntries(STATUSES.map((s, i) => [s.key, i]));
const FIRST_IDX = STATUS_INDEX["in_cellar"];
const VISIBLE_STATUSES = STATUSES;
const STATUS_BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
const CASK_FLOW = ["in_cellar", "racked", "vented", "tapped", "on", "off"];
const SHORT_FLOW = ["in_cellar", "on", "off"];
const flowFor = (drinkType) => (drinkType === "cask" ? CASK_FLOW : SHORT_FLOW);

const PUMPS = { cask: ["cask0", "cask1", "cask2", "cask3"], keg: ["keg0", "keg1", "keg2"], cider: ["cider0", "cider1", "cider2"] };
const PUMP_LABELS = { cask0: "IPA", cask1: "Pale", cask2: "Bitter", cask3: "Stout", keg0: "Keg 1", keg1: "Keg 2", keg2: "Keg 3", cider0: "Cider 1", cider1: "Cider 2", cider2: "Cider 3" };
const PUMP_NUMBER = { cask0: 1, cask1: 2, cask2: 3, cask3: 4, keg0: 5, keg1: 6, keg2: 7, cider0: 8, cider1: 9, cider2: 10 };
const LAUNCH_PRICES = { b1: "4.50", b2: "4.50", b3: "4.90", b5: "4.70", b7: "4.90", b9: "4.70", b11: "4.90", b12: "4.50", b14: "4.30", b16: "4.70", b17: "4.90", b20: "4.30", b23: "4.70", b25: "4.70", b33: "5.70", b40: "6.20" };
const EMPTIES_NEW_BEERS = [
  { id: "b57", brewery: "Campervan", location: "Leith, Edinburgh", name: "Mango Mimosa", style: "Fruit Sour", abv: "4.7", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Mango, lime, tart Berliner Weisse.", allergensVerified: false, category: "Misc" },
  { id: "b49", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "GFB", style: "Session Bitter", abv: "3.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Hoppy, dry, session bitter. GFB stands for Gilbert's First Brew.", allergensVerified: false, category: "Bitter" },
  { id: "b50", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Entire Stout", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Roasted malt, coffee, chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b51", brewery: "Phoenix", location: "Heywood, Greater Manchester", name: "Arizona", style: "Pale Ale", abv: "4.1", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Floral, honeyed, session pale.", allergensVerified: false, category: "Pale" },
  { id: "b52", brewery: "Potting Shed Brew", location: "", name: "Unknown", style: "", abv: "", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Unidentified old cask.", allergensVerified: false, category: "Misc" },
  { id: "b53", brewery: "Two by Two", location: "North Shields", name: "Citra Motueka", style: "New World Pale", abv: "4.6", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Tropical, oats, hop-forward. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b54", brewery: "Two by Two", location: "North Shields", name: "Azacca Mosaic", style: "Pale Ale", abv: "4.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Tropical, citrus, dank. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b55", brewery: "Two by Two", location: "North Shields", name: "Razorbill", style: "Pale Ale", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward, pale ale. Unconfirmed, check with Kyle.", allergensVerified: false, category: "Misc" },
  { id: "b56", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Hawaiian Shirt", style: "Fruit Sour", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Guava, mango, passionfruit.", allergensVerified: false, category: "Misc" },
];
const EMPTIES_NEW_LINES = [
  { beerId: "b24", drinkType: "cask", caskOwner: "LWC" },
  { beerId: "b4", drinkType: "cask", caskOwner: "LWC" },
  { beerId: "b49", drinkType: "cask", caskOwner: "LWC" },
  { beerId: "b50", drinkType: "cask", caskOwner: "LWC" },
  { beerId: "b17", drinkType: "cask", caskOwner: "LWC" },
  { beerId: "b28", drinkType: "cask", caskOwner: "LWC" },
  { beerId: "b51", drinkType: "cask", caskOwner: "HB Clark" },
  { beerId: "b52", drinkType: "cask", caskOwner: "" },
  { beerId: "b53", drinkType: "keg", caskOwner: "Two by Two" },
  { beerId: "b54", drinkType: "keg", caskOwner: "Two by Two" },
  { beerId: "b53", drinkType: "keg", caskOwner: "Two by Two" },
  { beerId: "b55", drinkType: "keg", caskOwner: "Two by Two" },
  { beerId: "b54", drinkType: "keg", caskOwner: "Two by Two" },
  { beerId: "b56", drinkType: "keg", caskOwner: "Tempest" },
  { beerId: "b36", drinkType: "keg", caskOwner: "James Clay" },
];
const caskPrefPumps = (cat) => (cat === "IPA" || cat === "Pale") ? ["cask0", "cask1"] : cat === "Bitter" ? ["cask2"] : cat === "Stout/Porter" ? ["cask3"] : [];
const bbCmp = (a, b) => (a.bestBefore || "9999-12-31").localeCompare(b.bestBefore || "9999-12-31");
// Pin each "on" line to a physical pump so beers never jump between pumps.
const assignPumps = (ls, catOf) => {
  const out = ls.map((l) => ({ ...l }));
  const onCask = out.filter((l) => l.status === "on" && l.drinkType === "cask");
  const taken = new Set();
  onCask.forEach((l) => { if (l.slot && PUMPS.cask.includes(l.slot) && !taken.has(l.slot)) taken.add(l.slot); else l.slot = null; });
  const place = (cands, pumpList) => { const free = pumpList.filter((p) => !taken.has(p)); cands.filter((l) => !l.slot).sort(bbCmp).forEach((l) => { const p = free.shift(); if (p) { l.slot = p; taken.add(p); } }); };
  place(onCask.filter((l) => ["IPA", "Pale"].includes(catOf(l))), ["cask0", "cask1"]);
  place(onCask.filter((l) => catOf(l) === "Bitter"), ["cask2"]);
  place(onCask.filter((l) => catOf(l) === "Stout/Porter"), ["cask3"]);
  place(onCask.filter((l) => !l.slot), PUMPS.cask);
  ["keg", "cider"].forEach((drink) => {
    const on = out.filter((l) => l.status === "on" && PUMP_DRINK(l.drinkType) === drink);
    const tk = new Set();
    on.forEach((l) => { if (l.slot && PUMPS[drink].includes(l.slot) && !tk.has(l.slot)) tk.add(l.slot); else l.slot = null; });
    const free = PUMPS[drink].filter((p) => !tk.has(p));
    on.filter((l) => !l.slot).sort(bbCmp).forEach((l) => { const p = free.shift(); if (p) l.slot = p; });
  });
  return out;
};
const catFromLib = (lib) => (l) => ((lib.find((b) => b.id === l.beerId) || {}).category) || "Misc";
// Pint is the stored price. Half = pint/2 and Schooner = pint x 2/3, both rounded UP to the
// nearest 5p so every measure is a round figure to take at the bar (2.87 becomes 2.90, 2.12
// becomes 2.15). The epsilon stops floating-point error nudging a price that already sits
// exactly on a 5p boundary (2.85) up to the next one.
const money = (n) => `£${(Math.round(n * 100) / 100).toFixed(2)}`;
const roundUpTo5p = (n) => Math.ceil((n * 100 - 1e-6) / 5) * 5 / 100;
const priceTriple = (pint) => {
  const p = parseFloat(pint);
  if (!isFinite(p) || p <= 0) return null;
  return { pint: money(p), half: money(roundUpTo5p(p / 2)), schooner: money(roundUpTo5p(p * 2 / 3)) };
};
const fmtUpdated = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return null; } };
const STATUS_STYLE = {
  in_cellar: "bg-indigo-50 text-indigo-700 border-indigo-200",
  vented: "bg-violet-50 text-violet-700 border-violet-200",
  tapped: "bg-blue-50 text-blue-700 border-blue-200",
  on: "bg-emerald-50 text-emerald-700 border-emerald-200",
  off: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const DRINK_TYPES = [
  { key: "cask", label: "Cask ale" },
  { key: "keg", label: "Keg" },
  { key: "keykeg", label: "Key Keg" },
  { key: "cider", label: "Draught cider" },
];
// Key kegs run through the keg taps, so they share the keg pump group.
const PUMP_DRINK = (dt) => (dt === "keykeg" ? "keg" : dt);
// An empty awaiting collection: finished, not yet collected, and returnable (ciders and one-way key kegs are not).
const IS_EMPTY = (l) => l.status === "off" && !l.collected && l.drinkType !== "cider" && l.drinkType !== "keykeg";
const CATEGORIES = ["IPA", "Pale", "Bitter", "Stout/Porter", "Misc"];
const CAT_STYLE = {
  IPA: "bg-amber-50 text-amber-800 border-amber-200",
  Pale: "bg-yellow-50 text-yellow-800 border-yellow-200",
  Bitter: "bg-orange-50 text-orange-800 border-orange-200",
  "Stout/Porter": "bg-stone-200 text-stone-700 border-stone-300",
  Misc: "bg-slate-100 text-slate-600 border-slate-200",
};

const ALLERGEN_OPTIONS = [
  "Barley (gluten)", "Wheat (gluten)", "Oats (gluten)", "Rye (gluten)",
  "Sulphites", "Fish (isinglass finings)", "Milk (lactose)",
];
const GLUTEN_OPTIONS = ["Standard", "Low gluten", "Gluten-free"];
const CLARITY_OPTIONS = ["Clear", "Hazy"];
const CIDER_SWEETNESS = ["Sweet", "Medium Sweet", "Medium", "Medium Dry", "Dry"];

// Web Push: the public half of the VAPID keypair (the private half lives only in Vercel).
const PUSH_PUBLIC_KEY = "BN-lqhCSKqtRWwfwxJMnnsj_e9BZ5kXzaIya9Zi7P8eNYgQZHrBiT5xkhc0AyVixtzolnxD6fesELFarqisdwIE";
const b64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const GUIDE_SECTIONS = [
  { title: "The Cellar screen", steps: [
    ["Pouring", "Each beer sits in the order of the pumps along the bar: IPA, Pale, Bitter, Stout, then Kegs and Ciders. Tap any beer for its details, price and tasting notes."],
    ["Racked", "Marked by whether they're freshly racked, vented or already tapped and ready to hook up."],
    ["In Store", "Delivered but not yet racked. Grouped by style, with the nearest best before at the top."],
    ["The Bell", "Top of the screen. It flags anything worth a look: a best before drawing close, a cask that's been on a while, or one vented and ready to tap."],
  ]},
  { title: "When a delivery arrives", steps: [
    ["Scan it in", "On the Add tab, take a picture of a cask label and it fills itself in, best before and supplier too. A picture of the invoice can add a whole delivery at once."],
    ["Confirm all", "Check the details look right, then tap Confirm all. Every beer drops straight into In Store."],
    ["Stocked it before?", "It automatically searches your library for anything you've had on before, details and last price included."],
    ["Autofill", "Adding one by hand instead? Type just the name and tap Autofill, and it looks up the style, ABV, allergens and tasting notes for you. Always check against the brewery's own info."],
    ["Verify it", "Once checked, tick Details verified. Until you do, a gentle reminder follows the beer around so it's never missed."],
  ]},
  { title: "When a beer finishes", steps: [
    ["Line finished", "Open the beer, hit Line finished, and pick what replaces it from whatever is Tapped, Vented or Racked."],
    ["Rack the next beer", "The empty slot shows Rack from store. Tap it and choose what's next to roll up."],
    ["The empty cask", "It moves to Empties on its own, sorted by supplier, ready for collection."],
  ]},
  { title: "The Library", steps: [
    ["Every beer, remembered", "Details, tasting notes, allergens, and every past price and supplier. Tap the history button on a row to see it all."],
  ]},
  { title: "Sharing and printing", steps: [
    ["Stock List and Allergen Sheet", "Under More. Print or share as a PDF for staff and allergen questions."],
    ["Customer Tap List", "A tidy list of what's currently on for customers, priced by pint, half and schooner."],
    ["Empties to Return", "On the Empties screen, the share button sends a list of everything ordered by supplier, ready for collection."],
  ]},
];

// The unlock and error screens return before the main app shell (where the full style
// block lives), so they need their own font bootstrap or the wordmark falls back to
// the system font. The browser dedupes the duplicate @import.
const FontBoot = () => <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&display=swap');
:root { --font-data: 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; --font-display: 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }`}</style>;
const VIEW_TITLES = { cellar: "Cellar", add: "Add Stock", library: "Library", allergens: "Allergen Sheet", stock: "Stock List", empties: "Empties to Return", stats: "Cellar Stats", guide: "How to Use", notify: "Notifications", backup: "Backup & Restore" };
const SIZE_OPTIONS = ["Bag-in-box 20L"];
const FRESH_LIMIT = 4; // days on a cask before a quality check is worth a look
const BB_SOON = 2;     // days before best-before to start flagging

// ---------- Helpers ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const DAY = 86400000;
const isoDaysAgo = (n, hour = 9) => { const d = new Date(Date.now() - n * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const dateInDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
// best-before comes off labels in all sorts of formats, normalise to YYYY-MM-DD (UK day/month order)
const toISO = (s) => {
  if (!s) return "";
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return "";
};
const fmt = (iso) => {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const fmtDate = (s) => { if (!s) return "--"; return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
// Splits a tasting note into a taste line and an optional fun-fact line, so it can be shown
// as two short bullet-style lines instead of one paragraph, regardless of how it was entered.
// One bullet per sentence, splitting on every ". " (not just the first), so notes with any
// number of sentences display correctly, not just exactly two. Splitting on period-plus-space
// specifically (not just period) means it won't misfire on a decimal like "4.5%" inside a note.
// One bullet per sentence, splitting on a period followed by ANY whitespace, not just a literal
// space. A note typed or pasted from elsewhere (Notes app, a website) can leave a non-breaking
// space or similar after the full stop, which an exact ". " match silently fails to find,
// producing one long bullet instead of several. \s in JS regex covers regular spaces, non-
// breaking spaces, tabs and newlines, so this is a strict superset of the old behaviour.
const splitNote = (notes) => {
  if (!notes) return [];
  return notes.trim().split(/\.\s+/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean);
};
const dayDiff = (aIso, bIso) => { const a = new Date(aIso); a.setHours(0, 0, 0, 0); const b = new Date(bIso); b.setHours(0, 0, 0, 0); return Math.round((b - a) / DAY); };
const daysUntil = (dateStr) => { if (!dateStr) return null; const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(dateStr + "T00:00:00"); return Math.round((b - a) / DAY); };
const daysOn = (line) => { if (!line.dates.on) return null; return dayDiff(line.dates.on, line.dates.off || new Date().toISOString()); };

// quality nudge for cask only, never a hard "bin it"
const freshness = (line) => {
  if (line.drinkType !== "cask") return null;
  const d = daysOn(line);
  if (d === null) return null;
  if (line.status === "off") return { level: "off", text: `Lasted ${d} day${d === 1 ? "" : "s"}` };
  if (d < FRESH_LIMIT) return null;
  return { level: "check", text: `On for ${d} days · check quality` };
};
const FRESH_STYLE = {
  fresh: "bg-emerald-50 text-emerald-700 border-emerald-200",
  check: "bg-amber-50 text-amber-800 border-amber-200",
  off: "bg-zinc-100 text-zinc-500 border-zinc-200",
};
const bbStatus = (line) => {
  if (!line.bestBefore) return null;
  const d = daysUntil(line.bestBefore);
  if (d < 0) return { level: "past", text: `Best before passed (${fmtDate(line.bestBefore)})` };
  if (d <= BB_SOON) return { level: "soon", text: d === 0 ? "Best before today" : `Best before in ${d} day${d === 1 ? "" : "s"}` };
  return { level: "ok", text: `Best before ${fmtDate(line.bestBefore)}` };
};
const BB_STYLE = {
  past: "bg-red-50 text-red-700 border-red-200",
  soon: "bg-amber-50 text-amber-800 border-amber-200",
  ok: "bg-slate-50 text-slate-500 border-slate-200",
};

// auto-categorise by your rules; falls back to Misc when unsure
// Some ciders end up with the same word in both Style and Sweetness (e.g. "Sweet" typed
// into Style too), which would otherwise display as "Sweet · Sweet". Only show sweetness
// as extra detail when it isn't just repeating the style.
const extraSweetness = (beer) => (beer.sweetness && beer.sweetness.trim().toLowerCase() !== (beer.style || "").trim().toLowerCase()) ? beer.sweetness : "";
// Groups empties by supplier, tolerant of case and stray whitespace (e.g. "6 Barrels" vs
// "6 Barrells" won't split into two groups). `key` is the normalised match/state key; `label`
// is the original casing of whichever entry was seen first, used for display.
const ownerKey = (o) => (o || "Unknown").trim().toLowerCase() || "unknown";
const groupByOwner = (items) => {
  const map = new Map();
  items.forEach((l) => {
    const raw = (l.caskOwner || "Unknown").trim() || "Unknown";
    const key = ownerKey(raw);
    if (!map.has(key)) map.set(key, { key, label: raw, items: [] });
    map.get(key).items.push(l);
  });
  return [...map.values()].sort((a, b) => (b.items.length - a.items.length) || a.label.localeCompare(b.label));
};
// Brewery names come back from the AI with company suffixes attached ("Ossett Brewing Company
// Limited", "Wharfedale Brewery Ltd"), which crowd out the beer's own name in lists. Strip the
// trailing suffix words so only the distinctive part remains. Applied to AI output only, never
// to what Kyle types by hand, and it never strips the name down to nothing.
const cleanBrewery = (name) => {
  if (!name) return "";
  let out = String(name).trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/[\s,]+(?:limited|ltd\.?|co\.?|company|brewery|brewing|brewhouse|breweries|brewers|brew\s*co\.?|plc)$/i, "").trim();
    if (next === out) break;
    out = next;
  }
  return out || String(name).trim();
};
// Both autofill paths (Add Stock and Edit beer details) share this. Kept in one place so the
// two can never drift apart. Wrong details cost real time behind the bar, so the model is told
// to actually look things up and cross-check rather than answer from memory, and to admit when
// it could not verify something instead of guessing confidently.
const buildAutofillPrompt = (brewery, name, isCider) => `You help the cellar app for a UK micropub. Wrong details cost real time behind the bar and can mislead a customer with an allergy, so accuracy matters far more than filling every field.

Product type: ${isCider ? "draught cider/perry" : "beer (cask or keg)"}
Producer: ${brewery ? brewery.trim() : "(not given)"}
Name: ${name.trim()}

HOW TO WORK:
1. Recall what you actually know about this exact beer from this exact producer. Do not confuse it with a similarly named beer from a different brewery, breweries reuse names.
2. If you do not genuinely recognise this specific beer, say so via the confidence field rather than inventing plausible-sounding details. A blank or low-confidence answer is far more useful than a confident wrong one.

ACCURACY RULES, these matter most:
- ABV: give the specific real ABV for this exact beer if you know it. Real ABVs are often not round numbers (4.1, 5.3). Never default to 4.0/4.5/5.0 out of habit. If you do not know it, leave it empty rather than guessing.
- Vegan: only true if you actually know this beer is marked suitable for vegans. Cask ales are often fined with isinglass and are NOT vegan. If unsure, use false.
- Gluten: only "Gluten-free" or "Low gluten" if you actually know it is. Otherwise "Standard".
- Allergens: base these on the real ingredients. Most ales contain Barley (gluten); many also list Wheat or Oats. Cask ales fined with isinglass must include "Fish (isinglass finings)". Most ciders are just "Sulphites".
- Never state a vegan, gluten or allergen claim more confidently than you actually know it.

Return STRICT JSON only. No markdown, no backticks, no commentary.

{
  "brewery": "the producer's name, correctly spelled and capitalised, WITHOUT any company suffix (no Ltd, Limited, Co, Company, Brewery, Brewing, Brewhouse, plc). For example 'Ossett Brewing Company Limited' becomes 'Ossett', and 'Wharfedale Brewery Ltd' becomes 'Wharfedale'. Keep the distinctive part only.",
  "name": "the product name with correct spelling and capitalisation",
  "location": "town or county the producer is based in",
  "style": ${isCider ? '"Dry | Medium | Sweet | Perry"' : '"e.g. Pale Ale, IPA, Blonde, Best Bitter, Mild, Stout, Porter"'},
  "abv": "number as a string, e.g. 4.5",
  "clarity": "Clear | Hazy",
  "glutenStatus": "Standard | Low gluten | Gluten-free",
  "vegan": true or false,
  "allergens": ["choose ONLY from: ${ALLERGEN_OPTIONS.join(", ")}"],${isCider ? `
  "sweetness": "one of exactly: ${CIDER_SWEETNESS.join(" | ")}, as the producer actually describes it",` : ""}
  "notes": "Exactly two sentences, each a plain sentence (not a comma list of keywords), each no longer than 15 words, each ending in a period. First sentence: a genuine tasting note describing flavour and character. Second sentence: a genuine fun fact about this beer, its name, or the brewery (what the name refers to, a notable first, an award). If you do not genuinely know a real fun fact, never invent one, write a second genuine tasting or serving note instead (e.g. food pairing, how it pours, when it's best enjoyed).",
  "confidence": "known | partial | unsure. Use 'known' ONLY if you genuinely recognise this exact beer from this exact producer and are confident of the ABV and dietary details. Use 'partial' if you recognise the beer but are unsure of some dietary details. Use 'unsure' if you do not genuinely recognise this specific beer."
}

JSON only.`;
// Deterministic sanity check run on every AI-filled result, no AI involved, just logic. Catches
// internally inconsistent combinations that can slip past even a well-sourced AI answer, e.g.
// marked vegan while isinglass (a fish product) is listed as an allergen. Returns plain-English
// warnings, or an empty array if nothing looks contradictory.
const checkContradictions = (f) => {
  const warnings = [];
  const allergens = Array.isArray(f.allergens) ? f.allergens : [];
  const has = (a) => allergens.includes(a);
  if (f.vegan && has("Fish (isinglass finings)")) warnings.push("Marked vegan, but isinglass finings (a fish product) is listed, these aren't compatible.");
  if (f.vegan && has("Milk (lactose)")) warnings.push("Marked vegan, but milk/lactose is listed, these aren't compatible.");
  if (f.glutenStatus === "Gluten-free" && ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)", "Rye (gluten)"].some(has)) {
    warnings.push("Marked gluten-free, but a gluten grain is listed as an allergen, worth double-checking which is right.");
  }
  const abv = parseFloat(f.abv);
  if (Number.isFinite(abv)) {
    if (f.drinkType === "cider" ? (abv < 2 || abv > 12) : (abv < 2 || abv > 14)) {
      warnings.push(`${abv}% is unusual for this style, worth confirming it's correct.`);
    }
  }
  return warnings;
};
// Appends any contradiction warnings to a base note, without changing its type unless the base
// note was otherwise a plain success (in which case a contradiction upgrades it to a warning).
const withContradictionCheck = (note, fields) => {
  const warnings = checkContradictions(fields);
  if (!warnings.length) return note;
  return { type: "warn", text: `${note.text} ${warnings.join(" ")}` };
};
// One concise message after autofill. Kyle's call: no stacked warnings, just a clear pointer
// to the brewery's official information. The only exception keeps a warning tone: when the
// model could not confirm it found the right beer at all, sounding confident would be worse.
const autofillNote = (p) => {
  if (p.confidence === "unsure") return { type: "warn", text: "This beer wasn't recognised, so treat the details as a guess. Always check against the brewery's official information." };
  return { type: "ai", text: "Filled in. Always check against the brewery's official information." };
};
const categorise = (style, abv) => {
  const s = (style || "").toLowerCase();
  if (/sour/.test(s)) return "Sour";
  if (/stout|porter/.test(s)) return "Stout/Porter";
  if (/bitter|mild|scottish|shilling|esb/.test(s)) return "Bitter";
  if (/ipa|pale|blonde|golden/.test(s)) {
    const n = parseFloat(abv);
    if (isNaN(n)) return "Misc";
    return n > 4.2 ? "IPA" : "Pale";
  }
  if (/dark|black/.test(s)) return "Stout/Porter";
  return "Misc";
};
// Every keg and cider was defaulting to grey (category "Misc") because nothing ever derived a
// real category for them, cask was the only drink type that auto-categorised from style/ABV,
// everything else fell back to a hardcoded "Misc" at every single write site (label scans,
// invoice imports, form defaults). Cider always gets its own category, since drinkType already
// tells us unambiguously what it is. Keg gets the same style-based derivation as cask, since keg
// beers have real styles (IPA, Stout, Pale...) just as casks do.
const deriveCategory = (drinkType, style, abv) => (drinkType === "cider" ? "Cider" : categorise(style, abv));

const aiDraft = (name) => {
  const l = (name || "").toLowerCase();
  let d = { style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Golden and sessionable, light citrus and a clean dry finish." };
  if (/stout|porter/.test(l)) d = { ...d, style: /porter/.test(l) ? "Porter" : "Stout", abv: "4.8", allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Dark and roasty, coffee and dark chocolate, smooth and dry." };
  else if (/ipa/.test(l)) d = { ...d, style: "IPA", abv: "5.6", clarity: /hazy|juic|neipa/.test(l) ? "Hazy" : "Clear", allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Hop-forward, tropical fruit and citrus over a firm bitterness." };
  else if (/bitter/.test(l)) d = { ...d, style: "Best Bitter", abv: "3.9", notes: "Amber, biscuity malt with earthy English hops." };
  else if (/cider|scrumpy|apple/.test(l)) d = { style: "Medium", abv: "5.2", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Traditional medium cider, crisp apple with a gentle tannic finish.", sweetness: /dry/.test(l) ? "Dry" : /sweet/.test(l) ? "Sweet" : "Medium" };
  else if (/pear|perry/.test(l)) d = { style: "Perry", abv: "4.5", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Soft, lightly sweet perry with ripe pear notes.", sweetness: "Medium Sweet" };
  return { ...d, allergensVerified: false };
};

// ---------- Demo data ----------
const seedLibrary = [
  { id: "b1", brewery: "Ampersand", location: "Pewsey, Wiltshire", name: "Extra Pale Ale", style: "Extra Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Light, crisp, citrus.", allergensVerified: false, category: "Pale" },
  { id: "b2", brewery: "Bank Top", location: "Bolton", name: "Harlequin", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Soft, tropical, easy-drinking.", allergensVerified: false, category: "Pale" },
  { id: "b3", brewery: "Timothy Taylor", location: "Keighley, West Yorkshire", name: "Landlord", style: "Pale Ale", abv: "4.3", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Citrus, biscuit, malty. Madonna's reported favourite beer.", allergensVerified: false, category: "Bitter" },
  { id: "b4", brewery: "Durham", location: "Bowburn, County Durham", name: "Dark Angel", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Dark, roasty, coffee, liquorice.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b5", brewery: "Blackjack", location: "Manchester", name: "Spring and Axle", style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Hoppy, easy-drinking.", allergensVerified: false, category: "IPA" },
  { id: "b6", brewery: "Fyne", location: "Cairndow, Argyll", name: "Hurricane Jack", style: "Blonde Ale", abv: "4.4", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Biscuity, citrus, pear. Named after a Para Handy character.", allergensVerified: false, category: "IPA" },
  { id: "b7", brewery: "Ossett", location: "Ossett, West Yorkshire", name: "White Rat", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hoppy, grapefruit, citrus.", allergensVerified: false, category: "Pale" },
  { id: "b8", brewery: "Cheviot", location: "Slingley, Northumberland", name: "Upland Ale", style: "Bitter", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Malty, balanced, traditional.", allergensVerified: false, category: "Bitter" },
  { id: "b9", brewery: "Marble", location: "Salford, Greater Manchester", name: "Whitehead's", style: "Stout", abv: "4.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Dark, roasty, coffee, chocolate. Named after Manchester's Marble Arch pub.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b10", brewery: "Ossett", location: "Ossett, West Yorkshire", name: "Butterley", style: "Pale Ale", abv: "3.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Light, refreshing, session.", allergensVerified: false, category: "Pale" },
  { id: "b11", brewery: "Oakham", location: "Peterborough", name: "Citra", style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Zesty, lime, lychee. First UK beer brewed with Citra hops.", allergensVerified: false, category: "Pale" },
  { id: "b12", brewery: "Castle Rock", location: "Nottingham", name: "Preservation", style: "Bitter", abv: "4.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Malty, amber, citrus. Founded by an ex-CAMRA chairman.", allergensVerified: false, category: "Bitter" },
  { id: "b13", brewery: "Black Isle", location: "Munlochy, Highland", name: "Porter", style: "Porter", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Roast coffee, dark chocolate. Organic, brewed on the Black Isle.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b14", brewery: "Timothy Taylor", location: "Keighley, West Yorkshire", name: "Golden Best", style: "Light Mild", abv: "3.5", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Pale, delicate, light mild.", allergensVerified: false, category: "Bitter" },
  { id: "b15", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Long White Cloud", style: "Pale Ale", abv: "5.6", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "NZ hops, tropical fruit.", allergensVerified: false, category: "Pale" },
  { id: "b16", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Crop Circle", style: "Blonde Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Pale, hoppy, floral, citrus.", allergensVerified: false, category: "Pale" },
  { id: "b17", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Summer Lightning", style: "Golden Ale", abv: "5.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Straw, dry, hoppy. Sparked Britain's golden ale craze.", allergensVerified: false, category: "Pale" },
  { id: "b18", brewery: "Burton Bridge", location: "Burton upon Trent", name: "Sunshine Pale", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Easy-drinking, golden, pale. Brewed in Burton upon Trent.", allergensVerified: false, category: "Pale" },
  { id: "b19", brewery: "Arbor", location: "Bristol", name: "Oyster Stout", style: "Stout", abv: "4.6", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Smooth, dry, roasty, chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b20", brewery: "Burning Sky", location: "Firle, East Sussex", name: "Plateau", style: "Pale Ale", abv: "3.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Light, hoppy, table beer.", allergensVerified: false, category: "Pale" },
  { id: "b21", brewery: "Fyne", location: "Cairndow, Argyll", name: "Avalanche", style: "Pale Ale", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Refreshing, lemon, grapefruit.", allergensVerified: false, category: "Pale" },
  { id: "b22", brewery: "The Kernel", location: "London", name: "Summer Pale Krush", style: "Pale Ale", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward, soft, juicy. Started under railway arches in Bermondsey.", allergensVerified: false, category: "Pale" },
  { id: "b23", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Citra", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Zesty, grapefruit, single-hop.", allergensVerified: false, category: "Pale" },
  { id: "b24", brewery: "Fyne", location: "Cairndow, Argyll", name: "Jarl", style: "Blonde Ale", abv: "3.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Citrus, clean, session. Jarl means Earl in Old Norse.", allergensVerified: false, category: "Pale" },
  { id: "b25", brewery: "Neptune", location: "Maghull, Liverpool", name: "Abyss", style: "Stout", abv: "6.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Rich, dark, stout.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b26", brewery: "Loch Lomond", location: "Alexandria, West Dunbartonshire", name: "Silkie Stout", style: "Oatmeal Stout", abv: "5.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Oatmeal, coffee, chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b27", brewery: "Loch Lomond", location: "Alexandria, West Dunbartonshire", name: "Lost in Mosaic", style: "New World IPA", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hazy, pineapple, melon.", allergensVerified: false, category: "IPA" },
  { id: "b28", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Cresta", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Roasty, session stout.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b29", brewery: "Cheviot", location: "Slingley, Northumberland", name: "Black Hag", style: "Porter", abv: "4.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Dark, roasty, porter.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b30", brewery: "Fyne", location: "Cairndow, Argyll", name: "Like Clockwork", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward, pale ale.", allergensVerified: false, category: "Pale" },
  { id: "b31", brewery: "Two by Two", location: "North Shields", name: "Strata Pale", style: "Pale Ale", abv: "4.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hazy, tropical, dank. Named after Noah's Ark.", allergensVerified: false, category: "Misc" },
  { id: "b32", brewery: "Rodenbach", location: "Roeselare, Belgium", name: "Fruitage", style: "Flemish Red Sour", abv: "3.9", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Sweet, sour, cherry.", allergensVerified: false, category: "Misc" },
  { id: "b33", brewery: "Wylam", location: "Newcastle upon Tyne", name: "State of Mind", style: "Pale Ale", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Juicy, hazy, pale. Named after railway pioneer George Stephenson's village.", allergensVerified: false, category: "Misc" },
  { id: "b34", brewery: "Burning Sky", location: "Firle, East Sussex", name: "Three Arms", style: "Dark Mild", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Dark, malty, session mild.", allergensVerified: false, category: "Misc" },
  { id: "b35", brewery: "The Kernel", location: "London", name: "Pale Ale Citra", style: "Pale Ale", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Grapefruit, tropical, hop-forward.", allergensVerified: false, category: "Misc" },
  { id: "b36", brewery: "Deya", location: "Cheltenham", name: "Steady Rolling Man", style: "Pale Ale", abv: "5.2", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Soft, juicy, tropical. Named after a Robert Johnson blues song.", allergensVerified: false, category: "Misc" },
  { id: "b37", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Daisy Age", style: "Hazy IPA", abv: "5.3", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Juicy, hazy IPA.", allergensVerified: false, category: "Misc" },
  { id: "b38", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Graceland Pilsner", style: "Pilsner", abv: "4.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Crisp, clean, pilsner.", allergensVerified: false, category: "Misc" },
  { id: "b39", brewery: "Polly's", location: "Mold, Flintshire", name: "The Ritual Continues", style: "IPA", abv: "5.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Hazy, juicy IPA.", allergensVerified: false, category: "Misc" },
  { id: "b40", brewery: "Burning Sky", location: "Firle, East Sussex", name: "Le Coeur Framboise", style: "Raspberry Sour", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Barrel-aged, raspberry, sour.", allergensVerified: false, category: "Misc" },
  { id: "b41", brewery: "Schneider Weisse", location: "Kelheim, Germany", name: "Hefeweissbier", style: "Weissbier", abv: "5.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Banana, clove, wheat. Among the first wheat beers after Bavaria's brewing monopoly ended.", allergensVerified: false, category: "Misc" },
  { id: "b42", brewery: "Weston's", location: "Much Marcle, Herefordshire", name: "Old Rosie", style: "Cloudy Scrumpy", abv: "6.8", clarity: "Hazy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Cloudy, dry, scrumpy. Named after a 1921 steam roller.", allergensVerified: false, category: "Misc" },
  { id: "b43", brewery: "Broadoak", location: "Clutton, Somerset", name: "Rhubarb", style: "Fruit Cider", abv: "4.0", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Sweet, fruity, rhubarb.", allergensVerified: false, category: "Misc" },
  { id: "b44", brewery: "Dudda's Tun", location: "Doddington, Kent", name: "Wild Haze", style: "Cider", abv: "5.4", clarity: "Hazy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Smooth, semi-cloudy, Kentish. Old Anglo-Saxon name for Doddington.", allergensVerified: false, category: "Misc" },
  { id: "b45", brewery: "Thistly Cross", location: "Belhaven, East Lothian", name: "Cloudy", style: "Cloudy Cider", abv: "4.4", clarity: "Hazy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Cloudy, fresh, apple.", allergensVerified: false, category: "Misc" },
  { id: "b46", brewery: "Sandford Orchards", location: "Crediton, Devon", name: "Blackberry", style: "Fruit Cider", abv: "4.0", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Devon, blackberry, cider.", allergensVerified: false, category: "Misc" },
  { id: "b47", brewery: "Celtic Marches", location: "Bishops Frome, Herefordshire", name: "Wild Berries", style: "Fruit Cider", abv: "4.0", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Mixed berry, fruit cider.", allergensVerified: false, category: "Misc" },
  { id: "b48", brewery: "Dudda's Tun", location: "Doddington, Kent", name: "Disco", style: "Cider", abv: "5.0", clarity: "Hazy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Kentish, craft cider.", allergensVerified: false, category: "Misc" },
  { id: "b49", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "GFB", style: "Session Bitter", abv: "3.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Hoppy, dry, session bitter. GFB stands for Gilbert's First Brew.", allergensVerified: false, category: "Bitter" },
  { id: "b50", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Entire Stout", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Roasted malt, coffee, chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b51", brewery: "Phoenix", location: "Heywood, Greater Manchester", name: "Arizona", style: "Pale Ale", abv: "4.1", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Floral, honeyed, session pale.", allergensVerified: false, category: "Pale" },
  { id: "b52", brewery: "Potting Shed Brew", location: "", name: "Unknown", style: "", abv: "", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Unidentified old cask.", allergensVerified: false, category: "Misc" },
  { id: "b53", brewery: "Two by Two", location: "North Shields", name: "Citra Motueka", style: "New World Pale", abv: "4.6", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Tropical, oats, hop-forward. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b54", brewery: "Two by Two", location: "North Shields", name: "Azacca Mosaic", style: "Pale Ale", abv: "4.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Tropical, citrus, dank. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b55", brewery: "Two by Two", location: "North Shields", name: "Razorbill", style: "Pale Ale", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward, pale ale. Unconfirmed, check with Kyle.", allergensVerified: false, category: "Misc" },
  { id: "b56", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Hawaiian Shirt", style: "Fruit Sour", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Guava, mango, passionfruit.", allergensVerified: false, category: "Misc" },
];
const seedLines = [
  { id: "l1", beerId: "b1", drinkType: "cask", size: "", price: "", status: "on", slot: "cask0", caskOwner: "", collected: false, bestBefore: "2026-08-11", dates: { ordered: isoDaysAgo(5), delivered: isoDaysAgo(4), racked: isoDaysAgo(4), vented: isoDaysAgo(2), tapped: isoDaysAgo(1), on: isoDaysAgo(1), off: null } },
  { id: "l2", beerId: "b2", drinkType: "cask", size: "", price: "", status: "on", slot: "cask1", caskOwner: "", collected: false, bestBefore: "2026-07-03", dates: { ordered: isoDaysAgo(5), delivered: isoDaysAgo(4), racked: isoDaysAgo(4), vented: isoDaysAgo(2), tapped: isoDaysAgo(1), on: isoDaysAgo(1), off: null } },
  { id: "l3", beerId: "b3", drinkType: "cask", size: "", price: "", status: "on", slot: "cask2", caskOwner: "", collected: false, bestBefore: "2026-08-04", dates: { ordered: isoDaysAgo(5), delivered: isoDaysAgo(4), racked: isoDaysAgo(4), vented: isoDaysAgo(2), tapped: isoDaysAgo(1), on: isoDaysAgo(1), off: null } },
  { id: "l4", beerId: "b4", drinkType: "cask", size: "", price: "", status: "on", slot: "cask3", caskOwner: "", collected: false, bestBefore: "2026-07-03", dates: { ordered: isoDaysAgo(5), delivered: isoDaysAgo(4), racked: isoDaysAgo(4), vented: isoDaysAgo(2), tapped: isoDaysAgo(1), on: isoDaysAgo(1), off: null } },
  { id: "l5", beerId: "b31", drinkType: "keg", size: "", price: "", status: "on", slot: "keg0", caskOwner: "", collected: false, bestBefore: "2026-12-01", dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(3), racked: null, vented: null, tapped: null, on: isoDaysAgo(1), off: null } },
  { id: "l6", beerId: "b32", drinkType: "keg", size: "", price: "", status: "on", slot: "keg1", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(3), racked: null, vented: null, tapped: null, on: isoDaysAgo(1), off: null } },
  { id: "l7", beerId: "b33", drinkType: "keg", size: "", price: "", status: "on", slot: "keg2", caskOwner: "", collected: false, bestBefore: "2026-10-15", dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(3), racked: null, vented: null, tapped: null, on: isoDaysAgo(1), off: null } },
  { id: "l8", beerId: "b42", drinkType: "cider", size: "", price: "", status: "on", slot: "cider0", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(3), racked: null, vented: null, tapped: null, on: isoDaysAgo(1), off: null } },
  { id: "l9", beerId: "b43", drinkType: "cider", size: "", price: "", status: "on", slot: "cider1", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(3), racked: null, vented: null, tapped: null, on: isoDaysAgo(1), off: null } },
  { id: "l10", beerId: "b44", drinkType: "cider", size: "", price: "", status: "on", slot: "cider2", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(3), racked: null, vented: null, tapped: null, on: isoDaysAgo(1), off: null } },
  { id: "l11", beerId: "b5", drinkType: "cask", size: "", price: "", status: "racked", caskOwner: "", collected: false, bestBefore: "2026-12-08", dates: { ordered: isoDaysAgo(3), delivered: isoDaysAgo(2), racked: isoDaysAgo(1), vented: null, tapped: null, on: null, off: null } },
  { id: "l12", beerId: "b6", drinkType: "cask", size: "", price: "", status: "racked", caskOwner: "", collected: false, bestBefore: "2026-08-07", dates: { ordered: isoDaysAgo(3), delivered: isoDaysAgo(2), racked: isoDaysAgo(1), vented: null, tapped: null, on: null, off: null } },
  { id: "l13", beerId: "b7", drinkType: "cask", size: "", price: "", status: "racked", caskOwner: "", collected: false, bestBefore: "2026-08-04", dates: { ordered: isoDaysAgo(3), delivered: isoDaysAgo(2), racked: isoDaysAgo(1), vented: null, tapped: null, on: null, off: null } },
  { id: "l14", beerId: "b8", drinkType: "cask", size: "", price: "", status: "racked", caskOwner: "", collected: false, bestBefore: "2026-09-10", dates: { ordered: isoDaysAgo(3), delivered: isoDaysAgo(2), racked: isoDaysAgo(1), vented: null, tapped: null, on: null, off: null } },
  { id: "l15", beerId: "b9", drinkType: "cask", size: "", price: "", status: "racked", caskOwner: "", collected: false, bestBefore: "2026-07-28", dates: { ordered: isoDaysAgo(3), delivered: isoDaysAgo(2), racked: isoDaysAgo(1), vented: null, tapped: null, on: null, off: null } },
  { id: "l16", beerId: "b3", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-15", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l17", beerId: "b10", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-16", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l18", beerId: "b11", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-07", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l19", beerId: "b11", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-07", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l20", beerId: "b12", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-22", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l21", beerId: "b13", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-04", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l22", beerId: "b14", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-16", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l23", beerId: "b15", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-24", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l24", beerId: "b16", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-22", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l25", beerId: "b17", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-22", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l26", beerId: "b18", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-10-01", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l27", beerId: "b19", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-08-10", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l28", beerId: "b20", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-08-18", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l29", beerId: "b21", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-08-06", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l30", beerId: "b22", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-28", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l31", beerId: "b23", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l32", beerId: "b24", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-07-22", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l33", beerId: "b25", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-08-26", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l34", beerId: "b26", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-21", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l35", beerId: "b26", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-21", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l36", beerId: "b27", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-10", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l37", beerId: "b28", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-20", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l38", beerId: "b29", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-08-31", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l39", beerId: "b30", drinkType: "cask", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-08-19", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l40", beerId: "b34", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-12-07", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l41", beerId: "b35", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-19", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l42", beerId: "b36", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-12-05", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l43", beerId: "b37", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-03", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l44", beerId: "b38", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l45", beerId: "b39", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-09-30", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l46", beerId: "b40", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "2026-05-11", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l47", beerId: "b41", drinkType: "keg", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l48", beerId: "b45", drinkType: "cider", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l49", beerId: "b46", drinkType: "cider", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l50", beerId: "b47", drinkType: "cider", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l51", beerId: "b48", drinkType: "cider", size: "", price: "", status: "in_cellar", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(2), delivered: isoDaysAgo(1), racked: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l52", beerId: "b24", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "LWC", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l53", beerId: "b4", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "LWC", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l54", beerId: "b49", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "LWC", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l55", beerId: "b50", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "LWC", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l56", beerId: "b17", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "LWC", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l57", beerId: "b28", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "LWC", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l58", beerId: "b51", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "HB Clark", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l59", beerId: "b52", drinkType: "cask", size: "", price: "", status: "off", caskOwner: "", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l60", beerId: "b53", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "Two by Two", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l61", beerId: "b54", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "Two by Two", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l62", beerId: "b53", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "Two by Two", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l63", beerId: "b55", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "Two by Two", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l64", beerId: "b54", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "Two by Two", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l65", beerId: "b56", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "Tempest", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
  { id: "l66", beerId: "b36", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "James Clay", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: new Date().toISOString() } },
];

const seedDistributors = ["HB Clark", "LWC", "6 Barrells"];

const emptyForm = {
  drinkType: "cask", brewery: "", location: "", name: "", style: "", abv: "",
  clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: [], notes: "",
  allergensVerified: false, category: "Misc", size: "", price: "",
  status: "in_cellar", bestBefore: "", caskOwner: "", sweetness: "",
};

// ---------- UI atoms ----------
// The second accent: a small dot for the beer's style/category (IPA, Pale, Stout...), sitting
// beside the name. Kept separate from the left rail (which is drink type: Cask/Keg/Cider) on
// purpose, two colours on one thin rail would both read as a muddy smudge. A dot next to the
// name is where the eye already lands to read it, and it stays quiet enough not to compete with
// the louder dietary/allergen colours (Ve/GF/Hazy) that share the same card.
const CatDot = ({ category }) => {
  const c = CAT_ACCENT[category] || CAT_ACCENT.Misc;
  return <span className="inline-block shrink-0 rounded-full" style={{ width: 7, height: 7, background: c, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.08)` }} title={category || "Misc"} />;
};
const Badge = ({ className = "", style, children }) => (
  <span style={style} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
);
const StatusBadge = ({ status }) => <Badge className={STATUS_STYLE[status]}>{STATUSES[STATUS_INDEX[status]].label}</Badge>;
const DietaryBadges = ({ beer }) => (
  <div className="flex flex-wrap gap-1.5">
    {beer.vegan && <Badge style={DIET_BADGE_STYLE.vegan}>Vegan</Badge>}
    {beer.glutenStatus === "Gluten-free" && <Badge style={DIET_BADGE_STYLE.gluten}>Gluten-free</Badge>}
    {beer.glutenStatus === "Low gluten" && <Badge style={DIET_BADGE_STYLE.gluten}>Low gluten, &lt;20ppm</Badge>}
    {beer.clarity === "Hazy" && <Badge style={DIET_BADGE_STYLE.hazy}>Hazy</Badge>}
  </div>
);
const DietaryMini = ({ beer }) => {
  const items = [];
  if (beer.vegan) items.push(["VG", "Vegan", DIET_BADGE_STYLE.vegan]);
  if (beer.glutenStatus === "Gluten-free") items.push(["GF", "Gluten-free", DIET_BADGE_STYLE.gluten]);
  else if (beer.glutenStatus === "Low gluten") items.push(["<20ppm", "Low gluten, under 20ppm", DIET_BADGE_STYLE.gluten]);
  if (beer.clarity === "Hazy") items.push(["Hazy", "Hazy", DIET_BADGE_STYLE.hazy]);
  if (!items.length) return null;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {items.map(([t, title, style]) => (
        <span key={t} title={title} className="rounded border px-1.5 py-0.5 text-xs font-semibold leading-none" style={style}>{t}</span>
      ))}
    </span>
  );
};
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";
const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
    {children}
  </label>
);
// The one definition of "a beer's details". Add Stock and Edit Beer Details both render
// this, in this order, so they can't drift apart again the way they had. Anything specific
// to a physical stock line (type, container, this cask's price, supplier, best before,
// status) or specific to editing an existing library entry (its current live price,
// archiving) stays in the screen that actually needs it, not here.
const BeerDetailsFields = ({ values, onChange, onAutoFill, busy, note, toggleAllergen }) => {
  const chip = (on) => (on ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft });
  return (
    <>
      <button onClick={onAutoFill} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ borderColor: C.brass, color: C.brass }}>
        {busy ? <><Loader2 size={16} className="animate-spin" /> Filling in…</> : <><Sparkles size={16} /> Auto-fill</>}
      </button>
      {note && (
        <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${note.type === "ai" || note.type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : note.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {note.type === "loading" ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" /> : note.type === "ai" || note.type === "warn" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
          <span>{note.text}</span>
        </div>
      )}
      <Field label="Name"><input className={inputCls} value={values.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Border Reiver IPA" /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Producer / brewery"><input className={inputCls} value={values.brewery} onChange={(e) => onChange({ brewery: e.target.value })} placeholder="e.g. Wylam" /></Field>
        <Field label="Location"><input className={inputCls} value={values.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="e.g. Berwick-upon-Tweed" /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Style"><input className={inputCls} value={values.style} onChange={(e) => onChange({ style: e.target.value })} placeholder="e.g. IPA" /></Field>
        <Field label="ABV %"><input className={inputCls} inputMode="decimal" value={values.abv} onChange={(e) => onChange({ abv: e.target.value })} placeholder="e.g. 5.4" /></Field>
      </div>
      <Field label="Category">
        <div className="flex flex-wrap gap-2">
          {[...CATEGORIES, "Cider", "Sour"].map((cat) => (
            <button key={cat} onClick={() => onChange({ category: cat })} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(values.category === cat)}>{cat}</button>
          ))}
        </div>
      </Field>
      {values.category === "Cider" && (
        <Field label="Sweetness">
          <div className="flex flex-wrap gap-2">
            {CIDER_SWEETNESS.map((s) => (
              <button key={s} onClick={() => onChange({ sweetness: s })} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(values.sweetness === s)}>{s}</button>
            ))}
          </div>
        </Field>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Clarity">
          <div className="flex gap-2">
            {CLARITY_OPTIONS.map((c) => (
              <button key={c} onClick={() => onChange({ clarity: c })} className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(values.clarity === c)}>{c}</button>
            ))}
          </div>
        </Field>
        <Field label="Gluten status"><select className={inputCls} value={values.glutenStatus} onChange={(e) => onChange({ glutenStatus: e.target.value })}>{GLUTEN_OPTIONS.map((g) => <option key={g}>{g}</option>)}</select></Field>
      </div>
      <button onClick={() => onChange({ vegan: !values.vegan })} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(!!values.vegan)}>{values.vegan ? <Check size={15} /> : null} Vegan</button>
      <Field label="Allergens">
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_OPTIONS.map((a) => (
            <button key={a} onClick={() => toggleAllergen(a)} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(values.allergens.includes(a))}>{a}</button>
          ))}
        </div>
      </Field>
      <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-sm"><input type="checkbox" checked={!!values.allergensVerified} onChange={(e) => onChange({ allergensVerified: e.target.checked })} className="h-4 w-4" /><span className="text-slate-700">Details verified against the brewery's own information</span></label>
      <Field label="Tasting notes"><textarea className={`${inputCls} h-20 resize-none`} value={values.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="How would you describe this to a customer?" /></Field>
    </>
  );
};
const Eyebrow = ({ children, count }) => (
  <div className="mb-2 flex items-center gap-2">
    <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.brass }}>{children}</h3>
    <span className="h-px flex-1" style={{ background: C.line }} />
    {count != null && <span className="text-xs font-medium text-slate-400">{count}</span>}
  </div>
);

// ---------- Main ----------
function TheCurfewCellarApp() {
  const [library, setLibrary] = useState(seedLibrary);
  const [lines, setLines] = useState(() => assignPumps(seedLines, catFromLib(seedLibrary)));
  const [view, setView] = useState("cellar");
  const [form, setForm] = useState(emptyForm);
  const [fillNote, setFillNote] = useState(null);
  const [openId, setOpenId] = useState(null);
  // Opening the beer detail modal from the Library, where there's no physical line, just the
  // beer record itself. Kept separate from openId (which always refers to a real line) so
  // CardModal can tell the two cases apart and hide whatever doesn't apply without one.
  const [libraryOpenId, setLibraryOpenId] = useState(null);
  const [editBeerId, setEditBeerId] = useState(null);
  // Which physical line (if any) Edit details was opened from. Best before and Delivered by
  // live on the line, not the library beer, so the edit screen needs this to know which one
  // to show and write to. Null when editing was opened straight from the Library (no line).
  const [editBeerLineId, setEditBeerLineId] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [swap, setSwap] = useState(null);
  const [swapPreviewId, setSwapPreviewId] = useState(null);
  const [prefs, setPrefs] = useState({ on: true, racked: true, store: false, empties: {} });
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString());
  // The realtime subscription is registered once, so it closes over stale state. Keep the
  // newest lastUpdated in a ref so the staleness guard below always compares against reality.
  const lastUpdatedRef = useRef(lastUpdated);
  const bumpReady = useRef(false);
  const skipBump = useRef(false);
  const cloudMode = typeof window !== "undefined" && !window.storage;
  const [authed, setAuthed] = useState(!cloudMode);
  const [authChecking, setAuthChecking] = useState(cloudMode);
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(!cloudMode);
  const [cloudLoadError, setCloudLoadError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const toggleSection = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  const [loading, setLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDupe, setConfirmDupe] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const copyBeerName = async (beer) => {
    const text = beer.brewery ? `${beer.brewery} - ${beer.name}` : beer.name;
    try { await navigator.clipboard.writeText(text); showToast("Copied to clipboard."); }
    catch (e) { showToast("Couldn't copy, try again."); }
  };
  const showToast = (text) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4000); };
  const [hydrated, setHydrated] = useState(false);
  const [storageOk, setStorageOk] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [undoState, setUndoState] = useState(null);
  const undoTimer = useRef(null);
  const [importText, setImportText] = useState("");
  const [backupMsg, setBackupMsg] = useState(null);
  const [confirmCacheReset, setConfirmCacheReset] = useState(false);
  const [cacheResetMsg, setCacheResetMsg] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const fileRef = useRef(null);
  const [addMode, setAddMode] = useState("pick");
  const [addPickSearch, setAddPickSearch] = useState("");
  const [showAlerts, setShowAlerts] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanProgress, setScanProgress] = useState(null);
  const [batchSource, setBatchSource] = useState("invoice");
  const [distributors, setDistributors] = useState(seedDistributors);
  const [invoiceItems, setInvoiceItems] = useState(null);
  const [invoiceOwner, setInvoiceOwner] = useState("");
  const labelRef = useRef(null);
  const invoiceRef = useRef(null);
  const scrollAreaRef = useRef(null);

  const beerById = useMemo(() => Object.fromEntries(library.map((b) => [b.id, b])), [library]);

  // If we've stocked this brewery before, trust what we already have on file over a fresh
  // guess: most breweries only have one real location, so a single one-off entry (a typo,
  // or an AI guess that was never corrected) shouldn't win over five consistent ones.
  const libraryLocationFor = (breweryName) => {
    const wanted = (breweryName || "").trim().toLowerCase();
    if (!wanted) return "";
    const counts = new Map();
    library.forEach((b) => {
      if ((b.brewery || "").trim().toLowerCase() !== wanted) return;
      const loc = (b.location || "").trim();
      if (!loc) return;
      const key = loc.toLowerCase();
      const entry = counts.get(key) || { loc, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    });
    let best = null;
    counts.forEach((entry) => { if (!best || entry.count > best.count) best = entry; });
    return best ? best.loc : "";
  };

  // "Needs attention": things a publican should see at a glance, computed from data the app
  // already tracks. Shared by the header notification bell and its dropdown.
  const attentionItems = useMemo(() => {
    const out = [];
    lines.filter((l) => l.status !== "off").forEach((l) => {
      const beer = beerById[l.beerId]; if (!beer) return;
      const nm = `${beer.brewery ? beer.brewery + " " : ""}${beer.name}`;
      const bb = bbStatus(l);
      if (bb && bb.level === "past") out.push({ id: l.id, warn: true, text: `${nm}: best before has passed` });
      else if (bb && bb.level === "soon") out.push({ id: l.id, warn: true, text: `${nm}: best before ${daysUntil(l.bestBefore) === 0 ? "today" : `in ${daysUntil(l.bestBefore)}d`}` });
      const f = freshness(l);
      if (l.status === "on" && f && f.level === "check") out.push({ id: l.id, warn: false, text: `${nm}: on for ${daysOn(l)} days, check quality` });
      if (l.status === "vented" && l.dates.vented && dayDiff(l.dates.vented, new Date().toISOString()) >= 2) out.push({ id: l.id, warn: false, text: `${nm}: vented ${dayDiff(l.dates.vented, new Date().toISOString())}d ago, ready to tap` });
    });
    const backupAge = prefs.lastBackup ? dayDiff(prefs.lastBackup, new Date().toISOString()) : null;
    if (lines.length > 3 && (backupAge === null || backupAge > 30)) out.push({ id: null, warn: false, backup: true, text: backupAge === null ? "No backup saved yet. Takes ten seconds" : `Last backup ${backupAge} days ago. Worth a fresh one` });
    return out;
  }, [lines, beerById, prefs.lastBackup]);

  // ---- Push notifications (managers get a ping when a beer goes on or finishes) ----
  const [pushState, setPushState] = useState("checking"); // checking | unsupported | need-install | blocked | off | on
  const [pushBusy, setPushBusy] = useState(false);
  const checkPush = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPushState("unsupported"); return; }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (isIOS && !standalone) { setPushState("need-install"); return; }
    if (Notification.permission === "denied") { setPushState("blocked"); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushState(sub ? "on" : "off");
    } catch (e) { setPushState("off"); }
  };
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    checkPush();
  }, []);
  const enablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(PUSH_PUBLIC_KEY) });
      const c = await _client();
      const { error } = await c.from("push_subs").upsert({ endpoint: sub.endpoint, sub: sub.toJSON() }, { onConflict: "endpoint" });
      if (error) throw error;
      try { localStorage.setItem("cc-push-endpoint", sub.endpoint); } catch (e) { /* ignore */ }
      setPushState("on");
      showToast("Notifications are on for this phone.");
    } catch (e) {
      showToast("Could not turn notifications on. Check your connection and try again.");
    } finally { setPushBusy(false); }
  };
  const disablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try { const c = await _client(); await c.from("push_subs").delete().eq("endpoint", sub.endpoint); } catch (e) { /* best effort */ }
        await sub.unsubscribe();
      }
      try { localStorage.removeItem("cc-push-endpoint"); } catch (e) { /* ignore */ }
      setPushState("off");
      showToast("Notifications are off for this phone.");
    } catch (e) {
      showToast("Could not turn notifications off just now.");
    } finally { setPushBusy(false); }
  };
  const sendCellarPush = (title, body) => {
    if (!cloudMode) return;
    (async () => {
      try {
        const c = await _client();
        const { data } = await c.auth.getSession();
        const token = data && data.session ? data.session.access_token : null;
        if (!token) return;
        let exclude = null;
        try { exclude = localStorage.getItem("cc-push-endpoint"); } catch (e) { /* ignore */ }
        await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, title, body, tag: "curfew-pump", exclude }) });
      } catch (e) { /* never block the bar over a notification */ }
    })();
  };

  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));
  const findSavedBeer = (brewery, name) =>
    library.find((b) => b.brewery.trim().toLowerCase() === brewery.trim().toLowerCase() && b.name.trim().toLowerCase() === name.trim().toLowerCase());

  // Apply a saved data blob to state. remote=true means it came from another device,
  // so don't re-stamp "last updated" and don't echo it back to the cloud.
  // One-time, non-destructive launch tidy: fill blank prices from the launch list and set every
  // cider to GBP 4.10. Guarded by prefs.pricesV1 so it runs once on the next load, then syncs out.
  const migrateLaunch = (data) => {
    if (!data || (data.prefs && data.prefs.pricesV1)) return data;
    const lines = (data.lines || []).map((l) => {
      let price = l.price;
      if (l.drinkType === "cider") price = "4.10";
      else if ((!price || price === "") && LAUNCH_PRICES[l.beerId]) price = LAUNCH_PRICES[l.beerId];
      return price === l.price ? l : { ...l, price };
    });
    return { ...data, lines, prefs: { ...(data.prefs || {}), pricesV1: true }, lastUpdated: new Date().toISOString() };
  };
  // One-time, non-destructive batch: add the supplied empties list (new library beers if not
  // already present, plus a finished, uncollected line for each cask/keg) so they appear under
  // Empties for collection. Guarded by prefs.emptiesV1 so it only ever runs once.
  const migrateEmpties = (data) => {
    if (!data || (data.prefs && data.prefs.emptiesV1)) return data;
    const lib = [...(data.library || [])];
    EMPTIES_NEW_BEERS.forEach((b) => { if (!lib.find((x) => x.id === b.id)) lib.push(b); });
    const nowIso = new Date().toISOString();
    const newLines = EMPTIES_NEW_LINES.map((e) => ({
      id: uid(), beerId: e.beerId, drinkType: e.drinkType, size: "", price: "", status: "off",
      caskOwner: e.caskOwner, collected: false, bestBefore: "",
      dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: nowIso },
    }));
    return { ...data, library: lib, lines: [...(data.lines || []), ...newLines], prefs: { ...(data.prefs || {}), emptiesV1: true }, lastUpdated: nowIso };
  };
  // Follow-up, non-destructive batch: adds the Campervan keg (supplier George) and clarifies the
  // Potting Shed cask is genuinely unnamed. Guarded by prefs.emptiesV2, separate from emptiesV1 so
  // it still applies even on devices that already ran the first batch.
  const migrateEmpties2 = (data) => {
    if (!data || (data.prefs && data.prefs.emptiesV2)) return data;
    const lib = (data.library || []).map((b) => (b.id === "b52" ? { ...b, notes: "Old cask, the beer name is genuinely not known." } : b));
    if (!lib.find((x) => x.id === "b57")) lib.push({ id: "b57", brewery: "Campervan", location: "Leith, Edinburgh", name: "Mango Mimosa", style: "Fruit Sour", abv: "4.7", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Mango, lime, tart Berliner Weisse.", allergensVerified: false, category: "Misc" });
    const nowIso = new Date().toISOString();
    const newLine = { id: uid(), beerId: "b57", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "George", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: nowIso } };
    return { ...data, library: lib, lines: [...(data.lines || []), newLine], prefs: { ...(data.prefs || {}), emptiesV2: true }, lastUpdated: nowIso };
  };

  // One-time, non-destructive note rewrite: shortens tasting notes to a quick taste descriptor
  // plus an optional genuine fun fact. Only touches a beer's notes if they still exactly match
  // the original text, so anything Kyle has already edited by hand is left untouched. Also
  // corrects the Old Rosie ABV (Weston's reduced it from 7.3% to 6.8% in 2019). Guarded by
  // prefs.notesV1 so it only ever runs once.
  const NOTE_REWRITES = {
    "b1": ["Light, crisp extra pale ale with gentle citrus hops.", "Light and crisp, gentle citrus hops."],
    "b2": ["Pale ale showcasing the Harlequin hop, soft tropical fruit.", "Soft tropical fruit, easy drinking pale."],
    "b3": ["Classic award-winning pale ale, citrus and biscuit malt.", "Citrus and biscuit malt. Reportedly Madonna's favourite beer."],
    "b4": ["Dark, roasty stout.", "Dark, roasty stout, coffee and liquorice."],
    "b6": ["Well-balanced blonde, Cascade and Amarillo, citrus over biscuit malt.", "Biscuity blonde, citrus and pear. Named after the legendary sailor in Neil Munro's Para Handy stories."],
    "b7": ["Intensely hoppy pale, resinous grapefruit and citrus.", "Intensely hoppy pale, grapefruit and citrus."],
    "b8": ["Traditional Northumbrian bitter, malty and balanced.", "Malty, balanced Northumbrian bitter."],
    "b9": ["Dark, roasty stout.", "Dark, roasty stout, coffee and chocolate. Marble is named after Manchester's Marble Arch pub, where it began life."],
    "b11": ["Hugely aromatic single-hop Citra pale, lime and lychee.", "Zesty Citra pale, lime and lychee. The first UK beer brewed with 100% Citra hops, in 2009."],
    "b12": ["Amber best bitter, malt backbone with citrus hops.", "Malty amber bitter, citrus hop edge. Castle Rock was founded by a former CAMRA chairman."],
    "b13": ["Organic porter, roast coffee and dark chocolate.", "Roast coffee and dark chocolate. Organic, brewed on the Black Isle in the Highlands."],
    "b14": ["Pale Pennine light mild, delicate and refreshing.", "Pale, delicate light mild."],
    "b15": ["NZ-hopped pale, tropical fruit and a juicy body.", "NZ-hopped pale, tropical fruit."],
    "b17": ["Straw-coloured golden ale, clean bitterness and a long dry finish.", "Straw-coloured, dry hoppy finish. Widely credited with starting Britain's golden ale craze in 1989."],
    "b18": ["Easy-drinking golden pale ale.", "Easy-drinking golden pale ale. Brewed in Burton upon Trent, home of British brewing."],
    "b19": ["Smooth dry stout, roast and dark chocolate.", "Smooth dry stout, roast and chocolate."],
    "b20": ["Light, hoppy table pale, citrus and stone fruit.", "Light, hoppy table pale."],
    "b21": ["Refreshing pale, Cascade hops, lemon and grapefruit.", "Refreshing pale, lemon and grapefruit."],
    "b22": ["Hop-forward pale ale, soft and juicy.", "Hop-forward pale, soft and juicy. The Kernel started out under railway arches in Bermondsey, London."],
    "b23": ["Single-hop Citra pale, zesty grapefruit.", "Zesty grapefruit, single-hop pale."],
    "b24": ["Citra session blonde, waves of citrus and a clean finish.", "Citrus session blonde, clean finish. Jarl means Earl in Old Norse, a nod to Argyll's Viking past."],
    "b26": ["Robust oatmeal stout, roast coffee and chocolate, smooth finish.", "Oatmeal stout, coffee and chocolate."],
    "b27": ["Hazy New World IPA, pineapple, citrus and melon.", "Hazy New World IPA, pineapple and melon."],
    "b31": ["Hazy pale hopped with Strata, tropical and dank.", "Hazy, tropical and dank. Named after the animals boarding Noah's Ark, two by two."],
    "b32": ["Refreshing Flanders red blended with cherry, sweet and sour.", "Sweet and sour, cherry-forward Flanders red."],
    "b33": ["Juicy, hazy pale ale.", "Juicy, hazy pale ale. Wylam takes its name from the Tyneside village that gave the world railway pioneer George Stephenson."],
    "b34": ["Dark, malty session ale.", "Dark, malty session mild."],
    "b35": ["Hop-forward Citra pale, grapefruit and tropical fruit.", "Grapefruit and tropical fruit, hop-forward."],
    "b36": ["Iconic hazy pale, soft and juicy with tropical hops.", "Soft, juicy tropical hops. Named after the old blues standard made famous by Robert Johnson."],
    "b38": ["Crisp German-style pilsner, clean and floral.", "Crisp, clean German-style pilsner."],
    "b41": ["Classic Bavarian wheat beer, banana and clove.", "Banana and clove, classic Bavarian wheat beer. Schneider was among the first breweries allowed to brew wheat beer after Bavaria's royal brewing monopoly ended in 1872."],
    "b42": ["Cloudy traditional scrumpy, full-bodied and dry.", "Cloudy, dry traditional scrumpy. Named after a 1921 steam roller at the cidery, itself named after Laurie Lee's Cider with Rosie."],
    "b44": ["Medium, semi-cloudy Kentish cider, smooth and juicy.", "Smooth, semi-cloudy Kentish cider. Dudda's Tun is the old Anglo-Saxon name for Doddington, meaning Dudda's farm."],
    "b45": ["Cloudy Scottish cider, fresh pressed apple.", "Cloudy, fresh pressed apple."],
    "b49": ["Golden session bitter, hoppy aroma with East Kent Goldings and a dry finish.", "Hoppy, dry session bitter. GFB stands for Gilbert's First Brew, named after founder John Gilbert."],
    "b50": ["Rich dark stout, strong roasted malt flavour with coffee and dark chocolate.", "Roasted malt, coffee and chocolate."],
    "b51": ["Best-selling session pale brewed with Goldings hops, floral and honey notes.", "Floral, honeyed session pale."],
    "b53": ["Tropical hop character from Citra, Motueka and Sabro, oats and wheat for mouthfeel. ABV estimated.", "Tropical hop character, oats for body. ABV estimated."],
    "b54": ["Tropical, citrus and dank pale ale. ABV estimated.", "Tropical, citrus and dank. ABV estimated."],
    "b55": ["Hop-forward pale ale. Not confirmed online, check ABV and style with Kyle.", "Hop-forward pale ale. Not confirmed online, check with Kyle."],
    "b56": ["Tropical fruited sour with guava, mango and passionfruit.", "Guava, mango and passionfruit sour."],
  };
  const migrateNotes = (data) => {
    if (!data || (data.prefs && data.prefs.notesV1)) return data;
    const lib = (data.library || []).map((b) => {
      let next = b;
      const pair = NOTE_REWRITES[b.id];
      if (pair && b.notes === pair[0]) next = { ...next, notes: pair[1] };
      if (b.id === "b42" && b.abv === "7.3") next = { ...next, abv: "6.8" };
      return next;
    });
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), notesV1: true }, lastUpdated: new Date().toISOString() };
  };
  // Follow-up, non-destructive fix: Hurricane Jack got re-autofilled under the old, looser
  // notes prompt and came back as a long paragraph. Reverts it to the short style, but only
  // if it still exactly matches that specific long text, so a deliberate edit since is safe.
  const migrateNotes2 = (data) => {
    if (!data || (data.prefs && data.prefs.notesV2)) return data;
    const longText = "A light and refreshing session pale ale from the Scottish Highlands, with gentle citrus and floral hop character. Easy-drinking and well-balanced, named after a character from the classic Scottish TV series 'Para Handy'.";
    const shortText = "Biscuity blonde, citrus and pear. Named after the legendary sailor in Neil Munro's Para Handy stories.";
    const lib = (data.library || []).map((b) => (b.id === "b6" && b.notes === longText ? { ...b, notes: shortText } : b));
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), notesV2: true }, lastUpdated: new Date().toISOString() };
  };

  // One-time, non-destructive note rewrite: switches tasting notes from sentence style to
  // short, comma-separated keywords (flashcard style), e.g. "Biscuity, citrus, pear." Only
  // touches a beer's notes if they still exactly match the prior sentence-style text, so any
  // hand edit since is left alone. Guarded by prefs.notesV3 so it only ever runs once.
  const NOTE_KEYWORD_REWRITES = {
    "b1": ["Light and crisp, gentle citrus hops.", "Light, crisp, citrus."],
    "b2": ["Soft tropical fruit, easy drinking pale.", "Soft, tropical, easy-drinking."],
    "b3": ["Citrus and biscuit malt. Reportedly Madonna's favourite beer.", "Citrus, biscuit, malty. Madonna's reported favourite beer."],
    "b4": ["Dark, roasty stout, coffee and liquorice.", "Dark, roasty, coffee, liquorice."],
    "b5": ["Hoppy, easy-drinking pale ale.", "Hoppy, easy-drinking."],
    "b6": ["Biscuity blonde, citrus and pear. Named after the legendary sailor in Neil Munro's Para Handy stories.", "Biscuity, citrus, pear. Named after a Para Handy character."],
    "b7": ["Intensely hoppy pale, grapefruit and citrus.", "Hoppy, grapefruit, citrus."],
    "b8": ["Malty, balanced Northumbrian bitter.", "Malty, balanced, traditional."],
    "b9": ["Dark, roasty stout, coffee and chocolate. Marble is named after Manchester's Marble Arch pub, where it began life.", "Dark, roasty, coffee, chocolate. Named after Manchester's Marble Arch pub."],
    "b10": ["Light, refreshing session pale.", "Light, refreshing, session."],
    "b11": ["Zesty Citra pale, lime and lychee. The first UK beer brewed with 100% Citra hops, in 2009.", "Zesty, lime, lychee. First UK beer brewed with Citra hops."],
    "b12": ["Malty amber bitter, citrus hop edge. Castle Rock was founded by a former CAMRA chairman.", "Malty, amber, citrus. Founded by an ex-CAMRA chairman."],
    "b13": ["Roast coffee and dark chocolate. Organic, brewed on the Black Isle in the Highlands.", "Roast coffee, dark chocolate. Organic, brewed on the Black Isle."],
    "b14": ["Pale, delicate light mild.", "Pale, delicate, light mild."],
    "b15": ["NZ-hopped pale, tropical fruit.", "NZ hops, tropical fruit."],
    "b16": ["Pale, hoppy summer ale, floral and citrus.", "Pale, hoppy, floral, citrus."],
    "b17": ["Straw-coloured, dry hoppy finish. Widely credited with starting Britain's golden ale craze in 1989.", "Straw, dry, hoppy. Sparked Britain's golden ale craze."],
    "b18": ["Easy-drinking golden pale ale. Brewed in Burton upon Trent, home of British brewing.", "Easy-drinking, golden, pale. Brewed in Burton upon Trent."],
    "b19": ["Smooth dry stout, roast and chocolate.", "Smooth, dry, roasty, chocolate."],
    "b20": ["Light, hoppy table pale.", "Light, hoppy, table beer."],
    "b21": ["Refreshing pale, lemon and grapefruit.", "Refreshing, lemon, grapefruit."],
    "b22": ["Hop-forward pale, soft and juicy. The Kernel started out under railway arches in Bermondsey, London.", "Hop-forward, soft, juicy. Started under railway arches in Bermondsey."],
    "b23": ["Zesty grapefruit, single-hop pale.", "Zesty, grapefruit, single-hop."],
    "b24": ["Citrus session blonde, clean finish. Jarl means Earl in Old Norse, a nod to Argyll's Viking past.", "Citrus, clean, session. Jarl means Earl in Old Norse."],
    "b25": ["Rich, dark stout.", "Rich, dark, stout."],
    "b26": ["Oatmeal stout, coffee and chocolate.", "Oatmeal, coffee, chocolate."],
    "b27": ["Hazy New World IPA, pineapple and melon.", "Hazy, pineapple, melon."],
    "b28": ["Roasty session stout.", "Roasty, session stout."],
    "b29": ["Dark, roasty porter.", "Dark, roasty, porter."],
    "b30": ["Hop-forward pale ale.", "Hop-forward, pale ale."],
    "b31": ["Hazy, tropical and dank. Named after the animals boarding Noah's Ark, two by two.", "Hazy, tropical, dank. Named after Noah's Ark."],
    "b32": ["Sweet and sour, cherry-forward Flanders red.", "Sweet, sour, cherry."],
    "b33": ["Juicy, hazy pale ale. Wylam takes its name from the Tyneside village that gave the world railway pioneer George Stephenson.", "Juicy, hazy, pale. Named after railway pioneer George Stephenson's village."],
    "b34": ["Dark, malty session mild.", "Dark, malty, session mild."],
    "b35": ["Grapefruit and tropical fruit, hop-forward.", "Grapefruit, tropical, hop-forward."],
    "b36": ["Soft, juicy tropical hops. Named after the old blues standard made famous by Robert Johnson.", "Soft, juicy, tropical. Named after a Robert Johnson blues song."],
    "b38": ["Crisp, clean German-style pilsner.", "Crisp, clean, pilsner."],
    "b40": ["Barrel-aged raspberry sour.", "Barrel-aged, raspberry, sour."],
    "b41": ["Banana and clove, classic Bavarian wheat beer. Schneider was among the first breweries allowed to brew wheat beer after Bavaria's royal brewing monopoly ended in 1872.", "Banana, clove, wheat. Among the first wheat beers after Bavaria's brewing monopoly ended."],
    "b42": ["Cloudy, dry traditional scrumpy. Named after a 1921 steam roller at the cidery, itself named after Laurie Lee's Cider with Rosie.", "Cloudy, dry, scrumpy. Named after a 1921 steam roller."],
    "b43": ["Sweet, fruity rhubarb cider.", "Sweet, fruity, rhubarb."],
    "b44": ["Smooth, semi-cloudy Kentish cider. Dudda's Tun is the old Anglo-Saxon name for Doddington, meaning Dudda's farm.", "Smooth, semi-cloudy, Kentish. Old Anglo-Saxon name for Doddington."],
    "b45": ["Cloudy, fresh pressed apple.", "Cloudy, fresh, apple."],
    "b46": ["Devon cider with blackberry.", "Devon, blackberry, cider."],
    "b47": ["Mixed berry fruit cider.", "Mixed berry, fruit cider."],
    "b48": ["Kentish craft cider.", "Kentish, craft cider."],
    "b49": ["Hoppy, dry session bitter. GFB stands for Gilbert's First Brew, named after founder John Gilbert.", "Hoppy, dry, session bitter. GFB stands for Gilbert's First Brew."],
    "b50": ["Roasted malt, coffee and chocolate.", "Roasted malt, coffee, chocolate."],
    "b51": ["Floral, honeyed session pale.", "Floral, honeyed, session pale."],
    "b52": ["Old cask, the beer name is genuinely not known.", "Unidentified old cask."],
    "b53": ["Tropical hop character, oats for body. ABV estimated.", "Tropical, oats, hop-forward. ABV estimated."],
    "b54": ["Tropical, citrus and dank. ABV estimated.", "Tropical, citrus, dank. ABV estimated."],
    "b55": ["Hop-forward pale ale. Not confirmed online, check with Kyle.", "Hop-forward, pale ale. Unconfirmed, check with Kyle."],
    "b56": ["Guava, mango and passionfruit sour.", "Guava, mango, passionfruit."],
    "b57": ["Mango and lime, fruity and tart Berliner Weisse.", "Mango, lime, tart Berliner Weisse."],
  };
  const migrateNotes3 = (data) => {
    if (!data || (data.prefs && data.prefs.notesV3)) return data;
    const lib = (data.library || []).map((b) => {
      const pair = NOTE_KEYWORD_REWRITES[b.id];
      return (pair && b.notes === pair[0]) ? { ...b, notes: pair[1] } : b;
    });
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), notesV3: true }, lastUpdated: new Date().toISOString() };
  };
  // Catch-all: any note longer than 70 characters is sentence-style, not keyword-style.
  // Wipe it to blank so staff re-autofill it and get the correct flashcard format.
  // Our correct keyword notes top out around 55 chars, so 70 is a safe threshold.
  // Not guarded by a pref -- runs on every load but only changes notes that are still too long.
  // RETIRED. This used to delete the notes of any beer with over 70 characters, and it was
  // never gated, so it re-ran on every load and kept wiping perfectly good autofilled notes
  // (keywords plus a fun fact easily exceed 70 characters). Its original one-off cleanup of
  // old sentence-style notes is long done, and the 70-character rule is simply wrong now, so
  // it no longer deletes anything. It only marks itself complete, which permanently disarms
  // it without destroying data. Do not reintroduce a length-based notes purge.
  const migrateNotes4 = (data) => {
    if (!data || (data.prefs && data.prefs.notesV4)) return data;
    return { ...data, prefs: { ...(data.prefs || {}), notesV4: true } };
  };

  // Force-rewrite every beer's tasting notes to the correct keyword/flashcard style.
  // Unlike previous migrations, this is unconditional -- it overwrites whatever is currently
  // stored, so stale sentence-style notes from re-autofills can't survive. Only runs once,
  // guarded by prefs.notesV5.
  const NOTE_FORCED = {
    "b1": "Light, crisp, citrus.",
    "b2": "Soft, tropical, easy-drinking.",
    "b3": "Citrus, biscuit, malty. Madonna's reported favourite beer.",
    "b4": "Dark, roasty, coffee, liquorice.",
    "b5": "Hoppy, easy-drinking.",
    "b6": "Biscuity, citrus, pear. Named after a Para Handy character.",
    "b7": "Hoppy, grapefruit, citrus.",
    "b8": "Malty, balanced, traditional.",
    "b9": "Dark, roasty, coffee, chocolate. Named after Manchester's Marble Arch pub.",
    "b10": "Light, refreshing, session.",
    "b11": "Zesty, lime, lychee. First UK beer brewed with Citra hops.",
    "b12": "Malty, amber, citrus. Founded by an ex-CAMRA chairman.",
    "b13": "Roast coffee, dark chocolate. Organic, brewed on the Black Isle.",
    "b14": "Pale, delicate, light mild.",
    "b15": "NZ hops, tropical fruit.",
    "b16": "Pale, hoppy, floral, citrus.",
    "b17": "Straw, dry, hoppy. Sparked Britain's golden ale craze.",
    "b18": "Easy-drinking, golden, pale. Brewed in Burton upon Trent.",
    "b19": "Smooth, dry, roasty, chocolate.",
    "b20": "Light, hoppy, table beer.",
    "b21": "Refreshing, lemon, grapefruit.",
    "b22": "Hop-forward, soft, juicy. Started under railway arches in Bermondsey.",
    "b23": "Zesty, grapefruit, single-hop.",
    "b24": "Citrus, clean, session. Jarl means Earl in Old Norse.",
    "b25": "Rich, dark, stout.",
    "b26": "Oatmeal, coffee, chocolate.",
    "b27": "Hazy, pineapple, melon.",
    "b28": "Roasty, session stout.",
    "b29": "Dark, roasty, porter.",
    "b30": "Hop-forward, pale ale.",
    "b31": "Hazy, tropical, dank. Named after Noah's Ark.",
    "b32": "Sweet, sour, cherry.",
    "b33": "Juicy, hazy, pale. Named after George Stephenson's village.",
    "b34": "Dark, malty, session mild.",
    "b35": "Grapefruit, tropical, hop-forward.",
    "b36": "Soft, juicy, tropical. Named after a Robert Johnson blues song.",
    "b37": "Juicy, hazy IPA.",
    "b38": "Crisp, clean, pilsner.",
    "b39": "Hazy, juicy IPA.",
    "b40": "Barrel-aged, raspberry, sour.",
    "b41": "Banana, clove, wheat. Among the first wheat beers after Bavaria's brewing monopoly ended.",
    "b42": "Cloudy, dry, scrumpy. Named after a 1921 steam roller.",
    "b43": "Sweet, fruity, rhubarb.",
    "b44": "Smooth, semi-cloudy, Kentish. Old Anglo-Saxon name for Doddington.",
    "b45": "Cloudy, fresh, apple.",
    "b46": "Devon, blackberry, cider.",
    "b47": "Mixed berry, fruit cider.",
    "b48": "Kentish, craft cider.",
    "b49": "Hoppy, dry, session bitter. GFB stands for Gilbert's First Brew.",
    "b50": "Roasted malt, coffee, chocolate.",
    "b51": "Floral, honeyed, session pale.",
    "b52": "Unidentified old cask.",
    "b53": "Tropical, oats, hop-forward. ABV estimated.",
    "b54": "Tropical, citrus, dank. ABV estimated.",
    "b55": "Hop-forward, pale ale. Unconfirmed, check with Kyle.",
    "b56": "Guava, mango, passionfruit.",
    "b57": "Mango, lime, tart Berliner Weisse."
  };
  const migrateNotes5 = (data) => {
    if (!data || (data.prefs && data.prefs.notesV5)) return data;
    const lib = (data.library || []).map((b) => (NOTE_FORCED[b.id] !== undefined ? { ...b, notes: NOTE_FORCED[b.id] } : b));
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), notesV5: true }, lastUpdated: new Date().toISOString() };
  };
  // Cloudy was folded into Hazy as a clarity option; anything saved as Cloudy before this
  // change needs to move over so it still matches CLARITY_OPTIONS and shows the new badge.
  const migrateClarity = (data) => {
    if (!data || (data.prefs && data.prefs.clarityV1)) return data;
    const lib = (data.library || []).map((b) => (b.clarity === "Cloudy" ? { ...b, clarity: "Hazy" } : b));
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), clarityV1: true }, lastUpdated: new Date().toISOString() };
  };
  // One-off tidy of existing data, gated by prefs.tidyV1 so it can only ever run once.
  // 1. Strips company suffixes from brewery names already in the library, so old entries match
  //    what autofill now produces ("Ossett Brewing Company Limited" becomes "Ossett").
  // 2. Backfills the library's price from the beer's live line, or failing that its last
  //    recorded price, so the Edit beer details price field is no longer blank for anything
  //    that arrived via a delivery.
  // Deliberately does NOT touch tasting notes: the ones migrateNotes4 deleted are simply gone
  // and cannot be recovered, so it would be dishonest to pretend otherwise. Re-autofill those.
  // Deliberately does NOT touch caskOwner ("Delivered by"), because that is who collects the
  // empties (LWC, HB Clark), not the brewery, and renaming it would break empties grouping.
  const migrateTidy = (data) => {
    if (!data || (data.prefs && data.prefs.tidyV1)) return data;
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const lib = (data.library || []).map((b) => {
      const next = { ...b };
      if (b.brewery) next.brewery = cleanBrewery(b.brewery);
      if (next.price === undefined || next.price === null || next.price === "") {
        const live = lines.find((l) => l.beerId === b.id && l.status !== "off" && l.price);
        const hist = (b.history || []).slice().reverse().find((h) => h && h.price);
        const p = (live && live.price) || (hist && hist.price) || "";
        if (p) next.price = String(p);
      }
      return next;
    });
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), tidyV1: true }, lastUpdated: new Date().toISOString() };
  };
  // The one migration chain. Every load path MUST parse through this, and any new
  // migration is added here only, so no call site can ever miss one.
  // One-off backfill for the "kegs and ciders are all grey" bug: category was never actually
  // derived for anything except cask, every other drink type silently defaulted to "Misc" at
  // every write site (label scans, invoice imports, form defaults). Fixing those write sites
  // only helps beers added from now on; this migration corrects what's already sat in the
  // library. The library beer record itself doesn't reliably store its own drink type, so this
  // infers it from the beer's actual lines (current or historical). Only touches beers
  // currently at "Misc", so any category picked by hand on purpose is left alone.
  const migrateCategoryV1 = (data) => {
    if (!data || (data.prefs && data.prefs.categoryV1)) return data;
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const drinkTypeFor = (beerId) => {
      const l = lines.find((x) => x.beerId === beerId);
      return l ? l.drinkType : null;
    };
    const lib = (data.library || []).map((b) => {
      if (b.category !== "Misc") return b;
      const dt = drinkTypeFor(b.id);
      if (!dt || dt === "cask") return b;
      return { ...b, category: deriveCategory(dt, b.style, b.abv) };
    });
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), categoryV1: true }, lastUpdated: new Date().toISOString() };
  };
  // One-off, per Kyle's explicit request: history data was proven untrustworthy (invoice-
  // imported deliveries never recorded a supplier, and the display never actually aligned into
  // columns, making it hard to verify what was there in the first place), both now fixed. Wipes
  // every beer's history and reseeds one fresh entry from its current line (the most recently
  // delivered one, if several), so tracking starts clean from what's genuinely in the cellar
  // today rather than carrying forward data that couldn't be trusted. A beer with no current
  // line gets empty history, there's nothing current to seed it from.
  const migrateHistoryResetV1 = (data) => {
    if (!data || (data.prefs && data.prefs.historyResetV1)) return data;
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const lib = (data.library || []).map((b) => {
      const current = lines.filter((l) => l.beerId === b.id).sort((x, y) => new Date((y.dates && y.dates.delivered) || 0) - new Date((x.dates && x.dates.delivered) || 0))[0];
      if (!current) return { ...b, history: [] };
      const entry = { date: (current.dates && current.dates.delivered) || new Date().toISOString(), abv: b.abv || "", price: current.price || b.price || "", caskOwner: current.caskOwner || "" };
      return { ...b, history: [entry] };
    });
    return { ...data, library: lib, prefs: { ...(data.prefs || {}), historyResetV1: true }, lastUpdated: new Date().toISOString() };
  };
  const migrate = (json) => migrateHistoryResetV1(migrateCategoryV1(migrateTidy(migrateClarity(migrateNotes5(migrateNotes4(migrateNotes3(migrateNotes2(migrateNotes(migrateEmpties2(migrateEmpties(migrateLaunch(JSON.parse(json)))))))))))));
  const applyData = (data, remote) => {
    if (!data) return;
    if (remote) skipBump.current = true;
    if (Array.isArray(data.library)) setLibrary(data.library);
    if (Array.isArray(data.lines)) { const lib = Array.isArray(data.library) ? data.library : library; setLines(assignPumps(data.lines.map((l) => l.status === "en_route" ? { ...l, status: "in_cellar", dates: { ...l.dates, delivered: l.dates && l.dates.delivered ? l.dates.delivered : (l.dates && l.dates.ordered) || new Date().toISOString() } } : l), catFromLib(lib))); }
    if (Array.isArray(data.distributors)) setDistributors(data.distributors);
    if (data.prefs) setPrefs((p) => ({ ...p, ...data.prefs, store: false, empties: data.prefs.empties || {} }));
    if (data.lastUpdated) { lastUpdatedRef.current = data.lastUpdated; setLastUpdated(data.lastUpdated); }
  };

  // Load once on mount. In cloud mode the load waits for sign in (handled below).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!store || cloudMode) { if (!cancelled) { setStorageOk(true); setHydrated(true); } return; }
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1200));
      try {
        const r = await Promise.race([store.get(STORE_KEY, false), timeout]);
        if (!cancelled && r && r.value) applyData(migrate(r.value), false);
        if (!cancelled) setStorageOk(true);
      } catch (e) {
        if (!cancelled) setStorageOk(!(e && e.message === "timeout"));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cloud: check for an existing signed-in session on this device
  useEffect(() => {
    if (!cloudMode) return;
    let cancelled = false;
    (async () => { const s = await store.session(); if (!cancelled) { setAuthed(!!s); setAuthChecking(false); } })();
    return () => { cancelled = true; };
  }, []);

  // Cloud: once signed in, pull the shared cellar and listen for live changes.
  // Saving is blocked until cloudReady is true, so a failed fetch can never fall
  // back to the device's built-in starter data and overwrite everyone else's stock.
  const loadCellar = async () => {
    setCloudLoadError(false);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await store.get(STORE_KEY);
        if (r && r.cloudOk) {
          if (r.value) applyData(migrate(r.value), true);
          setCloudReady(true);
          return true;
        }
      } catch (e) { /* retry */ }
      if (attempt < 3) await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
    setCloudLoadError(true);
    return false;
  };
  useEffect(() => {
    if (!cloudMode || !authed) return;
    let cancelled = false;
    (async () => {
      const ok = await loadCellar();
      // Only ever apply a remote payload that is genuinely NEWER than what this device holds.
      // Without this guard, any remote write lands wholesale, including a stale snapshot
      // force-written by a device that was backgrounded, which silently reverts live lines
      // (e.g. a beer that was Pouring reappearing In Store).
      if (!cancelled && ok) store.subscribe((j) => {
        try {
          const data = migrate(j);
          const remoteAt = data && data.lastUpdated ? Date.parse(data.lastUpdated) : 0;
          const localAt = lastUpdatedRef.current ? Date.parse(lastUpdatedRef.current) : 0;
          if (!remoteAt || (localAt && remoteAt <= localAt)) return;
          applyData(data, true);
        } catch (e) { /* ignore */ }
      });
    })();
    return () => { cancelled = true; };
  }, [authed]);

  // iOS suspends live subscriptions while the app is backgrounded and doesn't reliably
  // reconnect them, so on returning to the foreground, pull fresh data once. Throttled
  // so quick app switches don't hammer the cloud.
  const lastRefetch = useRef(0);
  useEffect(() => {
    if (!cloudMode || !authed || !cloudReady) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (saveTimer.current || saveInFlight.current) return; // a local edit hasn't finished syncing yet; don't pull over it
      const now = Date.now();
      if (now - lastRefetch.current < 10000) return;
      lastRefetch.current = now;
      loadCellar();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authed, cloudReady]);

  const doLogin = async () => {
    if (authBusy) return;
    setAuthBusy(true); setAuthErr(null);
    const err = await store.signIn(pw.trim());
    setAuthBusy(false);
    if (err) { setAuthErr(err); return; }
    setPw(""); setAuthed(true);
  };
  const lock = async () => { try { await store.signOut(); } catch (e) { /* ignore */ } setView("cellar"); setOpenId(null); setAuthed(false); };

  // Shares a finished jsPDF doc (mobile share sheet) or downloads it (desktop).
  const sharePdfDoc = async (doc, fname, title) => {
    const blob = doc.output("blob");
    try {
      const file = new File([blob], fname, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        doc.save(fname);
      }
    } catch (e) {
      if (!(e && e.name === "AbortError")) { try { doc.save(fname); } catch (e2) { /* ignore */ } }
    }
  };

  // Build the full stock list as a PDF and share it (mobile) or download it.
  const sharePDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ink = [28, 54, 54], brass = [153, 111, 35], brassSoft = [199, 154, 62], gray = [110, 118, 115], lineCol = [225, 222, 215], paleBg = [250, 249, 246];
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };
      const fmtD = (d) => { if (!d) return ""; try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return ""; } };
      const cmpBB = (a, b) => { const da = a.bestBefore ? new Date(a.bestBefore).getTime() : Infinity; const db = b.bestBefore ? new Date(b.bestBefore).getTime() : Infinity; return da - db; };
      const money2 = (v) => { const n = parseFloat(v); return isNaN(n) ? "" : `£${n.toFixed(2)}`; };

      // Header band
      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(243, 239, 230);
      doc.text("The Curfew", M, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(brassSoft[0], brassSoft[1], brassSoft[2]);
      doc.text("MICROPUB · STOCK LIST", M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 14, { align: "right" });
      const counts = `${lines.filter((l) => l.status === "on").length} on  ·  ${lines.filter((l) => ["tapped", "vented", "racked"].includes(l.status)).length} in cellar  ·  ${lines.filter((l) => l.status === "in_cellar").length} in store`;
      doc.text(counts, W - M, 20.5, { align: "right" });
      y = 36;

      const sectionHead = (t, n) => {
        ensure(16);
        y += 4;
        doc.setFillColor(brass[0], brass[1], brass[2]); doc.rect(M, y - 4, 2.2, 5.2, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(t, M + 4.5, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(String(n), W - M, y, { align: "right" });
        y += 5.5;
      };
      const subHead = (t) => { ensure(11); y += 3.5; doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(brass[0], brass[1], brass[2]); doc.text(t.toUpperCase(), M, y); y += 4.8; };
      const catHead = (t) => { ensure(9); y += 2.4; doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text(t, M + 3, y); y += 4.2; };

      // One stock line as a card row: accent bar, name, meta, and a right column with
      // pump/stage pill, price, and best-before.
      const beerLine = (l, accentHex, opts) => {
        const o = opts || {};
        const b = beerById[l.beerId]; if (!b) return;
        const name = `${b.brewery ? b.brewery + " - " : ""}${b.name || ""}`;
        const dt = (DRINK_TYPES.find((t) => t.key === l.drinkType) || {}).label || l.drinkType;
        const meta = [dt, b.style, b.abv ? b.abv + "%" : "", b.location || "", (l.caskOwner && l.drinkType !== "cider" && l.drinkType !== "keykeg") ? `Delivered by: ${l.caskOwner}` : ""].filter(Boolean).join("  ·  ");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        const nameLines = doc.splitTextToSize(name, W - 2 * M - 38);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8);
        const metaLines = doc.splitTextToSize(meta, W - 2 * M - 38);
        const hasBB = !!l.bestBefore;
        const topPad = 4.2, lhName = 3.9, lhMeta = 3.5, lhBB = 3.6, bottomPad = 2.4;
        const contentH = lhName * nameLines.length + lhMeta * metaLines.length + (hasBB ? lhBB : 0);
        const rowH = Math.max(topPad + contentH + bottomPad, 10.5);
        ensure(rowH + 1.2);

        doc.setFillColor(paleBg[0], paleBg[1], paleBg[2]); doc.rect(M, y, W - 2 * M, rowH, "F");
        const ac = hex(accentHex); doc.setFillColor(ac[0], ac[1], ac[2]); doc.rect(M, y, 1.4, rowH, "F");

        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(metaLines, M + 4.5, ty); ty += lhMeta * metaLines.length;
        if (hasBB) { doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(170, 100, 40); doc.text(`Best before ${fmtD(l.bestBefore)}`, M + 4.5, ty); }

        const rx = W - M - 3;
        let ry = y + 4.4;
        if (o.pill) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(255, 255, 255);
          const tw = doc.getTextWidth(o.pill) + 4;
          doc.setFillColor(ac[0], ac[1], ac[2]); doc.roundedRect(rx - tw, ry - 3.1, tw, 4.4, 1, 1, "F");
          doc.text(o.pill, rx - tw / 2, ry, { align: "center" });
          ry += 6.4;
        }
        if (l.price) { doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(money2(l.price), rx, ry, { align: "right" }); }

        y += rowH + 1.4;
      };

      const onL = lines.filter((l) => l.status === "on").slice().sort((a, b) => ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(a.slot) - ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(b.slot));
      const prepOrder = { tapped: 0, vented: 1, racked: 2 };
      const prep = lines.filter((l) => ["tapped", "vented", "racked"].includes(l.status)).sort((a, b) => prepOrder[a.status] - prepOrder[b.status]);
      const storeL = lines.filter((l) => l.status === "in_cellar");

      if (onL.length) {
        sectionHead("On", onL.length);
        onL.forEach((l) => beerLine(l, TYPE_ACCENT[l.drinkType] || "#B8862B", { pill: (l.status === "on" && l.slot) ? PUMP_LABELS[l.slot] : null }));
        y += 1.5;
      }
      if (prep.length) {
        sectionHead("In cellar", prep.length);
        prep.forEach((l) => beerLine(l, TYPE_ACCENT[l.drinkType] || "#B8862B", { pill: (STATUS_BY_KEY[l.status] && STATUS_BY_KEY[l.status].label) || null }));
        y += 1.5;
      }
      if (storeL.length) {
        sectionHead("In store", storeL.length);
        [["cask", "Cask"], ["keg", "Keg"], ["keykeg", "Key Keg"], ["cider", "Cider"]].forEach(([dt, label]) => {
          const items = storeL.filter((l) => l.drinkType === dt);
          if (!items.length) return;
          subHead(label);
          if (dt === "cask") {
            CATEGORIES.forEach((cat) => {
              const sub = items.filter((l) => (beerById[l.beerId] && beerById[l.beerId].category || "Misc") === cat).sort(cmpBB);
              if (!sub.length) return;
              catHead(cat); sub.forEach((l) => beerLine(l, CAT_ACCENT[cat] || "#96A19B", {}));
            });
          } else {
            items.slice().sort(cmpBB).forEach((l) => beerLine(l, TYPE_ACCENT[dt] || "#B8862B", {}));
          }
          y += 1;
        });
      }
      if (!onL.length && !prep.length && !storeL.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text("No stock yet.", M, y); }

      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(lineCol[0], lineCol[1], lineCol[2]); doc.line(M, H - 10, W - M, H - 10);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(`Page ${p} of ${pageCount}`, W - M, H - 6, { align: "right" });
      }

      const fname = "curfew-stock-list.pdf";
      const blob = doc.output("blob");
      try {
        const file = new File([blob], fname, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Curfew stock list" });
        } else {
          doc.save(fname);
        }
      } catch (e) {
        if (!(e && e.name === "AbortError")) { try { doc.save(fname); } catch (e2) { /* ignore */ } }
      }
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Builds the customer tap list as a shareable PDF: what's on, grouped and priced.
  const shareTapListPDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const ink = [28, 54, 54], brass = [153, 111, 35], brassSoft = [199, 154, 62], gray = [110, 118, 115], lineCol = [225, 222, 215], paleBg = [250, 249, 246];
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(243, 239, 230);
      doc.text("The Curfew", M, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(brassSoft[0], brassSoft[1], brassSoft[2]);
      doc.text("MICROPUB · WHAT'S ON TODAY", M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 14, { align: "right" });
      y = 36;

      const sectionHead = (t) => { ensure(16); y += 4; doc.setFillColor(brass[0], brass[1], brass[2]); doc.rect(M, y - 4, 2.2, 5.2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(t, M + 4.5, y); y += 5.5; };
      const catHead = (t) => { ensure(9); y += 2.4; doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text(t, M + 3, y); y += 4.2; };

      const beerLine = (l, accentRGB) => {
        const b = beerById[l.beerId]; if (!b) return;
        const name = `${b.brewery ? b.brewery + " - " : ""}${b.name || ""}`;
        const tlp = priceTriple(l.price);
        const meta = [b.style, b.abv ? b.abv + "%" : "", b.clarity === "Hazy" ? "Hazy" : "", b.location || ""].filter(Boolean).join("  ·  ");
        const diet = [b.vegan ? "Vegan" : "", b.glutenStatus === "Gluten-free" ? "Gluten-free" : b.glutenStatus === "Low gluten" ? "Low gluten, <20ppm" : ""].filter(Boolean).join("  ·  ");
        const allergenLine = b.allergensVerified ? (b.allergens.length ? `Contains: ${b.allergens.join(", ")}` : "No declared allergens") : "Allergens: please ask at the bar";
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        const nameLines = doc.splitTextToSize(name, W - 2 * M - 38);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8);
        const metaLines = doc.splitTextToSize(meta, W - 2 * M - 38);
        const noteLines = b.notes ? doc.splitTextToSize(b.notes, W - 2 * M - 8) : [];
        const dietLine = diet ? 1 : 0;
        const allergenLines = doc.splitTextToSize(allergenLine, W - 2 * M - 8);
        const topPad = 4.2, lhName = 3.9, lhMeta = 3.5, lhNote = 3.4, lhDiet = 3.4, lhAllergen = 3.2, bottomPad = 2.4;
        const contentH = lhName * nameLines.length + lhMeta * metaLines.length + lhNote * noteLines.length + lhDiet * dietLine + lhAllergen * allergenLines.length;
        const rowH = Math.max(topPad + contentH + bottomPad, 10.5);
        ensure(rowH + 1.2);

        doc.setFillColor(paleBg[0], paleBg[1], paleBg[2]); doc.rect(M, y, W - 2 * M, rowH, "F");
        doc.setFillColor(accentRGB[0], accentRGB[1], accentRGB[2]); doc.rect(M, y, 1.4, rowH, "F");

        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(metaLines, M + 4.5, ty); ty += lhMeta * metaLines.length;
        if (noteLines.length) { doc.setFont("helvetica", "italic"); doc.setFontSize(7.6); doc.setTextColor(110, 110, 110); doc.text(noteLines, M + 4.5, ty); ty += lhNote * noteLines.length; }
        if (diet) { doc.setFont("helvetica", "bold"); doc.setFontSize(7.4); doc.setTextColor(brass[0], brass[1], brass[2]); doc.text(diet, M + 4.5, ty); ty += lhDiet; }
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(150, 150, 150);
        doc.text(allergenLines, M + 4.5, ty);

        if (tlp) {
          const rx = W - M - 3;
          doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(brass[0], brass[1], brass[2]);
          doc.text(tlp.pint, rx, y + 5.5, { align: "right" });
          doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(gray[0], gray[1], gray[2]);
          doc.text(`Half ${tlp.half} · Schooner ${tlp.schooner}`, rx, y + 9, { align: "right" });
        }
        y += rowH + 1.4;
      };

      const onL = lines.filter((l) => l.status === "on").slice().sort((a, b) => ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(a.slot) - ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(b.slot));
      const cask = onL.filter((l) => l.drinkType === "cask");
      const keg = onL.filter((l) => l.drinkType === "keg" || l.drinkType === "keykeg");
      const cider = onL.filter((l) => l.drinkType === "cider");

      if (cask.length) {
        sectionHead("Cask ale");
        CATEGORIES.forEach((cat) => {
          const items = cask.filter((l) => (beerById[l.beerId] && beerById[l.beerId].category || "Misc") === cat);
          if (!items.length) return;
          catHead(cat); items.forEach((l) => beerLine(l, hex(CAT_ACCENT[cat] || "#96A19B")));
        });
        y += 1;
      }
      if (keg.length) { sectionHead("Keg"); keg.forEach((l) => beerLine(l, hex(TYPE_ACCENT[l.drinkType] || "#3E8C82"))); y += 1; }
      if (cider.length) { sectionHead("Draught cider"); cider.forEach((l) => beerLine(l, hex(TYPE_ACCENT.cider))); y += 1; }
      if (!onL.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text("Nothing on right now.", M, y); }

      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(lineCol[0], lineCol[1], lineCol[2]); doc.line(M, H - 10, W - M, H - 10);
        doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text("Please confirm allergens with staff before ordering.", M, H - 6);
        doc.setFont("helvetica", "normal"); doc.text(`Page ${p} of ${pageCount}`, W - M, H - 6, { align: "right" });
      }
      await sharePdfDoc(doc, "curfew-tap-list.pdf", "Curfew tap list");
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Builds the allergen and dietary guide as a shareable PDF.
  const shareGuidePDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const ink = [28, 54, 54], brassSoft = [199, 154, 62], gray = [110, 118, 115];
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(243, 239, 230);
      doc.text("How to use The Curfew Cellar", M, 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(brassSoft[0], brassSoft[1], brassSoft[2]);
      doc.text("THE CURFEW MICROPUB · STAFF GUIDE", M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 13, { align: "right" });
      y = 36;

      GUIDE_SECTIONS.forEach((sec) => {
        ensure(18);
        doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(sec.title, M, y); y += 2.5;
        doc.setDrawColor(brassSoft[0], brassSoft[1], brassSoft[2]); doc.setLineWidth(0.5);
        doc.line(M, y, M + 10, y); y += 5;
        sec.steps.forEach(([h, t]) => {
          const lines = doc.splitTextToSize(t, W - M * 2 - 4);
          ensure(5 + lines.length * 4 + 3);
          doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
          doc.text(h, M, y); y += 4.2;
          doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(gray[0], gray[1], gray[2]);
          doc.text(lines, M + 4, y); y += lines.length * 4 + 3;
        });
        y += 3;
      });

      await sharePdfDoc(doc, "curfew-cellar-guide.pdf", "How to use The Curfew Cellar");
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally { setPdfBusy(false); }
  };

  const shareAllergenPDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const ink = [28, 54, 54], brass = [153, 111, 35], brassSoft = [199, 154, 62], gray = [110, 118, 115], lineCol = [225, 222, 215], paleBg = [250, 249, 246];
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(243, 239, 230);
      doc.text("Allergen and Dietary Guide", M, 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(brassSoft[0], brassSoft[1], brassSoft[2]);
      doc.text("THE CURFEW MICROPUB · PLEASE CONFIRM WITH STAFF BEFORE ORDERING", M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 13, { align: "right" });
      y = 36;

      const sectionHead = (t) => { ensure(16); y += 4; doc.setFillColor(brass[0], brass[1], brass[2]); doc.rect(M, y - 4, 2.2, 5.2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(t, M + 4.5, y); y += 5.5; };

      const beerLine = (l, accentRGB) => {
        const b = beerById[l.beerId]; if (!b) return;
        const name = `${b.brewery ? b.brewery + " - " : ""}${b.name || ""}`;
        const diet = [b.vegan ? "Vegan" : "", b.glutenStatus === "Gluten-free" ? "Gluten-free" : b.glutenStatus === "Low gluten" ? "Low gluten, <20ppm" : ""].filter(Boolean).join("  ·  ");
        const allergenText = (b.allergensVerified ? (b.allergens.length ? `Contains: ${b.allergens.join(", ")}` : "No declared allergens") : "Allergens: please ask at the bar") + (b.allergensVerified ? "" : "  ·  not staff verified");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        const nameLines = doc.splitTextToSize(name, W - 2 * M - 40);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8);
        const dietLines = diet ? doc.splitTextToSize(diet, W - 2 * M - 8) : [];
        const allergenLines = doc.splitTextToSize(allergenText, W - 2 * M - 8);
        const topPad = 4.2, lhName = 3.9, lhDiet = 3.5, lhAllergen = 3.5, bottomPad = 2.4;
        const contentH = lhName * nameLines.length + lhDiet * dietLines.length + lhAllergen * allergenLines.length;
        const rowH = Math.max(topPad + contentH + bottomPad, 10.5);
        ensure(rowH + 1.2);

        doc.setFillColor(paleBg[0], paleBg[1], paleBg[2]); doc.rect(M, y, W - 2 * M, rowH, "F");
        doc.setFillColor(accentRGB[0], accentRGB[1], accentRGB[2]); doc.rect(M, y, 1.4, rowH, "F");

        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        const rx = W - M - 3;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(`${b.abv ? b.abv + "%" : ""}`, rx, y + topPad, { align: "right" });
        if (dietLines.length) { doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(brass[0], brass[1], brass[2]); doc.text(dietLines, M + 4.5, ty); ty += lhDiet * dietLines.length; }
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.4);
        if (b.allergensVerified) doc.setTextColor(130, 130, 130); else doc.setTextColor(180, 110, 50);
        doc.text(allergenLines, M + 4.5, ty);
        y += rowH + 1.4;
      };

      const onL = lines.filter((l) => l.status === "on");
      const dtGroups = [["cask", "Cask ale"], ["keg", "Keg"], ["keykeg", "Keg"], ["cider", "Draught cider"]];
      const labelOrder = ["Cask ale", "Keg", "Draught cider"];
      labelOrder.forEach((label) => {
        const dts = dtGroups.filter(([d, l2]) => l2 === label).map(([d]) => d);
        const items = onL.filter((l) => dts.includes(l.drinkType));
        if (!items.length) return;
        sectionHead(label);
        items.forEach((l) => beerLine(l, hex(TYPE_ACCENT[l.drinkType] || "#B8862B")));
      });
      if (!onL.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text("Nothing on right now.", M, y); }

      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(lineCol[0], lineCol[1], lineCol[2]); doc.line(M, H - 10, W - M, H - 10);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(`Page ${p} of ${pageCount}`, W - M, H - 6, { align: "right" });
      }
      await sharePdfDoc(doc, "curfew-allergen-guide.pdf", "Curfew allergen guide");
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Save when data changes, debounced so fast typing (e.g. prices) stays smooth.
  // The write (full serialise + cloud upsert) runs ~half a second after the last change.
  const saveTimer = useRef(null);
  const saveInFlight = useRef(false);
  useEffect(() => {
    if (!hydrated || !store || storageOk !== true || (cloudMode && (!authed || !cloudReady))) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      (async () => {
        saveInFlight.current = true;
        try {
          const r = await store.set(STORE_KEY, JSON.stringify({ library, lines, distributors, prefs, lastUpdated }), false);
          if (r && r.conflict) { applyData(migrate(r.remoteValue), true); showToast("Another phone saved changes just before yours. Showing the latest, please redo your last change."); }
        } catch (e) { /* ignore */ }
        finally { saveInFlight.current = false; }
      })();
    }, 500);
    return () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } };
  }, [library, lines, distributors, prefs, lastUpdated, hydrated, storageOk, authed, cloudReady]);

  // iOS can suspend or kill a backgrounded tab before the 500ms debounce above fires,
  // so a tap made right before switching apps could be lost. Keep the latest snapshot
  // in a ref and force an immediate (best-effort; no delivery guarantee) write the
  // moment the page is hidden or closed, if a save was still pending.
  const pendingSnapshot = useRef(null);
  useEffect(() => { pendingSnapshot.current = { library, lines, distributors, prefs, lastUpdated }; }, [library, lines, distributors, prefs, lastUpdated]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const flush = () => {
      if (!saveTimer.current) return; // nothing pending, already saved
      clearTimeout(saveTimer.current); saveTimer.current = null;
      if (!store || storageOk !== true || (cloudMode && (!authed || !cloudReady))) return;
      try { store.set(STORE_KEY, JSON.stringify(pendingSnapshot.current), false); } catch (e) { /* best-effort only */ }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", flush); };
  }, [store, storageOk, cloudMode, authed, cloudReady]);

  // iOS's own "keep the focused field above the keyboard" behaviour is tied to the page
  // scrolling naturally; now that real scrolling happens in one dedicated inner region
  // instead of the document, iOS doesn't reliably account for the keyboard there anymore.
  // Scroll the focused field into view ourselves once the keyboard has actually finished
  // animating in (via visualViewport's resize event, with a fallback timer in case that
  // doesn't fire), rather than fighting or guessing at a fixed delay.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const scrollIntoView = (el) => { if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" }); };
    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (window.visualViewport) {
        const onResize = () => { scrollIntoView(el); window.visualViewport.removeEventListener("resize", onResize); };
        window.visualViewport.addEventListener("resize", onResize);
        setTimeout(() => { window.visualViewport.removeEventListener("resize", onResize); scrollIntoView(el); }, 400);
      } else {
        setTimeout(() => scrollIntoView(el), 400);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // Stamp "last updated" whenever a beer is added or changed (not on first load or a remote sync)
  useEffect(() => {
    if (!hydrated) return;
    if (skipBump.current) { skipBump.current = false; return; }
    if (!bumpReady.current) { bumpReady.current = true; return; }
    const now = new Date().toISOString();
    lastUpdatedRef.current = now;
    setLastUpdated(now);
  }, [lines, library, hydrated]);

  useEffect(() => {
    if (!(openId || libraryOpenId || editBeerId || swap || showAlerts || menuOpen) || typeof document === "undefined") return;
    const onKey = (e) => { if (e.key === "Escape") { setEditBeerId(null); setOpenId(null); setLibraryOpenId(null); setSwap(null); setShowAlerts(false); setMenuOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [openId, libraryOpenId, editBeerId, swap, showAlerts, menuOpen]);


  useEffect(() => {
    if (typeof document === "undefined") return;
    let m = document.querySelector('meta[name="viewport"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "viewport"); document.head.appendChild(m); }
    m.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  }, []);

  const resetDemo = () => {
    setLibrary(clone(seedLibrary));
    setLines(assignPumps(clone(seedLines), catFromLib(seedLibrary)));
    setDistributors(clone(seedDistributors));
    setLastUpdated(new Date().toISOString());
    setOpenId(null); setHistoryOpen({}); setLibrarySearch(""); setForm(emptyForm); setFillNote(null); setView("cellar"); setConfirmReset(false); setResetText("");
  };

  const exportData = () => JSON.stringify({ app: "thecurfewcellar", version: 1, exportedAt: new Date().toISOString(), library, lines }, null, 2);
  const noteBackupTaken = () => {
    const stamp = new Date().toISOString();
    const nextPrefs = { ...prefs, lastBackup: stamp };
    setPrefs(nextPrefs);
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (store && storageOk === true && (!cloudMode || (authed && cloudReady))) {
      (async () => { try { await store.set(STORE_KEY, JSON.stringify({ library, lines, distributors, prefs: nextPrefs, lastUpdated }), false); } catch (e) { /* ignore */ } })();
    }
  };
  const copyBackup = async () => {
    try { await navigator.clipboard.writeText(exportData()); noteBackupTaken(); setBackupMsg({ type: "ok", text: "Backup copied to clipboard." }); }
    catch (e) { setBackupMsg({ type: "warn", text: "Couldn't copy automatically. Select the text below and copy it manually." }); }
  };
  const downloadBackup = () => {
    try {
      const blob = new Blob([exportData()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `curfew-cellar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      noteBackupTaken();
      setBackupMsg({ type: "ok", text: "Backup file downloaded." });
    } catch (e) { setBackupMsg({ type: "warn", text: "Download isn't available in this view. Use Copy backup instead." }); }
  };
  const prepareImport = (text) => {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.library) || !Array.isArray(data.lines)) throw new Error("shape");
      setPendingImport({ library: data.library, lines: data.lines });
      setBackupMsg({ type: "ask", text: `Found ${data.library.length} saved items and ${data.lines.length} cellar lines. Importing replaces everything currently in the app.` });
    } catch (e) { setPendingImport(null); setBackupMsg({ type: "warn", text: "That doesn't look like a valid Curfew backup." }); }
  };
  const handleFile = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => prepareImport(String(reader.result));
    reader.onerror = () => setBackupMsg({ type: "warn", text: "Couldn't read that file." });
    reader.readAsText(file);
    ev.target.value = "";
  };
  const confirmImport = () => {
    if (!pendingImport) return;
    setLibrary(pendingImport.library); setLines(pendingImport.lines);
    setPendingImport(null); setImportText(""); setOpenId(null); setHistoryOpen({}); setView("cellar");
    setBackupMsg({ type: "ok", text: "Backup imported." });
  };

  const autoFill = async () => {
    if (!form.name.trim()) { setFillNote({ type: "warn", text: "Add a name first." }); return; }
    setLoading(true);
    setFillNote({ type: "loading", text: "Filling in a draft…" });
    const isCider = form.drinkType === "cider";
    const prompt = buildAutofillPrompt(form.brewery, form.name, isCider);
    let stage = "network";
    try {
      const res = await fetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error("status " + res.status);
      const data = await res.json();
      stage = "parse";
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      let p;
      try {
        p = JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim());
      } catch {
        const m = text.match(/\{[\s\S]*\}/); // pull the JSON out if it came back wrapped in text
        if (!m) throw new Error("no json");
        p = JSON.parse(m[0]);
      }
      const allergens = Array.isArray(p.allergens) ? p.allergens.filter((a) => ALLERGEN_OPTIONS.includes(a)) : [];
      const style = p.style ? String(p.style) : "";
      const abv = p.abv != null ? String(p.abv) : "";
      const merged = {
        style: form.style.trim() ? form.style : style,
        abv: form.abv.trim() ? form.abv : abv,
        brewery: form.brewery.trim() ? form.brewery : (p.brewery ? cleanBrewery(p.brewery) : form.brewery),
        name: form.name.trim() ? form.name : (p.name ? String(p.name) : form.name),
        location: form.location.trim() ? form.location : (libraryLocationFor(p.brewery ? String(p.brewery) : form.brewery) || (p.location ? String(p.location) : form.location)),
        clarity: form.clarity ? form.clarity : (CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : (p.clarity === "Cloudy" ? "Hazy" : "Clear")),
        glutenStatus: (form.glutenStatus && form.glutenStatus !== "Standard") ? form.glutenStatus : (GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard"),
        vegan: form.vegan || !!p.vegan,
        allergens: form.allergens.length ? form.allergens : allergens,
        notes: form.notes.trim() ? form.notes : (p.notes ? String(p.notes) : ""),
        allergensVerified: form.allergensVerified,
        category: deriveCategory(form.drinkType, style, abv),
        sweetness: form.sweetness ? form.sweetness : (CIDER_SWEETNESS.includes(p.sweetness) ? p.sweetness : form.sweetness),
      };
      setF(merged);
      setFillNote(withContradictionCheck(autofillNote(p), { ...merged, drinkType: form.drinkType }));
    } catch (err) {
      const d = aiDraft(form.name);
      setF({ ...d, category: deriveCategory(form.drinkType, d.style, d.abv), sweetness: form.sweetness ? form.sweetness : (d.sweetness || form.sweetness) });
      const msg = stage === "parse"
        ? "The draft came back in an odd format, so a quick local one was used instead. Try again, or just check the details."
        : "Couldn't reach the lookup service just now. A quick local draft was used, so double-check the details.";
      setFillNote({ type: "warn", text: msg });
    } finally { setLoading(false); }
  };

  const toggleAllergen = (a) => setF({ allergens: form.allergens.includes(a) ? form.allergens.filter((x) => x !== a) : [...form.allergens, a] });

  const addLine = () => {
    if (!form.brewery.trim() || !form.name.trim()) { setFillNote({ type: "warn", text: "Producer and name are required." }); return; }
    // Duplicate guard: if this beer already has a live line in the cellar, ask once before
    // adding another. A second tap of the button confirms (multiple casks is legitimate).
    const dupSaved = findSavedBeer(form.brewery, form.name);
    const liveDupes = dupSaved ? lines.filter((l) => l.beerId === dupSaved.id && l.status !== "off").length : 0;
    if (liveDupes > 0 && !confirmDupe) {
      setConfirmDupe(true);
      setFillNote({ type: "warn", text: `Already ${liveDupes === 1 ? "one" : liveDupes} of these in the cellar. Tap "Add to cellar" again if this is another ${form.drinkType === "cask" ? "cask" : "one"}.` });
      return;
    }
    setConfirmDupe(false);
    const category = form.drinkType === "cask" ? (form.category || categorise(form.style, form.abv)) : (form.category || "Misc");
    const beerFields = {
      brewery: form.brewery.trim(), location: form.location.trim(), name: form.name.trim(),
      style: form.style.trim(), abv: form.abv.trim(), clarity: form.clarity, glutenStatus: form.glutenStatus,
      vegan: form.vegan, allergens: form.allergens, notes: form.notes.trim(), allergensVerified: form.allergensVerified, category, sweetness: form.sweetness,
      price: form.price.trim(),
    };
    const entry = { date: new Date().toISOString(), abv: form.abv.trim(), price: form.price.trim(), caskOwner: (form.caskOwner.trim() || form.brewery.trim()) };
    const saved = findSavedBeer(form.brewery, form.name);
    let beerId;
    if (saved) { beerId = saved.id; setLibrary((lib) => lib.map((b) => (b.id === saved.id ? { ...b, ...beerFields, history: [...(b.history || []), entry], pendingBestBefore: "", pendingCaskOwner: "", pendingPrice: "", pendingDrinkType: "" } : b))); }
    else { beerId = uid(); setLibrary((lib) => [...lib, { id: beerId, ...beerFields, history: [entry] }]); }
    const dates = { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: null };
    dates[STATUSES[STATUS_INDEX[form.status]].dateKey] = new Date().toISOString();
    const id = uid();
    setLines((ls) => [...ls, { id, beerId, drinkType: form.drinkType, size: form.size, price: form.price.trim(), status: form.status, caskOwner: form.caskOwner.trim() || form.brewery.trim(), collected: false, bestBefore: form.bestBefore, dates }]);
    setForm(emptyForm); setFillNote(null); setAddMode("pick"); setView("cellar"); setOpenId(id);
  };

  const catOfLine = (l) => beerById[l.beerId]?.category || "Misc";
  const freePumpFor = (ls, line, excludeId) => {
    const drink = PUMP_DRINK(line.drinkType);
    const taken = new Set(ls.filter((x) => x.status === "on" && PUMP_DRINK(x.drinkType) === drink && x.id !== line.id && x.id !== excludeId).map((x) => x.slot));
    if (drink === "cask") { const p = caskPrefPumps(catOfLine(line)).find((x) => !taken.has(x)); if (p) return p; }
    return PUMPS[drink].find((x) => !taken.has(x)) || null;
  };
  const advance = (id) => {
    const before = lines.find((x) => x.id === id);
    if (before) {
      const flow0 = flowFor(before.drinkType);
      const i0 = flow0.indexOf(before.status);
      const nk = i0 >= 0 && i0 < flow0.length - 1 ? flow0[i0 + 1] : null;
      const b = beerById[before.beerId];
      const nm = b ? `${b.brewery ? b.brewery + " " : ""}${b.name}` : "A beer";
      if (nk === "on") sendCellarPush("Now pouring", nm);
      if (nk === "off") sendCellarPush("Line finished", nm);
    }
    return setLines((ls) => {
    const cur = ls.find((x) => x.id === id);
    if (!cur) return ls;
    const flow = flowFor(cur.drinkType);
    const i = flow.indexOf(cur.status);
    if (i < 0 || i >= flow.length - 1) return ls;
    const nextKey = flow[i + 1];
    const next = STATUS_BY_KEY[nextKey];
    const slot = nextKey === "on" ? freePumpFor(ls, cur, id) : cur.slot || null;
    return ls.map((c) => {
      if (c.id !== id) return c;
      const dates = { ...c.dates };
      if (!dates[next.dateKey]) dates[next.dateKey] = new Date().toISOString();
      return { ...c, status: nextKey, dates, slot };
    });
  });
  };
  const goBack = (id) => setLines((ls) => ls.map((c) => {
    if (c.id !== id) return c;
    const flow = flowFor(c.drinkType);
    const i = flow.indexOf(c.status);
    if (i <= 0) return c;
    const dates = { ...c.dates };
    dates[STATUS_BY_KEY[c.status].dateKey] = null;
    return { ...c, status: flow[i - 1], dates, slot: c.status === "on" ? null : c.slot };
  }));
  const setBestBefore = (id, v) => setLines((ls) => ls.map((c) => (c.id === id ? { ...c, bestBefore: v } : c)));
  const finishAndChoose = (line) => {
    const beer = beerById[line.beerId];
    sendCellarPush("Line finished", beer ? `${beer.brewery ? beer.brewery + " " : ""}${beer.name}` : "A beer");
    snapshotUndo("Line finished");
    const now = new Date().toISOString();
    setLines((ls) => ls.map((c) => (c.id === line.id ? { ...c, status: "off", slot: null, dates: { ...c.dates, off: now } } : c)));
    setOpenId(null);
    setSwap({ drink: line.drinkType, category: line.drinkType === "cask" ? (beer ? (beer.category || "Misc") : null) : null, oldId: null, slot: line.slot || null });
  };
  const openPump = (slot) => {
    const cat = slot.drink === "cask" ? (slot.slot === "cask2" ? "Bitter" : slot.slot === "cask3" ? "Stout/Porter" : "IPA") : null;
    setSwap({ drink: slot.drink, category: cat, oldId: null, slot: slot.slot });
  };
  const openRack = (label) => {
    const cat = label === "Bitter" ? "Bitter" : label === "Stout" ? "Stout/Porter" : label === "Pale" ? "Pale" : label === "IPA" ? "IPA" : null;
    setSwap({ drink: "cask", category: cat, oldId: null, slot: null, toRack: true });
  };
  const doSwap = (newId, oldId, slot) => {
    const toRack = swap && swap.toRack;
    if (!toRack) {
      const nb = (() => { const l = lines.find((c) => c.id === newId); const b = l && beerById[l.beerId]; return b ? `${b.brewery ? b.brewery + " " : ""}${b.name}` : "A beer"; })();
      sendCellarPush("Now pouring", nb);
    }
    snapshotUndo(toRack ? "Cask racked" : "Beer changed");
    const now = new Date().toISOString();
    setLines((ls) => {
      const newLine = ls.find((c) => c.id === newId);
      const pump = slot || (newLine ? freePumpFor(ls, newLine, oldId) : null);
      return ls.map((c) => {
        if (oldId && c.id === oldId) return { ...c, status: "off", slot: null, dates: { ...c.dates, off: now } };
        if (c.id === newId) {
          if (toRack) return { ...c, status: "racked", dates: { ...c.dates, racked: c.dates.racked || now } };
          return { ...c, status: "on", slot: pump, dates: { ...c.dates, on: c.dates.on || now } };
        }
        return c;
      });
    });
    setSwap(null);
    setSwapPreviewId(null);
  };
  const setLineCategory = (id, beerId, cat) => { setLibrary((lib) => lib.map((b) => (b.id === beerId ? { ...b, category: cat } : b))); };
  const verify = (beerId) => setLibrary((lib) => lib.map((b) => (b.id === beerId ? { ...b, allergensVerified: true } : b)));
  const updateBeer = (id, patch) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  // Writes the price to the library (as a cache for beers with no live line) and to the beer's
  // live lines. Deliberately does NOT touch finished ("off") lines: those casks have already
  // been sold and returned, and rewriting their price would retroactively falsify what was
  // actually charged. Past prices are preserved in each beer's history entries.
  const updateBeerPrice = (id, v) => { setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, price: v } : b))); setLines((ls) => ls.map((c) => (c.beerId === id && c.status !== "off" ? { ...c, price: v } : c))); };
  const toggleBeerAllergen = (id, a) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, allergens: b.allergens.includes(a) ? b.allergens.filter((x) => x !== a) : [...b.allergens, a] } : b)));
  const autoFillBeer = async (beer) => {
    if (!beer.name || !beer.name.trim()) { setEditNote({ type: "warn", text: "Add a name first." }); return; }
    setEditBusy(true); setEditNote({ type: "loading", text: "Filling in a draft…" });
    const isCider = /cider|perry/i.test(`${beer.style || ""} ${beer.name || ""}`);
    const prompt = buildAutofillPrompt(beer.brewery, beer.name, isCider);
    try {
      const res = await fetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error("status " + res.status);
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      let p;
      try { p = JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim()); }
      catch { const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("no json"); p = JSON.parse(m[0]); }
      const allergens = Array.isArray(p.allergens) ? p.allergens.filter((a) => ALLERGEN_OPTIONS.includes(a)) : beer.allergens;
      const style = p.style ? String(p.style) : beer.style;
      const abv = p.abv != null ? String(p.abv) : beer.abv;
      const merged = {
        style: beer.style ? beer.style : style,
        abv: beer.abv ? beer.abv : abv,
        brewery: beer.brewery.trim() ? beer.brewery : (p.brewery ? cleanBrewery(p.brewery) : beer.brewery),
        name: beer.name.trim() ? beer.name : (p.name ? String(p.name) : beer.name),
        location: beer.location.trim() ? beer.location : (libraryLocationFor(p.brewery ? String(p.brewery) : beer.brewery) || (p.location ? String(p.location) : beer.location)),
        clarity: beer.clarity ? beer.clarity : (CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : (p.clarity === "Cloudy" ? "Hazy" : "Clear")),
        glutenStatus: (beer.glutenStatus && beer.glutenStatus !== "Standard") ? beer.glutenStatus : (GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard"),
        vegan: beer.vegan || !!p.vegan,
        allergens: (beer.allergens && beer.allergens.length) ? beer.allergens : allergens,
        notes: beer.notes ? beer.notes : (p.notes ? String(p.notes) : beer.notes),
        allergensVerified: false,
        category: (beer.category && beer.category !== "Misc") ? beer.category : deriveCategory(isCider ? "cider" : "cask", style, abv),
        sweetness: beer.sweetness ? beer.sweetness : (CIDER_SWEETNESS.includes(p.sweetness) ? p.sweetness : beer.sweetness),
      };
      updateBeer(beer.id, merged);
      setEditNote(withContradictionCheck(autofillNote(p), { ...merged, drinkType: isCider ? "cider" : "cask" }));
    } catch (err) {
      setEditNote({ type: "warn", text: "Couldn't auto-fill just now. Add the details by hand." });
    } finally { setEditBusy(false); }
  };
  const removeLine = (id) => { snapshotUndo("Removed from cellar"); setLines((ls) => ls.filter((c) => c.id !== id)); setOpenId(null); };
  // Another one of the same beer, e.g. two casks of the same ale in one delivery. It lands In
  // Store (a second cask can't already be on the bar) with a fresh lifecycle, but keeps the
  // price, supplier, best before and container so nothing needs re-typing.
  // Closes the modal deliberately: leaving it open (or worse, re-pointing it at the new copy)
  // looks identical to the original, reads as "nothing happened", and invites repeat taps that
  // each duplicate again. Closing makes the action visibly complete and removes the button.
  const duplicateLine = (id) => {
    const src = lines.find((c) => c.id === id);
    if (!src) return;
    snapshotUndo("Duplicated");
    const dates = { ordered: null, delivered: new Date().toISOString(), racked: null, vented: null, tapped: null, on: null, off: null };
    setLines((ls) => [...ls, { id: uid(), beerId: src.beerId, drinkType: src.drinkType, size: src.size, price: src.price, status: "in_cellar", caskOwner: src.caskOwner, collected: false, bestBefore: src.bestBefore, dates }]);
    setOpenId(null);
    showToast("Duplicated. The copy is In Store.");
  };
  const latestPrice = (beer) => { const h = beer.history || []; return h.length ? h[h.length - 1].price : ""; };
  const latestSupplier = (beer) => { const h = beer.history || []; for (let i = h.length - 1; i >= 0; i--) { if (h[i].caskOwner) return h[i].caskOwner; } return ""; };
  // Loading a beer back from the library for a new delivery. Everything genuinely carries over
  // except best before (a new delivery has its own date) and allergensVerified, which always
  // resets to false: a beer being verified once doesn't mean THIS new delivery has been looked
  // at, ingredients and allergens can change between batches, so every arrival needs its own
  // fresh check regardless of history.
  const loadBeerIntoForm = (beer) => { setConfirmDupe(false); return setForm({ ...emptyForm, drinkType: beer.pendingDrinkType || "cask", brewery: beer.brewery, location: beer.location, name: beer.name, style: beer.style, abv: beer.abv, clarity: beer.clarity, glutenStatus: beer.glutenStatus, vegan: beer.vegan, allergens: beer.allergens, notes: beer.notes, allergensVerified: false, category: beer.category || categorise(beer.style, beer.abv), sweetness: beer.sweetness || "", price: latestPrice(beer) || beer.pendingPrice || "", bestBefore: beer.pendingBestBefore || "", caskOwner: latestSupplier(beer) || beer.pendingCaskOwner || "" }); };
  const pickBeer = (beer) => { loadBeerIntoForm(beer); setFillNote({ type: "ok", text: `Loaded "${beer.name}" from your library. Set the best before, then confirm allergens.` }); setAddMode("form"); };
  const startNewBeer = () => { setForm(emptyForm); setFillNote(null); setAddMode("form"); };
  const addLineOfBeer = (beer) => { loadBeerIntoForm(beer); setFillNote({ type: "ok", text: `Loaded "${beer.name}" from your library.` }); setAddMode("form"); setView("add"); };
  const go = (v) => { if (v === "add") { setAddMode("pick"); setAddPickSearch(""); setForm(emptyForm); setFillNote(null); } if (v === "empties") setPrefs((p) => ({ ...p, empties: {} })); setView(v); if (scrollAreaRef.current) scrollAreaRef.current.scrollTo({ top: 0, behavior: "smooth" }); };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.includes(",") ? s.split(",")[1] : s); };
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
  // phone photos are huge; shrink them so the upload stays small and quick
  const imageToScaledB64 = (file, maxEdge = 1600, quality = 0.82) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { reject(new Error("no dimensions")); return; }
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try { resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]); }
      catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
  // scan output isn't always clean json, this is a bit rough but does the job
  const parseLooseJSON = (text) => { try { return JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim()); } catch { const m = text.match(/[\[{][\s\S]*[\]}]/); if (!m) throw new Error("no json"); return JSON.parse(m[0]); } };
  const visionCall = async (file, promptText, useSearch = false) => {
    const isPdf = file.type === "application/pdf";
    let mediaType = "image/jpeg", b64;
    if (isPdf) { mediaType = "application/pdf"; b64 = await fileToBase64(file); }
    else { try { b64 = await imageToScaledB64(file); mediaType = "image/jpeg"; } catch (e) { b64 = await fileToBase64(file); mediaType = file.type || "image/jpeg"; } }
    const source = { type: "base64", media_type: mediaType, data: b64 };
    const body = { model: MODEL, max_tokens: 2048, messages: [{ role: "user", content: [{ type: isPdf ? "document" : "image", source }, { type: "text", text: promptText }] }] };
    if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const res = await fetch("/api/anthropic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  };
  const distHint = distributors.filter((d) => d.trim()).length ? ` Known distributors: ${distributors.filter((d) => d.trim()).join(", ")}. If one of these appears (often after "To:"), set deliveredBy to it, not the brewery.` : "";
  const labelPrompt = `This image is a beer or cider pump clip, cask end, or bottle/can label. Read what's printed AND use your knowledge of this product (look it up if it helps) to complete the details accurately. Pay close attention to any printed allergen statement, ingredients list, "contains" or "allergy advice" text, or vegan/gluten-free logos on the label itself, cask casks and bottle labels very often state this explicitly. If the label states it, use exactly what it says over any general assumption. Return STRICT JSON only:\\n{"brewery": string, "location": "town or county the brewery is based in (use your knowledge if not printed)", "name": string, "kind": "beer"|"cider", "style": string, "abv": "number as string", "bestBefore": "best before date if printed, as YYYY-MM-DD, reading any dd/mm/yyyy in UK day-month order", "deliveredBy": "distributor or wholesaler named on the label, e.g. after 'To:', else empty", "clarity": "Clear|Hazy", "glutenStatus": "Standard|Low gluten|Gluten-free", "vegan": true|false, "allergens": [only from: ${ALLERGEN_OPTIONS.join(", ")}], "notes": "Exactly two plain sentences, each no longer than 15 words, each ending in a period. First: a genuine tasting note describing flavour and character. Second: a genuine fun fact about this beer, its name, or the brewery. If you do not genuinely know a real fun fact, never invent one, write a second genuine tasting or serving note instead"}\\nIf allergen or vegan/gluten-free information is printed on the label, use it directly. Otherwise verify against the brewery's own website, and if that gives nothing, Untappd, rather than assuming. Only as a last resort, estimate from the style: most ales then get "Barley (gluten)", most ciders get "Sulphites", vegan=false, glutenStatus="Standard". If a field isn't legible or known, use "" for text fields.${distHint} JSON only, no other text.`;
  const labelToItem = (p, i) => {
    const dt = p.kind === "cider" ? "cider" : "cask";
    const style = p.style ? String(p.style) : "";
    const abv = p.abv != null ? String(p.abv) : "";
    return { id: "lb" + i + "_" + uid(), include: true, drinkType: dt, brewery: p.brewery ? cleanBrewery(p.brewery) : "", location: p.location ? String(p.location) : "", name: p.name ? String(p.name) : "", abv, price: "", bestBefore: toISO(p.bestBefore), caskOwner: p.deliveredBy ? String(p.deliveredBy) : "", style, clarity: CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : (p.clarity === "Cloudy" ? "Hazy" : "Clear"), glutenStatus: GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard", vegan: !!p.vegan, allergens: Array.isArray(p.allergens) ? p.allergens.filter((a) => ALLERGEN_OPTIONS.includes(a)) : [], notes: p.notes ? String(p.notes) : "", category: deriveCategory(dt, style, abv) };
  };
  const scanLabel = async (file) => {
    setScanning(true); setScanError(null); setFillNote({ type: "loading", text: "Reading the label…" });
    try {
      const p = parseLooseJSON(await visionCall(file, labelPrompt, true));
      const it = labelToItem(p, 0);
      setForm({ ...emptyForm, drinkType: it.drinkType, brewery: it.brewery, location: it.location, name: it.name, style: it.style, abv: it.abv, bestBefore: it.bestBefore, caskOwner: it.caskOwner, clarity: it.clarity, glutenStatus: it.glutenStatus, vegan: it.vegan, allergens: it.allergens, notes: it.notes, allergensVerified: false, category: it.category });
      setAddMode("form");
      setFillNote(withContradictionCheck({ type: "ai", text: "Read from the label. Check everything, especially allergens, before serving." }, it));
    } catch (e) {
      setScanError("Couldn't read that image. Try a clearer, well-lit photo, or enter it by hand.");
      setFillNote(null);
    } finally { setScanning(false); }
  };
  const scanLabelsBatch = async (files) => {
    setScanning(true); setScanError(null); setInvoiceItems(null);
    const arr = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setScanProgress(`Reading label ${i + 1} of ${files.length}…`);
        try { arr.push(labelToItem(parseLooseJSON(await visionCall(files[i], labelPrompt, true)), i)); } catch (e) { /* skip unreadable */ }
      }
      if (!arr.length) throw new Error("none");
      setInvoiceItems(arr); setBatchSource("labels"); setInvoiceOwner(""); setAddMode("invoice");
    } catch (e) {
      setScanError("Couldn't read those labels. Try clearer photos, or add by hand.");
    } finally { setScanning(false); setScanProgress(null); }
  };
  const scanInvoice = async (file) => {
    setScanning(true); setScanError(null); setInvoiceItems(null);
    try {
      const prompt = `This is a delivery invoice or delivery note from a brewery or drinks wholesaler. Extract every distinct beer or cider product line. Return STRICT JSON array only:\n[{"brewery": string, "name": string, "abv": "number as string or empty", "qty": "quantity ordered as a whole number, default 1", "deliveredBy": "distributor or wholesaler if named, else empty"}]\nRead the Qty column for how many of each product. Do NOT extract any prices. SKIP fuel surcharges, delivery or carriage charges, deposits, credits, VAT, totals and anything that is not an actual beer or cider. If brewery isn't shown per line, infer it from the header.${distHint} JSON array only.`;
      const arr = parseLooseJSON(await visionCall(file, prompt));
      const SKIP = /surcharge|carriage|delivery|deposit|credit|fuel|\bvat\b|total|empties|bottle return/i;
      const expanded = [];
      (Array.isArray(arr) ? arr : []).forEach((x) => {
        const name = x.name ? String(x.name).trim() : "";
        const brewery = x.brewery ? cleanBrewery(x.brewery) : "";
        if (!name || SKIP.test(name) || SKIP.test(brewery)) return;
        const qty = Math.max(1, Math.min(36, parseInt(x.qty, 10) || 1));
        for (let q = 0; q < qty; q++) expanded.push({ id: "inv" + expanded.length, brewery, name, abv: x.abv != null ? String(x.abv) : "", price: "", caskOwner: x.deliveredBy ? String(x.deliveredBy) : "", drinkType: "cask", include: true });
      });
      if (!expanded.length) throw new Error("empty");
      setInvoiceItems(expanded);
      setBatchSource("invoice"); setAddMode("invoice");
    } catch (e) {
      setScanError("Couldn't read that invoice. Try a clearer photo, or add items by hand.");
    } finally { setScanning(false); }
  };
  const updateInvoice = (idx, patch) => setInvoiceItems((items) => items.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  // Two casks of the same beer arrive together often enough that re-typing the row is a chore.
  // Inserts a copy directly beneath the original so they stay side by side while reviewing.
  const duplicateInvoice = (idx) => setInvoiceItems((items) => {
    const copy = { ...items[idx], id: "dup" + uid(), include: true };
    return [...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)];
  });
  const importInvoice = () => {
    const chosen = (invoiceItems || []).filter((x) => x.include && x.name.trim());
    if (!chosen.length) return;
    const nowIso = new Date().toISOString();
    let lib = [...library];
    const newLines = [];
    chosen.forEach((x) => {
      const existing = lib.find((b) => b.brewery.trim().toLowerCase() === x.brewery.trim().toLowerCase() && b.name.trim().toLowerCase() === x.name.trim().toLowerCase());
      const entry = { date: nowIso, abv: x.abv, price: x.price, caskOwner: (x.caskOwner || x.brewery || "").trim() };
      let beerId;
      // Reviewed and confirmed here, on this screen, so this is going straight to the
      // cellar: no separate "just added, please check" step needed afterwards.
      if (existing) { beerId = existing.id; lib = lib.map((b) => (b.id === existing.id ? { ...b, abv: x.abv || b.abv, price: x.price || b.price, history: [...(b.history || []), entry] } : b)); }
      else {
        beerId = uid();
        lib = [...lib, { id: beerId, brewery: x.brewery.trim(), location: x.location || "", name: x.name.trim(), style: x.style || "", abv: x.abv, price: x.price || "", clarity: x.clarity || "Clear", glutenStatus: x.glutenStatus || "Standard", vegan: x.vegan || false, allergens: x.allergens || [], notes: x.notes || "", allergensVerified: false, category: x.category || deriveCategory(x.drinkType, x.style || "", x.abv), history: [entry] }];
      }
      const dates = { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: null };
      dates[STATUSES[STATUS_INDEX["in_cellar"]].dateKey] = nowIso;
      newLines.push({ id: uid(), beerId, drinkType: x.drinkType || "cask", size: "", price: (x.price || "").toString(), status: "in_cellar", caskOwner: (x.caskOwner || x.brewery || "").trim(), collected: false, bestBefore: x.bestBefore || "", dates });
    });
    setLibrary(lib);
    setLines((ls) => [...ls, ...newLines]);
    setInvoiceItems(null); setInvoiceOwner(""); setAddMode("pick"); setFillNote(null); setLibrarySearch(""); setView("cellar");
  };
  const snapshotUndo = (label) => { setUndoState({ lines, label }); if (undoTimer.current) clearTimeout(undoTimer.current); undoTimer.current = setTimeout(() => setUndoState(null), 7000); };
  const doUndo = () => { if (!undoState) return; setLines(undoState.lines); setUndoState(null); if (undoTimer.current) clearTimeout(undoTimer.current); };
  const setCaskOwner = (id, v) => setLines((ls) => ls.map((c) => (c.id === id ? { ...c, caskOwner: v } : c)));
  const markCollected = (id) => { snapshotUndo("Empty marked collected"); setLines((ls) => ls.map((c) => (c.id === id ? { ...c, collected: true } : c))); };
  const markOwnerCollected = (key) => { snapshotUndo("Empties marked collected"); setLines((ls) => ls.map((c) => (IS_EMPTY(c) && ownerKey(c.caskOwner) === key ? { ...c, collected: true } : c))); };

  const byBB = (a, b) => {
    const da = a.bestBefore ? daysUntil(a.bestBefore) : Infinity;
    const db = b.bestBefore ? daysUntil(b.bestBefore) : Infinity;
    if (da !== db) return da - db;
    return (beerById[a.beerId]?.name || "").localeCompare(beerById[b.beerId]?.name || "");
  };

  const openLine = openId ? lines.find((c) => c.id === openId) : null;

  const buildOnSlots = () => {
    const onAll = lines.filter((l) => l.status === "on");
    const build = (drink) => {
      const pool = onAll.filter((l) => PUMP_DRINK(l.drinkType) === drink);
      const slots = PUMPS[drink].map((p) => ({ slot: p, label: PUMP_LABELS[p], drink, line: pool.find((l) => l.slot === p) || null }));
      const placed = new Set(slots.map((s) => s.line && s.line.id).filter(Boolean));
      pool.filter((l) => !placed.has(l.id)).sort(byBB).forEach((l) => { const empty = slots.find((s) => !s.line); if (empty) empty.line = l; });
      return slots;
    };
    const cask = build("cask");
    const keg = build("keg");
    const cider = build("cider");
    return { cask, keg, cider, all: [...cask, ...keg, ...cider] };
  };

  // ---------- Cards ----------
  const cardSignal = (line) => {
    const bb = bbStatus(line);
    const f = freshness(line);
    if (line.status === "off") return { text: "Finished", warn: false, alert: false };
    if (bb && bb.level === "past") return { text: "Best before passed", warn: true, alert: true };
    if (bb && bb.level === "soon") return { text: bb.text, warn: false, alert: true };
    if (line.status === "on" && f && f.level === "check") return { text: f.text, warn: false, alert: true };
    if (line.status === "on") return { text: f ? f.text : "Pouring", warn: false, alert: false };
    if (line.status === "tapped") return { text: "Tapped", warn: false, alert: false };
    return { text: STATUSES[STATUS_INDEX[line.status]].label, warn: false, alert: false };
  };

  const LineRow = ({ line, context }) => {
    const beer = beerById[line.beerId];
    if (!beer) return null;
    const sig = cardSignal(line);
    const storeBB = context === "store" && line.bestBefore && !sig.alert;
    const showBadge = context === "racked" || sig.alert || storeBB;
    // Always a short pill on this compact card: never the long sentence form, regardless of
    // which signal fired (best-before passed/soon, store-context BB, or a status label).
    const bb = bbStatus(line);
    let badgeText = sig.text;
    if (storeBB) badgeText = `BB ${fmtDate(line.bestBefore)}`;
    else if (bb && bb.level === "past") badgeText = "BB passed";
    else if (bb && bb.level === "soon") badgeText = daysUntil(line.bestBefore) === 0 ? "BB today" : `BB ${daysUntil(line.bestBefore)}d`;
    return (
      <button onClick={() => setOpenId(line.id)} className="flex h-full w-full flex-col gap-1.5 rounded-xl border px-3 py-2 text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 active:scale-95" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[line.drinkType] || C.line, boxShadow: "0 1px 2px rgba(28,54,54,0.05), 0 6px 14px -10px rgba(28,54,54,0.2)", minHeight: 52 }}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CatDot category={beer.category} />
            <p className="truncate text-sm font-semibold leading-tight" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</p>
            {!beer.allergensVerified && <AlertTriangle size={13} className="shrink-0 text-amber-500" />}
          </div>
          <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[beer.style || "", beer.abv ? `${beer.abv}%` : "", `£${line.price || "--"}`, beer.location || ""].filter(Boolean).join("  ·  ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1" style={{ minHeight: 22 }}>
          <DietaryMini beer={beer} />
          {showBadge && <span className="max-w-full truncate rounded-full border px-1.5 py-0.5 font-semibold" style={{ fontSize: 10, fontFamily: "var(--font-data)", background: sig.warn ? "#F7E9E7" : C.stone, color: sig.warn ? C.alert : C.inkSoft, borderColor: sig.warn ? "#E8CCC8" : C.line }}>{badgeText}</span>}
        </div>
      </button>
    );
  };

  const NavButton = ({ id, icon: Icon, label, badge }) => {
    const active = view === id;
    return (
      <button onClick={() => go(id)} style={active ? { background: C.brass, color: C.ink, fontFamily: "var(--font-data)" } : { color: C.cream, fontFamily: "var(--font-data)" }}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300 ${active ? "" : "hover:opacity-80"}`}>
        <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
        {badge > 0 && <span className="grid place-items-center rounded-full px-1" style={{ height: 15, minWidth: 15, background: active ? C.ink : C.brass, color: active ? C.brassSoft : C.ink, fontSize: 9.5, fontWeight: 700, lineHeight: 1 }}>{badge > 9 ? "9+" : badge}</span>}
      </button>
    );
  };

  const BottomTab = ({ id, icon: Icon, label, onClick, badge }) => {
    const active = view === id;
    return (
      <button onClick={onClick || (() => go(id))} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-95 focus:outline-none" style={{ color: active ? C.brass : C.inkSoft }}>
        <span className="relative inline-flex">
          <Icon size={21} />
          {badge > 0 && <span className="absolute grid place-items-center rounded-full px-1" style={{ top: -4, right: -8, height: 14, minWidth: 14, background: C.brass, color: C.ink, fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{badge > 9 ? "9+" : badge}</span>}
        </span>
        <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-data)" }}>{label}</span>
      </button>
    );
  };

  const Cellar = () => {
    const live = lines.filter((l) => l.status !== "off");
    const empties = lines.filter(IS_EMPTY);
    const onS = buildOnSlots();
    const onCaskSlots = onS.cask;
    const onKegSlots = onS.keg;
    const onCiderSlots = onS.cider;
    const onFilled = onS.all.filter((s) => s.line).length;

    const catOf = (l) => beerById[l.beerId]?.category || "Misc";
    const abvOf = (l) => parseFloat(beerById[l.beerId]?.abv) || 0;
    const rackedCask = live.filter((l) => l.drinkType === "cask" && (l.status === "racked" || l.status === "vented" || l.status === "tapped"));
    // IPA and Pale share four racked slots. Rather than category label, the two highest-ABV
    // beers fill the IPA slots and the two lowest-ABV fill the Pale slots, since that's the
    // meaningful distinction behind the bar. Ties fall back to best-before order.
    const rIpaPale = rackedCask.filter((l) => catOf(l) === "IPA" || catOf(l) === "Pale").sort((a, b) => abvOf(b) - abvOf(a) || byBB(a, b));
    const rBitter = rackedCask.filter((l) => catOf(l) === "Bitter").sort(byBB);
    const rStout = rackedCask.filter((l) => catOf(l) === "Stout/Porter").sort(byBB);
    const rackedSlots = [
      { label: "IPA", line: rIpaPale[0] || null },
      { label: "IPA", line: rIpaPale[1] || null },
      { label: "Pale", line: rIpaPale[2] || null },
      { label: "Pale", line: rIpaPale[3] || null },
      { label: "Bitter", line: rBitter[0] || null },
      { label: "Stout", line: rStout[0] || null },
    ];
    const rackedFilled = rackedSlots.filter((s) => s.line).length;
    const placed = new Set(rackedSlots.map((s) => s.line && s.line.id).filter(Boolean));
    const rackedOverflow = rackedCask.filter((l) => !placed.has(l.id)).sort(byBB);

    const store = lines.filter((l) => l.status === "in_cellar");
    const STYLE_ORDER = ["IPA", "Pale", "Bitter", "Stout/Porter", "Misc"];
    const storeCask = store.filter((l) => l.drinkType === "cask");
    const storeGroups = [
      ...STYLE_ORDER.map((cat) => ({ label: cat === "Stout/Porter" ? "Stout & Porter" : cat, items: storeCask.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).sort(byBB) })),
      { label: "Keg", items: store.filter((l) => PUMP_DRINK(l.drinkType) === "keg").sort(byBB) },
      { label: "Cider", items: store.filter((l) => l.drinkType === "cider").sort(byBB) },
    ].filter((g) => g.items.length);

    const renderSlot = (slot, k, urgent) => (
      <div key={k} className={urgent ? "flex items-center gap-2" : "flex h-full flex-col"}>
        {urgent ? (
          <span className="grid shrink-0 place-items-center rounded-md" style={{ width: 22, height: 22, background: "linear-gradient(180deg, #26494B 0%, #1C3636 100%)", color: C.brassSoft, fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 700, border: "1px solid rgba(184,134,43,0.45)", boxShadow: "inset 0 1px 0 rgba(209,164,74,0.28), 0 1px 2px rgba(28,54,54,0.35)" }}>{String(PUMP_NUMBER[slot.slot]).padStart(2, "0")}</span>
        ) : (
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{slot.label}</p>
        )}
        <div className={urgent ? "min-w-0 flex-1 self-stretch" : "flex-1"}>
          {slot.line ? <LineRow line={slot.line} context={urgent ? "on" : "racked"} /> : (
            urgent
              ? <button onClick={() => openPump(slot)} className="flex h-full w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium transition hover:bg-amber-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ borderColor: "#e2c98a", color: "#b45309", minHeight: 52 }}><Plus size={15} /> Empty · {slot.label}</button>
              : <button onClick={() => openRack(slot.label)} className="flex h-full w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line, minHeight: 52 }}><Plus size={15} /> Rack from store</button>
          )}
        </div>
      </div>
    );

    if (!lines.length) {
      return (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
          <Bell className="mx-auto mb-2" style={{ color: C.brass }} />
          <p className="font-semibold" style={{ color: C.ink }}>The cellar's empty</p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <button onClick={() => go("add")} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 active:scale-95" style={{ background: C.ink }}><Plus size={16} /> Add a cask</button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <section>
          <button onClick={() => toggleSection("on")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Pouring <span className="text-sm" style={{ color: "#96A19B", fontFamily: "var(--font-data)" }}>· {onFilled}/10</span></h2>
            <ChevronDown size={20} className="text-slate-400" style={{ transform: prefs.on ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {prefs.on && (
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: TYPE_ACCENT.cask, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT.cask }} />Cask<span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(28,54,54,0.18), rgba(28,54,54,0))" }} /></p>
                <div className="cc-stagger grid grid-cols-1 gap-1.5 sm:grid-cols-2">{onCaskSlots.map((s, i) => renderSlot(s, `oc${i}`, true))}</div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: C.line }}>
                <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: TYPE_ACCENT.keg, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT.keg }} />Keg<span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(28,54,54,0.18), rgba(28,54,54,0))" }} /></p>
                <div className="cc-stagger grid grid-cols-1 gap-1.5 sm:grid-cols-2">{onKegSlots.map((s, i) => renderSlot(s, `ok${i}`, true))}</div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: C.line }}>
                <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: TYPE_ACCENT.cider, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT.cider }} />Cider<span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(28,54,54,0.18), rgba(28,54,54,0))" }} /></p>
                <div className="cc-stagger grid grid-cols-1 gap-1.5 sm:grid-cols-2">{onCiderSlots.map((s, i) => renderSlot(s, `od${i}`, true))}</div>
              </div>
            </div>
          )}
        </section>
        <section className="border-t pt-4" style={{ borderColor: C.line }}>
          <button onClick={() => toggleSection("racked")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Racked <span className="text-sm" style={{ color: "#96A19B", fontFamily: "var(--font-data)" }}>· {rackedFilled}/6</span></h2>
            <ChevronDown size={20} className="text-slate-400" style={{ transform: prefs.racked ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {prefs.racked && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {rackedSlots.map((s, i) => renderSlot(s, `r${i}`, false))}
              {rackedOverflow.map((l) => (
                <div key={l.id}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{beerById[l.beerId]?.category || "Misc"}</p>
                  <LineRow line={l} context="racked" />
                </div>
              ))}
            </div>
          )}
        </section>
        {store.length > 0 && (
          <section className="border-t pt-4" style={{ borderColor: C.line }}>
            <button onClick={() => toggleSection("store")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
              <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>In Store <span className="text-sm" style={{ color: "#96A19B", fontFamily: "var(--font-data)" }}>· {store.length}</span></h2>
              <ChevronDown size={20} className="text-slate-400" style={{ transform: prefs.store ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </button>
            {prefs.store && (
              <div className="mt-2 space-y-2">
                {storeGroups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{g.items.map((l) => <LineRow key={l.id} line={l} context="store" />)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {empties.length > 0 && (
          <button onClick={() => go("empties")} className="flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ borderColor: "#e2c98a", background: "#fffbeb" }}>
            <span className="flex items-center gap-2 text-sm font-medium" style={{ color: C.ink }}>
              <Package size={16} style={{ color: "#b45309" }} />
              {empties.length} empt{empties.length === 1 ? "y" : "ies"} waiting for collection
            </span>
            <span className="text-xs font-semibold" style={{ color: "#b45309" }}>View →</span>
          </button>
        )}
      </div>
    );
  };

  const AddForm = () => {
    if (addMode === "invoice") {
      const items = invoiceItems || [];
      const cellChk = "min-w-0 flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300";
      const count = items.filter((x) => x.include && x.name.trim()).length;
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <button onClick={() => { setAddMode("pick"); setInvoiceItems(null); }} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back</button>
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{batchSource === "labels" ? "Scanned labels" : "Delivery items"}</p>
            <p className="mt-1 text-sm text-slate-500">Check the details below, then confirm. Each one saves to your library and goes straight into In Store{batchSource === "labels" ? ", best before and supplier included" : ""}.</p>
            <div className="mt-3 space-y-2">
              {items.length === 0 && <p className="py-3 text-center text-sm text-slate-400">Nothing found.</p>}
              {items.map((x, idx) => (
                <div key={x.id} className="rounded-lg border p-2.5" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[x.drinkType] || C.line }}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={x.include} onChange={(e) => updateInvoice(idx, { include: e.target.checked })} className="h-4 w-4" />
                    <input value={x.name} onChange={(e) => updateInvoice(idx, { name: e.target.value })} placeholder="Name" className={cellChk} style={{ borderColor: C.line }} />
                    <button onClick={() => duplicateInvoice(idx)} title="Duplicate this beer" className="shrink-0 rounded-lg border p-1.5 text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Copy size={14} /></button>
                  </div>
                  {(() => { const warn = checkContradictions(x); return warn.length > 0 && <p className="mt-1.5 flex items-start gap-1 text-xs" style={{ color: C.alert }}><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {warn.join(" ")}</p>; })()}
                  <div className={`mt-2 grid grid-cols-2 gap-2 ${batchSource === "invoice" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                    <input value={x.brewery} onChange={(e) => updateInvoice(idx, { brewery: e.target.value })} placeholder="Brewery" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <input value={x.abv} onChange={(e) => updateInvoice(idx, { abv: e.target.value })} inputMode="decimal" placeholder="ABV %" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    {batchSource !== "invoice" && <input value={x.price} onChange={(e) => updateInvoice(idx, { price: e.target.value })} inputMode="decimal" placeholder="£ price" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />}
                    <select value={x.drinkType} onChange={(e) => updateInvoice(idx, { drinkType: e.target.value })} className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }}>{DRINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                  </div>
                  {batchSource === "labels" && (
                    (x.drinkType === "cider" || x.drinkType === "keykeg") ? (
                      <div className="mt-2">
                        <input type="date" value={x.bestBefore || ""} onChange={(e) => updateInvoice(idx, { bestBefore: e.target.value })} className="w-full rounded border bg-white px-2 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line, WebkitAppearance: "none", appearance: "none", fontSize: 14, colorScheme: "light" }} />
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input type="date" value={x.bestBefore || ""} onChange={(e) => updateInvoice(idx, { bestBefore: e.target.value })} className="rounded border bg-white px-2 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line, WebkitAppearance: "none", appearance: "none", fontSize: 14, colorScheme: "light" }} />
                        <input value={x.caskOwner || ""} onChange={(e) => updateInvoice(idx, { caskOwner: e.target.value })} placeholder="Delivered by" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={importInvoice} disabled={!count} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50" style={{ background: C.ink }}><Plus size={16} /> Confirm all {count} · add to store</button>
            <button onClick={() => { setAddMode("pick"); setInvoiceItems(null); }} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" style={{ borderColor: C.line }}>Cancel</button>
          </div>
        </div>
      );
    }
    if (addMode === "pick") {
      const q = addPickSearch.trim().toLowerCase();
      const pickable = library.filter((b) => !b.archived);
      const results = q ? pickable.filter((b) => [b.name, b.brewery, b.style, b.category].some((x) => (x || "").toLowerCase().includes(q))) : [];
      const recent = pickable.slice(-5).reverse();
      const pickRow = (b) => (
        <button key={b.id} onClick={() => pickBeer(b)} className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: CAT_ACCENT[b.category] || C.line }}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{b.brewery ? `${b.brewery} - ` : ""}{b.name}</span>
            <span className="block truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[b.style || "", b.abv ? `${b.abv}%` : "", extraSweetness(b)].filter(Boolean).join("  ·  ")}</span>
            <span className="block truncate text-xs text-slate-400">{b.location || ""}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-400">{latestPrice(b) ? `last £${latestPrice(b)} ` : ""}→</span>
        </button>
      );
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <input ref={labelRef} type="file" accept="image/*" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length === 1) scanLabel(fs[0]); else if (fs.length > 1) scanLabelsBatch(fs); }} className="hidden" />
          <input ref={invoiceRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanInvoice(f); }} className="hidden" />
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Scan it in</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => labelRef.current && labelRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ background: C.ink }}><Camera size={16} /> Scan a cask label / pump clip</button>
              <button onClick={() => invoiceRef.current && invoiceRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><FileText size={16} /> Scan an invoice</button>
              <button onClick={startNewBeer} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><Plus size={16} /> Add manually</button>
            </div>
            {scanning && <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> {scanProgress || "Reading… this can take a few seconds."}</p>}
            {scanError && <p className="mt-2 text-sm text-amber-700">{scanError}</p>}
          </div>
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Add from your library</p>
            <div className="relative mt-3">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={addPickSearch} onChange={(e) => setAddPickSearch(e.target.value)} placeholder="Search ales, breweries, styles…" className="w-full rounded-xl border bg-white py-2.5 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
              {addPickSearch && <button onClick={() => setAddPickSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}
            </div>
            {q ? (
              results.length ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-slate-500">{results.length} match{results.length === 1 ? "" : "es"}</p>
                  {results.map(pickRow)}
                </div>
              ) : <p className="mt-3 py-3 text-center text-sm text-slate-400">No matches. Add it as a new beer below.</p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-500">{library.length} beer{library.length === 1 ? "" : "s"} saved.</p>
                {recent.length > 0 && <>
                  <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Recently added</p>
                  {recent.map(pickRow)}
                </>}
              </div>
            )}
          </div>
        </div>
      );
    }
    const knownBeer = findSavedBeer(form.brewery, form.name);
    const carriedPrice = knownBeer ? latestPrice(knownBeer) : "";
    const priceNeedsConfirm = !!carriedPrice && form.price.trim() === carriedPrice.trim();
    const carriedSupplier = knownBeer ? latestSupplier(knownBeer) : "";
    const supplierNeedsConfirm = !!carriedSupplier && form.caskOwner.trim() === carriedSupplier.trim();
    // Style/ABV changes still auto-suggest a cask's category as before; every other field
    // is a plain pass-through. This is the only Add-Stock-specific behaviour BeerDetailsFields
    // itself doesn't need to know about.
    const handleFieldChange = (patch) => {
      if (form.drinkType === "cask" && ("style" in patch || "abv" in patch)) {
        const nextStyle = "style" in patch ? patch.style : form.style;
        const nextAbv = "abv" in patch ? patch.abv : form.abv;
        setF({ ...patch, category: deriveCategory(form.drinkType, nextStyle, nextAbv) });
      } else {
        setF(patch);
      }
    };
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <button onClick={() => { setAddMode("pick"); setFillNote(null); }} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back to library</button>

        <div className="cc-elev rounded-xl border p-4 space-y-3" style={{ background: C.paper, borderColor: C.line }}>
          <Field label="Type">
            <div className="flex gap-2">
              {DRINK_TYPES.map((t) => (
                <button key={t.key} onClick={() => setF({ drinkType: t.key, size: t.key === "cider" ? "Bag-in-box 20L" : "" })}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                  style={form.drinkType === t.key ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{t.label}</button>
              ))}
            </div>
          </Field>
          <BeerDetailsFields values={form} onChange={handleFieldChange} onAutoFill={autoFill} busy={loading} note={fillNote} toggleAllergen={toggleAllergen} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Price (£ per pint)">
              <input className={inputCls} inputMode="decimal" value={form.price} onChange={(e) => setF({ price: e.target.value })} placeholder="e.g. 4.40" />
              {priceNeedsConfirm && <p className="mt-1 text-xs font-medium" style={{ color: C.brass }}>Previous price. Please confirm</p>}
            </Field>
            {form.drinkType !== "cask" && form.drinkType !== "keg" && <Field label="Container"><select className={inputCls} value={form.size} onChange={(e) => setF({ size: e.target.value })}>{SIZE_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>}
          </div>
          {form.drinkType !== "cider" && form.drinkType !== "keykeg" && (
            <Field label="Delivered by">
              <input className={inputCls} value={form.caskOwner} onChange={(e) => setF({ caskOwner: e.target.value })} placeholder={form.brewery ? `Defaults to ${form.brewery}` : "Defaults to the brewery"} />
              {supplierNeedsConfirm && <p className="mt-1 text-xs font-medium" style={{ color: C.brass }}>Previous delivery. Please confirm</p>}
            </Field>
          )}
          <Field label="Best before">
            <input type="date" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" value={form.bestBefore} onChange={(e) => setF({ bestBefore: e.target.value })} style={{ WebkitAppearance: "none", appearance: "none", fontSize: 14, colorScheme: "light" }} />
          </Field>
          <Field label="Status"><select className={inputCls} value={form.status} onChange={(e) => setF({ status: e.target.value })}>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        </div>

        <div className="flex gap-2">
          <button onClick={addLine} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Plus size={16} /> Add to cellar</button>
          <button onClick={() => { setForm(emptyForm); setFillNote(null); setAddMode("pick"); setView("cellar"); }} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" style={{ borderColor: C.line }}>Cancel</button>
        </div>
      </div>
    );
  };

  const Library = () => {
    const q = librarySearch.trim().toLowerCase();
    const match = (b) => [b.name, b.brewery, b.style, b.category, b.location].some((x) => (x || "").toLowerCase().includes(q));
    const results = q ? library.filter(match) : [];
    const archived = library.filter((b) => b.archived).slice().sort((a, b) => (a.brewery || "").localeCompare(b.brewery || "") || (a.name || "").localeCompare(b.name || ""));
    const rest = library.filter((b) => !b.archived).slice().sort((a, b) => {
      if (a.allergensVerified !== b.allergensVerified) return a.allergensVerified ? 1 : -1;
      return (a.brewery || "").localeCompare(b.brewery || "") || (a.name || "").localeCompare(b.name || "");
    });
    // Library array order is insertion order (new beers are always appended), so the last 10
    // entries are genuinely the 10 most recently added, same approach as the existing "Recently
    // added" list in the Add Stock picker.
    const recentAdded = library.filter((b) => !b.archived).slice(-10).reverse();
    const histChrono = (b) => (b.history || []).slice().sort((x, y) => new Date(x.date) - new Date(y.date));
    const libRow = (b) => {
      const h = histChrono(b);
      const open = !!historyOpen[b.id];
      return (
        <div key={b.id} className="rounded-xl border p-2.5" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: CAT_ACCENT[b.category] || C.line }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <button onClick={() => setLibraryOpenId(b.id)} className="block w-full min-w-0 rounded-lg text-left transition focus:outline-none focus:ring-2 focus:ring-amber-300">
                <p className="truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{b.brewery ? `${b.brewery} - ` : ""}{b.name}</p>
                <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[b.style || "", b.abv ? `${b.abv}%` : "", extraSweetness(b), !b.allergensVerified ? "not staff verified" : ""].filter(Boolean).join("  ·  ")}</p>
                <p className="truncate text-xs text-slate-400">{b.location || ""}{latestPrice(b) ? ` · Previous: £${latestPrice(b)}` : ""}{latestSupplier(b) ? ` · from ${latestSupplier(b)}` : ""}</p>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-1"><DietaryMini beer={b} /></div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); addLineOfBeer(b); }} title="Add to cellar" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Plus size={13} /> Add</button>
              <button onClick={(e) => { e.stopPropagation(); setHistoryOpen((m) => ({ ...m, [b.id]: !m[b.id] })); }} title="Price & ABV history" className="inline-flex items-center gap-0.5 rounded-lg border p-1.5 text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><History size={14} />{h.length ? <span className="text-xs font-medium">{h.length}</span> : null}</button>
            </div>
          </div>
          {open && (
            <div className="mt-2.5 rounded-lg border p-2.5" style={{ borderColor: C.line, background: "#FAFAF8" }}>
              {!h.length ? <p className="text-xs text-slate-400">No history yet.</p> : (
                <>
                  <div className="mb-1 grid text-xs font-semibold uppercase tracking-wide text-slate-400" style={{ gridTemplateColumns: "3.2rem 2.8rem 3.6rem 1fr" }}>
                    <span>When</span><span>ABV</span><span>Price</span><span>Delivered by</span>
                  </div>
                  <ul className="space-y-1">
                    {h.map((e, i) => {
                      const prev = i > 0 ? h[i - 1] : null;
                      const pN = parseFloat(e.price), pP = prev ? parseFloat(prev.price) : NaN;
                      const aN = parseFloat(e.abv), aP = prev ? parseFloat(prev.abv) : NaN;
                      const priceCh = !isNaN(pP) && !isNaN(pN) && pN !== pP;
                      const abvCh = !isNaN(aP) && !isNaN(aN) && aN !== aP;
                      return (
                        <li key={i} className="grid items-center text-xs" style={{ gridTemplateColumns: "3.2rem 2.8rem 3.6rem 1fr" }}>
                          <span className="text-slate-500">{new Date(e.date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
                          <span className={abvCh ? "font-semibold text-amber-700" : "text-slate-600"}>{e.abv || "--"}%</span>
                          <span className={priceCh ? (pN > pP ? "font-semibold text-red-600" : "font-semibold text-emerald-600") : "text-slate-600"}>£{e.price || "--"}{priceCh ? (pN > pP ? " ↑" : " ↓") : ""}</span>
                          <span className="truncate text-slate-600">{e.caskOwner || "--"}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      );
    };
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Search ales, breweries, styles…" className="w-full rounded-xl border bg-white py-2.5 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
          {librarySearch && <button onClick={() => setLibrarySearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}
        </div>
        {q ? (
          results.length ? (
            <>
              <p className="text-xs text-slate-500">{results.length} match{results.length === 1 ? "" : "es"}</p>
              <div className="space-y-2">{results.map(libRow)}</div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed bg-white p-8 text-center" style={{ borderColor: C.line }}>
              <p className="font-medium" style={{ color: C.ink }}>No beers match "{librarySearch}"</p>
              <p className="mt-1 text-sm text-slate-500">Try a brewery or style, or add it as new stock.</p>
            </div>
          )
        ) : (
          <>
            <div className="rounded-xl border border-dashed bg-white p-6 text-center" style={{ borderColor: C.line }}>
              <Search size={22} className="mx-auto mb-2 text-slate-300" />
              <p className="font-semibold" style={{ color: C.ink }}>Search your library</p>
              <p className="mt-1 text-sm text-slate-500">{library.length} beer{library.length === 1 ? "" : "s"} saved. Type a name, brewery or style.</p>
            </div>
            {recentAdded.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recently added</p>
                <div className="space-y-2">{recentAdded.map(libRow)}</div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Library</p>
                <div className="space-y-2">{rest.map(libRow)}</div>
              </div>
            )}
            {archived.length > 0 && (
              <div>
                <button onClick={() => setShowArchived((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Archived <span className="font-normal">· {archived.length}</span></p>
                  <ChevronDown size={16} className="text-slate-400" style={{ transform: showArchived ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>
                {showArchived && <div className="mt-1.5 space-y-2" style={{ opacity: 0.75 }}>{archived.map(libRow)}</div>}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const NotifySettings = () => (
    <div className="space-y-4">
      <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
        <h2 className="text-base font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Pump notifications</h2>
        <div className="mt-1 mb-3 h-0.5 w-8 rounded-full" style={{ background: C.brass }} />
        <p className="text-sm text-slate-500">Get a ping on this phone whenever a beer goes on or a line finishes, even with the app closed. Each phone turns this on separately, so every manager who wants it enables it on their own phone.</p>
        <div className="mt-4">
          {pushState === "checking" && <p className="text-sm text-slate-400">Checking this phone…</p>}
          {pushState === "unsupported" && <p className="text-sm text-slate-500">This browser can't receive push notifications. On iPhone, use the app added to your Home Screen.</p>}
          {pushState === "need-install" && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-semibold" style={{ color: C.ink }}>One step first</p>
              <p className="mt-1">iPhones only allow notifications for installed apps. In Safari, tap Share, then Add to Home Screen, then open the app from its new icon and come back here.</p>
            </div>
          )}
          {pushState === "blocked" && <p className="text-sm text-slate-500">Notifications are blocked for this app in your phone settings. Allow them there, then come back and try again.</p>}
          {pushState === "off" && (
            <button onClick={enablePush} disabled={pushBusy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}>{pushBusy ? <Loader2 className="animate-spin" size={15} /> : <Bell size={15} />} Turn on for this phone</button>
          )}
          {pushState === "on" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg p-3 text-sm font-medium" style={{ background: "#EDF3E7", color: "#3E6B33" }}><CheckCircle2 size={16} /> Notifications are on for this phone.</div>
              <button onClick={disablePush} disabled={pushBusy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>Turn off for this phone</button>
            </div>
          )}
        </div>
      </div>
      <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
        <p className="text-sm font-semibold" style={{ color: C.ink }}>What you'll get</p>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-500">
          <li>Now pouring: when a beer goes on the bar.</li>
          <li>Line finished: when one comes off.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-400">The phone that makes the change doesn't get pinged about it.</p>
      </div>
    </div>
  );

  const Guide = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={shareGuidePDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: "#778883" }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
      </div>
      {GUIDE_SECTIONS.map((sec) => (
        <div key={sec.title} className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-base font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{sec.title}</h2>
          <div className="mt-1 mb-3 h-0.5 w-8 rounded-full" style={{ background: C.brass }} />
          <ul className="space-y-2.5">
            {sec.steps.map(([h, t]) => (
              <li key={h}>
                <p className="text-sm font-semibold" style={{ color: C.ink }}>{h}</p>
                <p className="mt-0.5 text-sm text-slate-500">{t}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  const Stats = () => {
    const histOf = (b) => (b.history || []).slice().sort((x, y) => new Date(x.date) - new Date(y.date));
    const active = library.filter((b) => !b.archived);

    // Most restocked: how many times each beer has been delivered
    const restocked = active.map((b) => ({ b, n: (b.history || []).length })).filter((x) => x.n >= 2).sort((a, z) => z.n - a.n).slice(0, 5);

    // Price rises: beers whose latest price is above their first recorded price
    const risers = active.map((b) => {
      const h = histOf(b).filter((e) => e.price && !isNaN(parseFloat(e.price)));
      if (h.length < 2) return null;
      const first = parseFloat(h[0].price), last = parseFloat(h[h.length - 1].price);
      if (last <= first) return null;
      return { b, first, last, up: last - first };
    }).filter(Boolean).sort((a, z) => z.up - a.up).slice(0, 5);

    // Deliveries by supplier, from history entries
    const bySupplier = {};
    active.forEach((b) => (b.history || []).forEach((e) => { const k = e.caskOwner || null; if (k) bySupplier[k] = (bySupplier[k] || 0) + 1; }));
    const suppliers = Object.entries(bySupplier).sort((a, z) => z[1] - a[1]).slice(0, 6);
    const supMax = suppliers.length ? suppliers[0][1] : 0;

    // Average cask lifespan from finished cask lines with real on/off dates
    const finishedCasks = lines.filter((l) => l.drinkType === "cask" && l.status === "off" && l.dates.on && l.dates.off);
    const avgDays = finishedCasks.length ? Math.round(finishedCasks.reduce((t, l) => t + dayDiff(l.dates.on, l.dates.off), 0) / finishedCasks.length * 10) / 10 : null;

    const nothingYet = !restocked.length && !risers.length && !suppliers.length && avgDays === null;
    const rowName = (b) => `${b.brewery ? b.brewery + " - " : ""}${b.name}`;

    return (
      <div className="space-y-4">
        {nothingYet && (
          <div className="cc-elev rounded-xl border p-6 text-center" style={{ background: C.paper, borderColor: C.line }}>
            <BarChart3 size={22} className="mx-auto mb-2 text-slate-300" />
            <p className="font-semibold" style={{ color: C.ink }}>Not enough history yet</p>
            <p className="mt-1 text-sm text-slate-500">Stats build up as beers are delivered and finished. Check back after a few restocks.</p>
          </div>
        )}
        {avgDays !== null && (
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Average cask lifespan</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: C.ink, fontFamily: "var(--font-data)" }}>{avgDays} days <span className="text-sm font-normal text-slate-400">on the pump · from {finishedCasks.length} finished cask{finishedCasks.length === 1 ? "" : "s"}</span></p>
          </div>
        )}
        {restocked.length > 0 && (
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Most restocked</p>
            <ul className="space-y-1.5">
              {restocked.map(({ b, n }) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate" style={{ color: C.inkSoft }}>{rowName(b)}</span>
                  <span className="shrink-0 font-semibold" style={{ color: C.brass, fontFamily: "var(--font-data)" }}>{n}×</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {suppliers.length > 0 && (
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Deliveries by supplier</p>
            <ul className="space-y-2">
              {suppliers.map(([name, n]) => (
                <li key={name}>
                  <div className="mb-0.5 flex items-center justify-between text-sm">
                    <span style={{ color: C.inkSoft }}>{name}</span>
                    <span className="font-semibold" style={{ color: C.ink, fontFamily: "var(--font-data)" }}>{n}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: C.stone }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((n / supMax) * 100)}%`, background: C.brass }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-400">Counted from delivery history. Older deliveries from before supplier tracking aren't included.</p>
          </div>
        )}
        {risers.length > 0 && (
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Price rises since first stocked</p>
            <ul className="space-y-1.5">
              {risers.map(({ b, first, last, up }) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate" style={{ color: C.inkSoft }}>{rowName(b)}</span>
                  <span className="shrink-0" style={{ fontFamily: "var(--font-data)" }}><span className="text-slate-400">£{first.toFixed(2)} →</span> <span className="font-semibold" style={{ color: C.alert }}>£{last.toFixed(2)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Clears whatever might be holding a stale copy of the app's own code (service worker
  // registrations, the Cache Storage API), then forces a hard, cache-busted reload. Does NOT
  // touch cellar data, that lives in Supabase and your own device storage, entirely separate
  // from this. This exists because iOS home-screen PWAs cache very aggressively, sometimes
  // persisting through an ordinary reload.
  const resetAppCache = async () => {
    setConfirmCacheReset(false);
    setCacheResetMsg({ type: "loading", text: "Clearing cache…" });
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { /* proceed to reload regardless */ }
    const url = new URL(window.location.href);
    url.searchParams.set("_cachebust", Date.now().toString());
    window.location.href = url.toString();
  };
  const Backup = () => {
    const taCls = `${inputCls} h-28 resize-none font-mono text-xs`;
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <p className="text-center text-xs text-slate-400" style={{ fontFamily: "var(--font-data)" }}>Build {APP_BUILD}</p>
        <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Export</h2>
          <p className="mt-0.5 text-xs text-slate-400">{prefs.lastBackup ? `Last backup: ${fmtUpdated(prefs.lastBackup)}` : "No backup taken yet. The cloud keeps no history, so a saved copy is your safety net."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copyBackup} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Copy size={16} /> Copy backup</button>
            <button onClick={downloadBackup} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Download size={16} /> Download .json</button>
          </div>
          <textarea readOnly value={exportData()} className={`mt-3 ${taCls}`} onFocus={(e) => e.target.select()} />
        </div>

        <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Import</h2>
          <p className="mt-1 text-sm text-slate-500">Replaces everything in the app.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => fileRef.current && fileRef.current.click()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Upload size={16} /> Choose a file</button>
          </div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Or paste backup text here" className={`mt-3 ${taCls}`} />
          <button onClick={() => prepareImport(importText)} disabled={!importText.trim()} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50" style={{ borderColor: C.line }}>Check pasted text</button>
          {backupMsg && (
            <div className={`mt-3 rounded-lg border p-2.5 text-sm ${backupMsg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : backupMsg.type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              <p>{backupMsg.text}</p>
              {backupMsg.type === "ask" && pendingImport && (
                <div className="mt-2 flex gap-2">
                  <button onClick={confirmImport} className="rounded-md px-3 py-1 text-xs font-semibold text-white" style={{ background: C.ink }}>Import &amp; replace</button>
                  <button onClick={() => { setPendingImport(null); setBackupMsg(null); }} className="rounded-md border px-3 py-1 text-xs font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Fix a stuck app</h2>
          <p className="mt-1 text-sm text-slate-500">If the app seems out of date after an update, e.g. it doesn't match what you were told changed, this clears whatever's holding the old version and reloads fresh. Your cellar data is untouched, this only clears cached app files.</p>
          {!confirmCacheReset ? (
            <button onClick={() => setConfirmCacheReset(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><RotateCcw size={16} /> Reset app cache</button>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">This reloads the app immediately. Make sure nothing else needs saving first.</p>
              <div className="mt-2 flex gap-2">
                <button onClick={resetAppCache} className="rounded-md bg-amber-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-900">Reset now</button>
                <button onClick={() => setConfirmCacheReset(false)} className="rounded-md border px-3 py-1.5 text-sm font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
              </div>
            </div>
          )}
          {cacheResetMsg && <p className="mt-2 text-sm text-slate-500">{cacheResetMsg.text}</p>}
        </div>
      </div>
    );
  };

  const shareEmptiesPDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const ink = [28, 54, 54], brass = [153, 111, 35], brassSoft = [199, 154, 62], gray = [110, 118, 115], lineCol = [225, 222, 215], paleBg = [250, 249, 246];
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(243, 239, 230);
      doc.text("Empties to Return", M, 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(brassSoft[0], brassSoft[1], brassSoft[2]);
      doc.text("THE CURFEW MICROPUB · COLLECTION LIST", M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 13, { align: "right" });
      y = 36;

      const sectionHead = (t, n) => { ensure(16); y += 4; doc.setFillColor(brass[0], brass[1], brass[2]); doc.rect(M, y - 4, 2.2, 5.2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(t, M + 4.5, y); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text(String(n), W - M, y, { align: "right" }); y += 5.5; };

      const beerLine = (l) => {
        const b = beerById[l.beerId]; if (!b) return;
        const name = `${b.brewery ? b.brewery + " - " : ""}${b.name || ""}`;
        const dt = (DRINK_TYPES.find((t) => t.key === l.drinkType) || {}).label || l.drinkType;
        const meta = [dt, b.style, b.abv ? b.abv + "%" : "", l.size || "", `Finished ${fmtDate(l.dates.off ? l.dates.off.slice(0, 10) : "")}`].filter(Boolean).join("  ·  ");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        const nameLines = doc.splitTextToSize(name, W - 2 * M - 8);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8);
        const metaLines = doc.splitTextToSize(meta, W - 2 * M - 8);
        const topPad = 4.2, lhName = 3.9, lhMeta = 3.5, bottomPad = 2.4;
        const rowH = Math.max(topPad + lhName * nameLines.length + lhMeta * metaLines.length + bottomPad, 10.5);
        ensure(rowH + 1.2);
        doc.setFillColor(paleBg[0], paleBg[1], paleBg[2]); doc.rect(M, y, W - 2 * M, rowH, "F");
        doc.setFillColor(150, 161, 155); doc.rect(M, y, 1.4, rowH, "F");
        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(metaLines, M + 4.5, ty);
        y += rowH + 1.4;
      };

      const empties = lines.filter(IS_EMPTY);
      if (!empties.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text("No empties waiting for collection.", M, y); }
      else {
        groupByOwner(empties).forEach(({ label, items }) => {
          sectionHead(label, items.length);
          items.forEach(beerLine);
          y += 1.5;
        });
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(lineCol[0], lineCol[1], lineCol[2]); doc.line(M, H - 10, W - M, H - 10);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(`Page ${p} of ${pageCount}`, W - M, H - 6, { align: "right" });
      }
      await sharePdfDoc(doc, "curfew-empties.pdf", "Curfew empties to return");
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally { setPdfBusy(false); }
  };

  const Empties = () => {
    const empties = lines.filter(IS_EMPTY);
    const groups = groupByOwner(empties);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-3">
          <button onClick={shareEmptiesPDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1 py-1 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: "#778883" }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
          <button onClick={() => go("cellar")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back</button>
        </div>
        {empties.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
            <Check className="mx-auto mb-2 text-emerald-600" />
            <p className="font-medium" style={{ color: C.ink }}>All clear</p>
            <p className="mt-1 text-sm text-slate-500">No empties waiting for collection.</p>
          </div>
        )}
        {groups.map(({ key, label, items }) => {
          const open = !!prefs.empties[key];
          return (
            <div key={key} className="rounded-xl border" style={{ background: C.paper, borderColor: C.line }}>
              <button onClick={() => setPrefs((p) => ({ ...p, empties: { ...p.empties, [key]: !p.empties[key] } }))} className="flex w-full items-center justify-between gap-2 p-3 text-left focus:outline-none">
                <p className="font-semibold" style={{ color: C.ink }}>{label} <span className="text-sm font-normal text-slate-400">· {items.length}</span></p>
                <ChevronDown size={18} className="text-slate-400" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {open && (
                <>
                  {items.length > 1 && (
                    <div className="flex justify-end px-3 pb-1.5">
                      <button onClick={() => markOwnerCollected(key)} className="inline-flex items-center gap-1 px-1 py-1 text-xs font-medium transition hover:opacity-70 active:scale-95 focus:outline-none" style={{ color: "#778883" }}><Check size={13} /> All collected ({items.length})</button>
                    </div>
                  )}
                  <ul className="space-y-1.5 px-3 pb-3">
                  {items.map((l) => {
                    const beer = beerById[l.beerId];
                    const dt = (DRINK_TYPES.find((t) => t.key === l.drinkType) || {}).label || l.drinkType;
                    return (
                      <li key={l.id} className="flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[l.drinkType] || C.line }}>
                        <button onClick={() => setOpenId(l.id)} className="min-w-0 flex-1 rounded text-left focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ WebkitTapHighlightColor: "transparent" }}>
                          <span className="block truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{beer ? `${beer.brewery ? beer.brewery + " - " : ""}${beer.name}` : "Unknown"}</span>
                          {beer && <span className="block truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[dt, beer.style || "", beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</span>}
                          {beer && beer.location && <span className="block truncate text-xs text-slate-400" style={{ fontFamily: "var(--font-data)" }}>{beer.location}</span>}
                          <span className="block truncate text-xs text-slate-500" style={{ fontFamily: "var(--font-data)" }}>{l.size ? `${l.size} · ` : ""}finished {l.dates.off ? fmtDate(l.dates.off.slice(0, 10)) : "--"}</span>
                        </button>
                        <button onClick={() => markCollected(l.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={13} /> Collected</button>
                      </li>
                    );
                  })}
                </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const AllergenSheet = () => {
    const on = lines.filter((l) => l.status === "on");
    const groups = [
      { title: "Cask ale", items: on.filter((l) => l.drinkType === "cask") },
      { title: "Keg", items: on.filter((l) => l.drinkType === "keg") },
      { title: "Draught cider", items: on.filter((l) => l.drinkType === "cider") },
    ].filter((g) => g.items.length);
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-end gap-2">
          <button onClick={shareAllergenPDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: "#778883" }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Printer size={15} /> Print</button>
        </div>
        <div id="allergen-sheet" className="cc-elev rounded-xl border p-5" style={{ background: C.paper, borderColor: C.line }}>
          <h1 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>What's on: allergen and dietary guide</h1>
          <p className="mt-0.5 text-xs text-slate-500">Please confirm with staff before ordering.</p>
          {fmtUpdated(lastUpdated) && <p className="mt-0.5 text-xs text-slate-400">Last updated: {fmtUpdated(lastUpdated)}</p>}
          {groups.length === 0 && <p className="mt-4 text-sm text-slate-400">Nothing on right now.</p>}
          {groups.map((g) => (
            <div key={g.title} className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.brass }}>{g.title}</h3>
              <div className="mt-1 divide-y" style={{ borderColor: C.line }}>
                {g.items.map((l) => {
                  const beer = beerById[l.beerId];
                  if (!beer) return null;
                  const diet = [beer.vegan ? "Vegan" : null, beer.glutenStatus === "Gluten-free" ? "Gluten-free" : beer.glutenStatus === "Low gluten" ? "Low gluten, <20ppm" : null].filter(Boolean).join(", ");
                  return (
                    <div key={l.id} className="py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium" style={{ color: C.ink }}>{beer.name}</span>
                        <span className="text-xs text-slate-500">{[beer.brewery || "", beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</span>
                      </div>
                      <p className="text-xs text-slate-600">{diet ? diet + " · " : ""}{beer.allergensVerified ? (beer.allergens.length ? "Contains: " + beer.allergens.join(", ") : "No declared allergens") : "Allergens: please ask at the bar"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const StockSheet = () => {
    const fmtBB = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return null; } };
    const Row = ({ l, stage }) => {
      const beer = beerById[l.beerId];
      if (!beer) return null;
      const dt = DRINK_TYPES.find((t) => t.key === l.drinkType)?.label || l.drinkType;
      const bb = fmtBB(l.bestBefore);
      const pump = l.status === "on" && l.slot ? PUMP_LABELS[l.slot] : null;
      return (
        <div className="mb-1.5 flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[l.drinkType] || C.line }}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <CatDot category={beer.category} />
              <p className="truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</p>
            </div>
            <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[dt, beer.style || "", extraSweetness(beer), beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</p>
            {beer.location && <p className="truncate text-xs text-slate-500" style={{ fontFamily: "var(--font-data)" }}>{beer.location}</p>}
            {(l.caskOwner && l.drinkType !== "cider" && l.drinkType !== "keykeg") && <p className="truncate text-xs text-slate-500" style={{ fontFamily: "var(--font-data)" }}>Delivered by: {l.caskOwner}</p>}
          </div>
          <div className="shrink-0 text-right" style={{ fontFamily: "var(--font-data)" }}>
            {pump && <p className="text-xs font-semibold" style={{ color: C.brass }}>{pump}</p>}
            {stage && <p className="text-xs text-slate-500">{stage}</p>}
            {bb && <p className="text-xs text-slate-400">BB {bb}</p>}
          </div>
        </div>
      );
    };
    const onL = lines.filter((l) => l.status === "on").slice().sort((a, b) => ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(a.slot) - ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(b.slot));
    const prepOrder = { tapped: 0, vented: 1, racked: 2 };
    const prep = lines.filter((l) => ["tapped", "vented", "racked"].includes(l.status)).sort((a, b) => prepOrder[a.status] - prepOrder[b.status]);
    const storeL = lines.filter((l) => l.status === "in_cellar");
    const total = onL.length + prep.length + storeL.length;
    const Section = ({ title, items, withStage }) => items.length ? (
      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.brass }}>{title} · {items.length}</h3>
        <div className="mt-1">{items.map((l) => <Row key={l.id} l={l} stage={withStage ? (STATUS_BY_KEY[l.status] && STATUS_BY_KEY[l.status].label) : null} />)}</div>
      </div>
    ) : null;
    const storeGroups = [["cask", "Cask"], ["keg", "Keg"], ["keykeg", "Key Keg"], ["cider", "Cider"]].map(([dt, label]) => {
      const items = storeL.filter((l) => l.drinkType === dt);
      if (!items.length) return null;
      const sub = dt === "cask"
        ? CATEGORIES.map((cat) => ({ cat, items: items.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).sort(byBB) })).filter((g) => g.items.length)
        : [{ cat: null, items: items.slice().sort(byBB) }];
      return { label, sub };
    }).filter(Boolean);
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-end gap-2">
          <button onClick={sharePDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: "#778883" }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Printer size={15} /> Print</button>
        </div>
        <div className="cc-elev rounded-xl border p-5" style={{ background: C.paper, borderColor: C.line }}>
          {fmtUpdated(lastUpdated) && <p className="text-xs text-slate-400">Last updated: {fmtUpdated(lastUpdated)}</p>}
          {total === 0 && <p className="mt-4 text-sm text-slate-400">No stock yet.</p>}
          <Section title="Pouring" items={onL} withStage={false} />
          <Section title="Racked" items={prep} withStage={true} />
          {storeL.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.brass }}>In Store · {storeL.length}</h3>
              {storeGroups.map((g) => (
                <div key={g.label} className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
                  {g.sub.map((sg) => (
                    <div key={sg.cat || g.label}>
                      {sg.cat && <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{sg.cat}</p>}
                      {sg.items.map((l) => <Row key={l.id} l={l} stage={null} />)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };
  const TapList = () => {
    const on = lines.filter((l) => l.status === "on");
    const soon = lines.filter((l) => ["tapped", "vented", "in_cellar"].includes(l.status));
    const cask = on.filter((l) => l.drinkType === "cask");
    const keg = on.filter((l) => PUMP_DRINK(l.drinkType) === "keg").sort(byBB);
    const cider = on.filter((l) => l.drinkType === "cider").sort(byBB);
    const caskByCat = CATEGORIES.map((cat) => ({ cat, items: cask.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).sort(byBB) })).filter((g) => g.items.length);
    const faint = "rgba(243,239,230,0.68)";

    const Item = ({ line }) => {
      const beer = beerById[line.beerId];
      if (!beer) return null;
      const tlp = priceTriple(line.price);
      const diet = [];
      if (beer.vegan) diet.push("Vegan");
      if (beer.glutenStatus === "Gluten-free") diet.push("Gluten-free");
      else if (beer.glutenStatus === "Low gluten") diet.push("Low gluten, <20ppm");
      return (
        <div className="py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <CatDot category={beer.category} />
              <p className="min-w-0 text-lg font-semibold" style={{ color: C.cream, fontFamily: "var(--font-display)" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold" style={{ color: C.brassSoft, fontFamily: "var(--font-display)" }}>{tlp ? tlp.pint : `£${line.price || "--"}`}</p>
              {tlp && <p className="text-xs" style={{ color: "rgba(243,239,230,0.55)" }}>Half {tlp.half} · Schooner {tlp.schooner}</p>}
            </div>
          </div>
          <p className="text-sm font-medium" style={{ color: "rgba(243,239,230,0.85)" }}>{beer.style}{extraSweetness(beer) ? ` · ${extraSweetness(beer)}` : ""} · {beer.abv}%{beer.clarity === "Hazy" ? " · Hazy" : ""}</p>
          {beer.location && <p className="text-xs" style={{ color: "rgba(243,239,230,0.5)" }}>{beer.location}</p>}
          {beer.notes && <ul className="mt-1 space-y-0.5">{splitNote(beer.notes).map((line, i) => <li key={i} className="flex gap-1.5 text-sm italic" style={{ color: faint }}><span>·</span><span>{line}.</span></li>)}</ul>}
          <div className="mt-1.5">
            {diet.length > 0 && <p className="flex flex-wrap gap-x-3 text-xs font-semibold uppercase tracking-wide" style={{ color: C.brassSoft }}>{diet.map((d) => <span key={d}>{d}</span>)}</p>}
            <p className="mt-1 text-xs" style={{ color: "rgba(243,239,230,0.45)" }}>{beer.allergensVerified ? (beer.allergens.length ? `Contains: ${beer.allergens.join(", ")}` : "No declared allergens") : "Allergens: please ask at the bar"}</p>
          </div>
        </div>
      );
    };

    return (
      <div className="flex-1 overflow-y-auto" style={{ background: C.ink, overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }}>
        <div className="mx-auto max-w-2xl px-5 py-8">
          <div style={{ border: "1.5px solid rgba(184,134,43,0.4)", borderBottom: "none", borderTopLeftRadius: 130, borderTopRightRadius: 130, padding: "28px 22px 4px" }}>
            <div className="flex flex-col items-center text-center">
              <div className="grid h-11 w-11 place-items-center rounded-full" style={{ background: C.brass, color: C.ink }}><Bell size={22} /></div>
              <p className="mt-2.5 text-2xl font-semibold leading-tight" style={{ color: C.cream, fontFamily: "var(--font-display)", letterSpacing: "0.03em" }}>The Curfew</p>
              <p className="mt-0.5 text-xs uppercase tracking-widest" style={{ color: C.brassSoft }}>What's on today</p>
              {fmtUpdated(lastUpdated) && <p className="mt-2 text-xs" style={{ color: "rgba(243,239,230,0.5)" }}>Last updated: {fmtUpdated(lastUpdated)}</p>}
              <div className="mt-1 flex items-center gap-4">
                <button onClick={shareTapListPDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-0 py-1 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40" style={{ color: "rgba(209,164,74,0.75)" }}>{pdfBusy ? <Loader2 className="animate-spin" size={12} /> : <Share size={12} />} Share</button>
                <button onClick={() => go("cellar")} className="inline-flex items-center px-0 py-1 text-xs font-medium transition hover:opacity-70" style={{ color: "rgba(209,164,74,0.75)" }}>Exit preview</button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            {on.length === 0 && <p className="py-12 text-center" style={{ color: "rgba(243,239,230,0.6)" }}>Nothing on just now. Check back soon.</p>}

            {caskByCat.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest" style={{ color: C.brass }}>Cask ale</h2>
                {caskByCat.map((g) => (
                  <div key={g.cat} className="mb-3">
                    <p className="text-xs uppercase tracking-wide" style={{ color: "rgba(243,239,230,0.5)" }}>{g.cat}</p>
                    {g.items.map((l) => <Item key={l.id} line={l} />)}
                  </div>
                ))}
              </section>
            )}

            {keg.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest" style={{ color: C.brass }}>Keg</h2>
                {keg.map((l) => <Item key={l.id} line={l} />)}
              </section>
            )}

            {cider.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest" style={{ color: C.brass }}>Draught cider</h2>
                {cider.map((l) => <Item key={l.id} line={l} />)}
              </section>
            )}


            <p className="mt-10 text-center text-xs" style={{ color: "rgba(243,239,230,0.4)" }}>Please confirm allergens with staff before ordering.</p>
          </div>
        </div>
      </div>
    );
  };

  const SwapChooser = () => {
    if (!swap) return null;
    const close = () => { setSwap(null); setSwapPreviewId(null); };
    const isCask = swap.drink === "cask";
    const allowedCats = (!isCask || !swap.category) ? null : (swap.category === "IPA" || swap.category === "Pale") ? ["IPA", "Pale"] : [swap.category];
    const catLabel = allowedCats ? (allowedCats.length > 1 ? "IPA or Pale" : allowedCats[0]) : null;
    const candStatuses = isCask ? (swap.toRack ? ["in_cellar"] : ["tapped", "vented", "racked"]) : ["in_cellar"];
    const statusRank = { tapped: 0, vented: 1, racked: 2, in_cellar: 3 };
    const dateForStatus = (l) => l.status === "tapped" ? l.dates.tapped : l.status === "vented" ? l.dates.vented : l.status === "racked" ? l.dates.racked : l.dates.delivered;
    const pool = lines.filter((l) => l.drinkType === swap.drink && candStatuses.includes(l.status));
    const matching = allowedCats ? pool.filter((l) => allowedCats.includes(beerById[l.beerId]?.category || "Misc")) : pool;
    const base = matching.length ? matching : pool;
    const list = base.slice().sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || ((dateForStatus(a) || "").localeCompare(dateForStatus(b) || "")));
    const groupDefs = swap.toRack ? [["in_cellar", "In Store"]] : (isCask ? [["tapped", "Tapped and Ready"], ["vented", "Vented"], ["racked", "Racked"]] : [["in_cellar", "Ready to go on"]]);
    const groups = groupDefs.map(([k, label]) => ({ k, label, items: list.filter((l) => l.status === k) })).filter((g) => g.items.length);
    const emptyMsg = swap.toRack ? "Nothing in the store to rack. Add a cask from your library first." : (isCask ? "Nothing racked, vented or tapped yet. Rack and vent a cask to get one ready." : `Nothing in the store to put on. Add ${swap.drink === "keg" ? "a keg" : "a cider"} first.`);
    const previewLine = swapPreviewId ? lines.find((l) => l.id === swapPreviewId) : null;
    const previewBeer = previewLine ? beerById[previewLine.beerId] : null;
    const pmeta = previewBeer ? [DRINK_TYPES.find((t) => t.key === previewLine.drinkType)?.label, previewBeer.style, `${previewBeer.abv}%`, `£${previewLine.price || "--"}`, previewLine.size ? previewLine.size.replace("Bag-in-box ", "").replace("Keg ", "") : ""].filter(Boolean).join("  ·  ") : "";
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(28,54,54,0.45)" }} onClick={close}>
        <div className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
          {previewBeer ? (
            <>
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
                <button onClick={() => setSwapPreviewId(null)} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-700 focus:outline-none"><ArrowRight size={15} className="rotate-180" /> Back</button>
                <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4" style={{ overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <CatDot category={previewBeer.category} />
                    <h2 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{previewBeer.name}</h2>
                  </div>
                  <p className="text-sm text-slate-500">{previewBeer.brewery} · {previewBeer.location}</p>
                </div>
                <div className="space-y-2.5">
                  <p className="text-base font-medium text-slate-700">{pmeta}</p>
                  <DietaryBadges beer={previewBeer} />
                </div>
                {previewBeer.notes && <div><Eyebrow>Tasting notes</Eyebrow><ul className="space-y-1">{splitNote(previewBeer.notes).map((line, i) => <li key={i} className="flex gap-1.5 text-sm leading-snug text-slate-600"><span style={{ color: C.brass }}>•</span><span>{line}.</span></li>)}</ul></div>}
                <div>
                  <Eyebrow>Allergens</Eyebrow>
                  {previewBeer.allergens.length ? <div className="flex flex-wrap gap-1.5">{previewBeer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
                  {!previewBeer.allergensVerified ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                      <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not staff verified yet</span>
                      <button onClick={() => verify(previewBeer.id)} className="shrink-0 rounded-md bg-amber-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-900">Verify</button>
                    </div>
                  ) : <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Verified by staff</p>}
                </div>
              </div>
              <div className="sticky bottom-0 border-t bg-white p-4" style={{ borderColor: C.line }}>
                <button onClick={() => doSwap(previewLine.id, swap.oldId, swap.slot)} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Check size={16} /> {swap.toRack ? "Rack this cask" : "Put on"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{swap.toRack ? "Rack from store" : "Choose next"}</h2>
                  {catLabel && <p className="truncate text-xs text-slate-500">{matching.length ? catLabel : `No ${catLabel} ${swap.toRack ? "in store" : "ready"}, showing all casks`}</p>}
                </div>
                <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }}>
                {groups.length ? groups.map((g) => (
                  <div key={g.k} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                    {g.items.map((l) => {
                      const beer = beerById[l.beerId];
                      if (!beer) return null;
                      const when = dateForStatus(l);
                      return (
                        <button key={l.id} onClick={() => setSwapPreviewId(l.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[swap.drink] || C.line }}>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <CatDot category={beer.category} />
                              <span className="font-semibold leading-snug" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</span>
                            </span>
                            <span className="block truncate text-sm font-medium text-slate-600">{[beer.style || "", beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</span>
                            <span className="block truncate text-xs text-slate-400">{beer.location || ""}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">{when ? fmt(when) : ""} <ArrowRight size={14} /></span>
                        </button>
                      );
                    })}
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500" style={{ borderColor: C.line }}>{emptyMsg}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const EditBeer = () => {
    const beer = editBeerId ? beerById[editBeerId] : null;
    if (!beer) return null;
    const close = () => { setEditBeerId(null); setEditBeerLineId(null); setEditNote(null); };
    const editLine = editBeerLineId ? lines.find((l) => l.id === editBeerLineId) : null;
    const bb = editLine ? bbStatus(editLine) : null;
    // Price lives on the LINE (each delivery can come in at a different price), and that is what
    // the Cellar card, tap list and PDFs all display. The library's own `price` field is only a
    // cache, written when someone types here, so it goes stale the moment a new delivery of the
    // same beer arrives at a different price. So: if the beer has a live line, that line is the
    // source of truth and Edit must agree with it. Only fall back to the library value (then the
    // last recorded price) when there is no live line at all, i.e. archived or never stocked.
    // updateBeerPrice writes to both, so typing here keeps the two in step.
    const liveLine = lines.find((l) => l.beerId === beer.id && l.status !== "off");
    const shownPrice = liveLine ? (liveLine.price || "") : (beer.price !== undefined && beer.price !== null ? beer.price : (latestPrice(beer) || ""));
    const detailValues = {
      name: beer.name, brewery: beer.brewery, location: beer.location || "", style: beer.style || "", abv: beer.abv || "",
      category: beer.category || "Misc", sweetness: beer.sweetness || "", clarity: beer.clarity || "Clear", glutenStatus: beer.glutenStatus || "Standard",
      vegan: !!beer.vegan, allergens: beer.allergens, allergensVerified: !!beer.allergensVerified, notes: beer.notes || "",
    };
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(28,54,54,0.45)" }} onClick={close}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "92vh", overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>Edit beer details</h2>
            <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
          </div>
          <div className="space-y-3 p-4">
            <BeerDetailsFields values={detailValues} onChange={(patch) => updateBeer(beer.id, patch)} onAutoFill={() => autoFillBeer(beer)} busy={editBusy} note={editNote} toggleAllergen={(a) => toggleBeerAllergen(beer.id, a)} />
            <Field label="Price (£ per pint)"><input className={inputCls} inputMode="decimal" value={shownPrice} onChange={(e) => updateBeerPrice(beer.id, e.target.value)} placeholder="e.g. 4.40" /></Field>
            {editLine && (
              <>
                <Field label="Best before">
                  <span className="relative block">
                    <input type="date" value={editLine.bestBefore || ""} onChange={(e) => setBestBefore(editLine.id, e.target.value)} className={inputCls} style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light", textAlign: "left", ...(bb && bb.level === "past" ? { borderColor: C.alert, color: C.alert } : {}) }} />
                    {!editLine.bestBefore && <span className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm text-slate-400">Tap to set</span>}
                  </span>
                </Field>
                {editLine.drinkType !== "cider" && editLine.drinkType !== "keykeg" && (
                  <Field label="Delivered by"><input className={inputCls} value={editLine.caskOwner || ""} onChange={(e) => setCaskOwner(editLine.id, e.target.value)} placeholder="Brewery / distributor" /></Field>
                )}
              </>
            )}
            <button onClick={() => { updateBeer(beer.id, { archived: !beer.archived }); close(); }} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>
              <Package size={15} /> {beer.archived ? "Restore from archive" : "Archive this beer"}
            </button>
            {!beer.archived && <p className="text-xs text-slate-400">Archiving hides it from your library and search without deleting its history. You can restore it any time.</p>}
            <button onClick={close} className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}>Done</button>
          </div>
        </div>
      </div>
    );
  };

  const CardModal = () => {
    if (!openLine && !libraryOpenId) return null;
    const beer = openLine ? beerById[openLine.beerId] : beerById[libraryOpenId];
    if (!beer) return null;
    const close = () => { setOpenId(null); setLibraryOpenId(null); };
    const f = openLine ? freshness(openLine) : null;
    const bb = openLine ? bbStatus(openLine) : null;
    const flow = openLine ? flowFor(openLine.drinkType) : [];
    const stageIdx = openLine ? flow.indexOf(openLine.status) : -1;
    const alert = (f && openLine.status === "on" && f.level === "check") ? { cls: FRESH_STYLE.check, Icon: Clock, text: f.text } : null;
    const AlertIcon = alert ? alert.Icon : null;
    const sizeShort = openLine && openLine.size ? openLine.size.replace("Bag-in-box ", "").replace("Keg ", "") : "";
    const meta = openLine
      ? [DRINK_TYPES.find((t) => t.key === openLine.drinkType)?.label, beer.style, extraSweetness(beer) || null, `${beer.abv}%`, sizeShort].filter(Boolean).join("  ·  ")
      : [beer.style, extraSweetness(beer) || null, beer.abv ? `${beer.abv}%` : null].filter(Boolean).join("  ·  ");
    const measures = priceTriple(openLine ? openLine.price : (latestPrice(beer) || beer.price));
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(28,54,54,0.45)" }} onClick={close}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "92vh", overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 pl-5" style={{ background: "linear-gradient(180deg, #234342 0%, #1C3636 100%)", borderLeft: `4px solid ${(openLine && TYPE_ACCENT[openLine.drinkType]) || C.brass}`, boxShadow: "0 1px 0 rgba(184,134,43,0.28)" }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CatDot category={beer.category} />
                <h2 className="text-xl font-bold leading-snug" style={{ color: C.cream, fontFamily: "var(--font-display)", letterSpacing: "0.01em" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</h2>
              </div>
              {beer.location ? <p className="mt-1 text-xs font-semibold uppercase" style={{ color: C.brassSoft, letterSpacing: "0.14em", fontFamily: "var(--font-data)" }}>{beer.location}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => copyBeerName(beer)} title="Copy brewery and beer name" className="rounded-lg p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ color: "rgba(243,239,230,0.75)" }}><Copy size={16} /></button>
              <button onClick={close} className="rounded-lg p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ color: "rgba(243,239,230,0.75)" }}><X size={18} /></button>
            </div>
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-2.5">
              <p className="text-sm font-medium" style={{ color: C.inkSoft, fontFamily: "var(--font-data)" }}>{meta}</p>
              {measures && (
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1" style={{ fontFamily: "var(--font-data)" }}>
                  <span className="flex items-baseline gap-1.5"><span className="text-2xl font-bold" style={{ color: C.ink }}>{measures.pint}</span><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">pint</span></span>
                  <span className="flex items-baseline gap-1 text-sm font-medium text-slate-600">{measures.half}<span className="text-xs text-slate-400">half</span></span>
                  <span className="flex items-baseline gap-1 text-sm font-medium text-slate-600">{measures.schooner}<span className="text-xs text-slate-400">schooner</span></span>
                </div>
              )}
              <DietaryBadges beer={beer} />
            </div>

            {beer.notes && <div><Eyebrow>Tasting notes</Eyebrow><ul className="space-y-1">{splitNote(beer.notes).map((line, i) => <li key={i} className="flex gap-1.5 text-sm leading-snug text-slate-600"><span style={{ color: C.brass }}>•</span><span>{line}.</span></li>)}</ul></div>}

            <div>
              <Eyebrow>Allergens</Eyebrow>
              {beer.allergens.length ? <div className="flex flex-wrap gap-1.5">{beer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
              {!beer.allergensVerified ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                  <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not staff verified yet</span>
                  <button onClick={() => verify(beer.id)} className="shrink-0 rounded-md bg-amber-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-900">Verify</button>
                </div>
              ) : <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Verified by staff</p>}
            </div>

            {openLine && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Best before</span>
                  <span className="text-sm" style={{ color: (bb && bb.level === "past") ? C.alert : C.inkSoft, fontFamily: "var(--font-data)" }}>{openLine.bestBefore ? new Date(openLine.bestBefore + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not set"}</span>
                </div>
                {openLine.drinkType !== "cider" && openLine.drinkType !== "keykeg" && (
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Delivered by</span>
                    <span className="text-sm" style={{ color: C.inkSoft, fontFamily: "var(--font-data)" }}>{openLine.caskOwner || "Not set"}</span>
                  </div>
                )}
              </div>
            )}

            {openLine && (
              <div className="border-t pt-4" style={{ borderColor: C.line }}>
                <div className="flex gap-1.5">
                  {flow.map((key, i) => {
                    const s = STATUS_BY_KEY[key];
                    const done = i <= stageIdx;
                    const cur = i === stageIdx;
                    return (
                      <div key={s.key} className="flex-1 text-center">
                        <div className="h-1 rounded-full" style={{ background: done ? C.brass : "#E6E2D8" }} />
                        <p className="mt-1 text-xs leading-tight" style={{ color: cur ? C.ink : "#A8AEB8", fontWeight: cur ? 600 : 400 }}>{s.key === "tapped" ? "Tapped" : s.label}</p>
                      </div>
                    );
                  })}
                </div>
                {alert && <p className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">{AlertIcon && <AlertIcon size={13} />} {alert.text}</p>}
                <div className="mt-3 flex gap-2">
                  {stageIdx > 0 && <button onClick={() => goBack(openLine.id)} className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><ArrowRight size={15} className="rotate-180" /> Back to {flow[stageIdx - 1] === "tapped" ? "Tapped" : STATUS_BY_KEY[flow[stageIdx - 1]].label}</button>}
                  {openLine.status === "on"
                    ? <button onClick={() => finishAndChoose(openLine)} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Check size={16} /> Line finished</button>
                    : stageIdx < flow.length - 1
                      ? <button onClick={() => advance(openLine.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}>Advance to {flow[stageIdx + 1] === "tapped" ? "Tapped" : STATUS_BY_KEY[flow[stageIdx + 1]].label} <ArrowRight size={15} /></button>
                      : null}
                </div>
                {openLine.status === "off" && openLine.drinkType !== "cider" && openLine.drinkType !== "keykeg" && (openLine.collected
                  ? <p className="mt-2.5 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Empty collected</p>
                  : <button onClick={() => markCollected(openLine.id)} className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={15} /> Mark empty collected</button>)}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: C.line }}>
              <button onClick={() => { setEditBeerId(beer.id); setEditBeerLineId(openLine ? openLine.id : null); close(); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"><Pencil size={15} /> Edit details</button>
              {openLine && <button onClick={() => duplicateLine(openLine.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"><Copy size={15} /> Duplicate</button>}
              {openLine && <button onClick={() => removeLine(openLine.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700"><Trash2 size={15} /> Remove</button>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (cloudMode && (authChecking || !authed || (!cloudReady && !cloudLoadError))) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6" style={{ background: C.ink }}>
        <FontBoot />
        <div className="w-full max-w-xs">
          <div className="mb-6 text-center">
            <Bell size={26} className="mx-auto mb-2.5" style={{ color: C.brassSoft }} aria-hidden="true" />
            <p className="text-2xl font-bold" style={{ color: C.cream, fontFamily: "var(--font-display)", letterSpacing: "0.03em" }}>The Curfew</p>
            <p className="mt-1 text-xs uppercase tracking-widest" style={{ color: C.brassSoft }}>Cellar Management</p>
          </div>
          {authChecking ? (
            <p className="text-center text-sm" style={{ color: C.brassSoft }}>Checking…</p>
          ) : !authed ? (
            <div className="space-y-3">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }} placeholder="Pub password" autoFocus className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: "rgba(255,255,255,0.08)", color: C.cream, border: `1px solid ${C.brass}` }} />
              {authErr && <p className="text-xs" style={{ color: "#f3b4b4" }}>{authErr}</p>}
              <button onClick={doLogin} disabled={authBusy || !pw.trim()} className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50" style={{ background: C.brass, color: C.ink }}>{authBusy ? "Signing in…" : "Unlock"}</button>
            </div>
          ) : (
            <p className="text-center text-sm" style={{ color: C.brassSoft }}>Loading the cellar…</p>
          )}
        </div>
      </div>
    );
  }

  if (cloudMode && cloudLoadError) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6" style={{ background: C.ink }}>
        <FontBoot />
        <div className="w-full max-w-xs text-center">
          <AlertTriangle className="mx-auto mb-3" size={28} color={C.brassSoft} />
          <p className="text-lg font-semibold" style={{ color: C.cream, fontFamily: "var(--font-display)" }}>Could not load the cellar</p>
          <p className="mt-2 text-sm" style={{ color: "rgba(243,239,230,0.7)" }}>Check your connection and try again. Editing stays paused until this loads, so nothing gets overwritten.</p>
          <button onClick={() => loadCellar()} className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold transition active:scale-95" style={{ background: C.brass, color: C.ink }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col" style={{ background: "linear-gradient(180deg, #F6F1E4 0%, #EEE7D5 60%)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", height: "100dvh", overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&display=swap');
:root { --font-data: 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; --font-display: 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
.cc-brandtrack{letter-spacing:0.04em;}
html, body { overflow-x: clip; width: 100%; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { touch-action: manipulation; overscroll-behavior-y: none; }
@media (max-width: 640px) { input, select, textarea { font-size: 16px !important; } }
@media print { .no-print { display: none !important; } body { background: #fff; } }
.cc-fade{animation:ccfade .34s cubic-bezier(.16,1,.3,1) both}
@keyframes ccfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cc-rise{animation:ccrise .42s cubic-bezier(.16,1,.3,1) both}
@keyframes ccrise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.cc-stagger>*{animation:ccrise .44s cubic-bezier(.16,1,.3,1) both}
.cc-stagger>*:nth-child(1){animation-delay:.02s}.cc-stagger>*:nth-child(2){animation-delay:.06s}
.cc-stagger>*:nth-child(3){animation-delay:.10s}.cc-stagger>*:nth-child(4){animation-delay:.14s}
.cc-stagger>*:nth-child(5){animation-delay:.18s}.cc-stagger>*:nth-child(6){animation-delay:.22s}
.cc-stagger>*:nth-child(7){animation-delay:.26s}.cc-stagger>*:nth-child(8){animation-delay:.30s}
.cc-overlay{animation:ccov .22s ease both}
@keyframes ccov{from{opacity:0}to{opacity:1}}
.cc-pop{animation:ccpop .32s cubic-bezier(.16,1,.3,1) both}
@keyframes ccpop{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
.cc-sheet{animation:ccsheet .34s cubic-bezier(.16,1,.3,1) both}
@keyframes ccsheet{from{transform:translateY(100%)}to{transform:none}}
.cc-press{transition:transform .12s ease, box-shadow .2s ease}
.cc-press:active{transform:scale(.975)}
/* Layered elevation: a tight contact shadow plus a soft ambient one, so surfaces read as
   sitting on the page rather than drawn onto it. */
.cc-elev{box-shadow:0 1px 2px rgba(28,54,54,0.05), 0 8px 20px -12px rgba(28,54,54,0.16);}
.cc-elev-lg{box-shadow:0 1px 3px rgba(28,54,54,0.06), 0 16px 34px -18px rgba(28,54,54,0.22);}
.cc-tile{box-shadow:0 1px 2px rgba(28,54,54,0.06), 0 6px 14px -8px rgba(28,54,54,0.18);transition:transform .16s cubic-bezier(.16,1,.3,1), box-shadow .2s ease}
.cc-tile:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(28,54,54,0.07), 0 12px 24px -10px rgba(28,54,54,0.24)}
.cc-tile:active{transform:scale(.975)}
@media (prefers-reduced-motion: reduce){.cc-fade,.cc-rise,.cc-stagger>*,.cc-overlay,.cc-pop,.cc-sheet{animation:none}.cc-press{transition:none}}
/* Retint Tailwind's default cool-blue slate scale to a warm, teal-tinted neutral so
   secondary text and hairlines sit with the brand instead of fighting its warm palette. */
.text-slate-300{color:#B7BCB4!important}.text-slate-400{color:#96A19B!important}
.text-slate-500{color:#778883!important}.text-slate-600{color:#59716C!important}
.text-slate-700{color:#3C4F4B!important}.border-slate-200{border-color:#DEDBCD!important}
.border-slate-300{border-color:#C7C6B7!important}.bg-slate-50{background-color:#F5F2E9!important}
.bg-slate-100{background-color:#EDEADC!important}.hover\:bg-slate-50:hover{background-color:#F5F2E9!important}
.hover\:text-slate-600:hover{color:#59716C!important}.hover\:text-slate-700:hover{color:#3C4F4B!important}
.focus\:ring-slate-300:focus{--tw-ring-color:#C7C6B7!important}
.focus\:ring-slate-400:focus{--tw-ring-color:#96A19B!important}`}</style>
      {view === "taplist" ? TapList() : (<>
      <header className="no-print relative z-40 border-b" style={{ background: "linear-gradient(180deg, #234342 0%, #1C3636 100%)", borderColor: "rgba(184,134,43,0.35)", boxShadow: "0 1px 0 rgba(184,134,43,0.22), 0 10px 26px -18px rgba(0,0,0,0.65)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <button onClick={() => setShowAlerts((v) => !v)} className="relative flex items-center rounded-lg p-0.5 transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label={`Needs attention: ${attentionItems.length}`}>
                <Bell size={19} style={{ color: attentionItems.length ? C.brassSoft : "rgba(209,164,74,0.6)", flexShrink: 0 }} />
                {attentionItems.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid place-items-center rounded-full px-1" style={{ height: 16, minWidth: 16, background: C.alert, color: "#fff", fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{attentionItems.length > 9 ? "9+" : attentionItems.length}</span>
                )}
              </button>
              {showAlerts && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAlerts(false)} />
                  <div className="cc-pop absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border bg-white shadow-xl" style={{ borderColor: C.line }}>
                    <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: C.line }}>
                      <AlertTriangle size={13} style={{ color: C.brass }} />
                      <span className="uppercase" style={{ color: C.brass, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>Needs attention</span>
                    </div>
                    {attentionItems.length === 0 ? (
                      <div className="px-3 py-6 text-center">
                        <CheckCircle2 size={20} className="mx-auto mb-1.5" style={{ color: "#5E8C4F" }} />
                        <p className="text-sm text-slate-500">All good. Nothing needs a look right now.</p>
                      </div>
                    ) : (
                      <ul className="max-h-80 overflow-y-auto py-1" style={{ overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }}>
                        {attentionItems.map((a, i) => (
                          <li key={`${a.id}-${i}`}>
                            <button onClick={() => { setShowAlerts(false); a.backup ? go("backup") : (go("cellar"), setOpenId(a.id)); }} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 focus:outline-none" style={{ color: a.warn ? C.alert : C.inkSoft }}>
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.warn ? C.alert : C.brass }} />
                              <span className="min-w-0 flex-1">{a.text}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
            <p className="text-base font-semibold leading-none" style={{ color: C.cream, fontFamily: "var(--font-display)", letterSpacing: "0.025em" }}>The Curfew</p>
            <p className="hidden sm:inline" style={{ color: C.brassSoft, fontFamily: "var(--font-data)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", lineHeight: 1 }}>Cellar</p>
          </div>
          <nav className="relative hidden items-center gap-1 sm:flex">
            <NavButton id="cellar" icon={ClipboardList} label="Cellar" />
            <NavButton id="add" icon={Plus} label="Add" />
            <NavButton id="empties" icon={Package} label="Empties" />
            <button onClick={() => setMenuOpen((v) => !v)} style={{ color: C.cream }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-amber-300"><MoreHorizontal size={16} /><span className="hidden sm:inline">More</span></button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border bg-white shadow-lg" style={{ borderColor: C.line }}>
                  {[["guide", "How to Use", Compass], ["library", "Library", BookOpen], ["stock", "Stock List", Beer], ["allergens", "Allergen Sheet", FileText], ["taplist", "Customer Tap List", QrCode], ["notify", "Notifications", Bell], ["backup", "Backup & Restore", Database]].map(([id, label, Icon]) => (
                    <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Icon size={15} className="text-slate-400" />{label}</button>
                  ))}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>
      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehaviorY: "none", paddingBottom: "env(safe-area-inset-bottom)", ...((openId || libraryOpenId || editBeerId || swap || showAlerts || menuOpen) ? { overflow: "hidden", overflowY: "hidden", WebkitOverflowScrolling: "auto", touchAction: "none" } : { WebkitOverflowScrolling: "touch" }) }}>
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-28 sm:pb-6">
        {!hydrated ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading your cellar…</div>
        ) : (
          <>
            {VIEW_TITLES[view] && (
              <div className="no-print mb-5">
                <h1 className="text-2xl font-bold" style={{ color: C.ink, fontFamily: "var(--font-display)", letterSpacing: "0.02em" }}>{VIEW_TITLES[view]}</h1>
                <div className="mt-2 h-1 w-10 rounded-full" style={{ background: C.brass }} />
              </div>
            )}
            <div key={view} className="cc-fade">
            {view === "cellar" && Cellar()}
            {view === "add" && AddForm()}
            {view === "library" && Library()}
            {view === "allergens" && AllergenSheet()}
            {view === "stock" && StockSheet()}
            {view === "empties" && Empties()}
            {view === "stats" && Stats()}
            {view === "guide" && Guide()}
            {view === "notify" && NotifySettings()}
            {view === "backup" && Backup()}
            </div>
          </>
        )}
      </main>
      <footer className="no-print mx-auto max-w-4xl px-4 pb-28 pt-2 text-center sm:pb-8">
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">{storageOk === false ? <><AlertTriangle size={13} /> Not saving here</> : <><Check size={13} /> {cloudMode ? "Synced" : "Saved"}</>}</span>
          {cloudMode && <button onClick={lock} className="inline-flex items-center gap-1 font-medium text-slate-400 transition hover:text-slate-600"><Lock size={12} /> Lock</button>}
        </div>
      </footer>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-white sm:hidden" style={{ borderColor: C.line, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -6px 22px -14px rgba(28,54,54,0.4)" }}>
        <div className="mx-auto flex max-w-md items-end justify-around px-2">
          <BottomTab id="cellar" icon={ClipboardList} label="Cellar" />
          <BottomTab id="library" icon={BookOpen} label="Library" />
          <button onClick={() => go("add")} className="flex flex-1 flex-col items-center justify-center transition active:scale-95 focus:outline-none">
            <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full" style={{ background: C.brass, color: C.ink, boxShadow: "0 6px 16px -6px rgba(184,134,43,0.65)" }}><Plus size={24} /></span>
            <span className="mt-0.5 text-xs font-medium" style={{ color: view === "add" ? C.brass : C.inkSoft }}>Add</span>
          </button>
          <BottomTab id="empties" icon={Package} label="Empties" />
          <BottomTab id="more" icon={MoreHorizontal} label="More" onClick={() => setMenuOpen(true)} />
        </div>
      </nav>

      {menuOpen && (
        <div className="no-print fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 cc-overlay" style={{ background: "rgba(28,54,54,0.45)" }} onClick={() => setMenuOpen(false)} />
          <div className="cc-sheet absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: C.line }} />
            <div className="grid grid-cols-3 gap-2.5">
              {[["guide", "How to Use", Compass], ["stock", "Stock List", Beer], ["allergens", "Allergen Sheet", FileText], ["taplist", "Customer Tap List", QrCode], ["notify", "Notifications", Bell], ["backup", "Backup & Restore", Database]].map(([id, label, Icon]) => (
                <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className="flex flex-col items-center gap-1.5 rounded-xl border p-3 transition active:scale-95" style={{ borderColor: C.line, color: C.ink }}>
                  <Icon size={20} style={{ color: C.brass }} />
                  <span className="text-center text-xs font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </>)}
      {toast && (
        <div className="no-print fixed inset-x-0 bottom-24 flex justify-center px-4 sm:bottom-4" style={{ zIndex: 60 }}>
          <div className="cc-pop flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white shadow-lg" style={{ background: C.ink }}>
            <AlertTriangle size={14} style={{ color: C.brassSoft }} />
            <span>{toast}</span>
          </div>
        </div>
      )}
      {undoState && (
        <div className="no-print fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-4">
          <div className="flex items-center gap-3 rounded-full px-4 py-2 text-sm text-white shadow-lg" style={{ background: C.ink }}>
            <span>{undoState.label}</span>
            <button onClick={doUndo} className="font-semibold" style={{ color: C.brassSoft }}>Undo</button>
          </div>
        </div>
      )}
      {CardModal()}
      {EditBeer()}
      {SwapChooser()}
    </div>
  );
}

// If any component throws, this catches it and shows a calm recovery screen instead of a blank
// white void, which is what React gives you by default and is the worst possible thing to hit
// mid-service behind a bar. Must be a class component: React only supports error boundaries via
// componentDidCatch/getDerivedStateFromError, there is no hook equivalent.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, showDetails: false }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.lastInfo = info; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center" style={{ background: "linear-gradient(180deg, #F6F1E4 0%, #EEE7D5 60%)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div className="w-full max-w-sm rounded-2xl border bg-white p-6" style={{ borderColor: "#E6E2D8" }}>
          <p className="text-lg font-bold" style={{ color: "#1C3636" }}>Something went wrong</p>
          <p className="mt-2 text-sm text-slate-600">The app hit a problem and needs a reload. Your cellar data lives in the cloud, not in this screen, so nothing here is lost, reloading is safe.</p>
          <button onClick={() => window.location.reload()} className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "#1C3636" }}>Reload the app</button>
          <button onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))} className="mt-3 text-xs text-slate-400 underline">{this.state.showDetails ? "Hide" : "Show"} technical details</button>
          {this.state.showDetails && <p className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-2 text-left text-xs text-slate-500" style={{ fontFamily: "monospace" }}>{String(this.state.error && this.state.error.message)}</p>}
        </div>
      </div>
    );
  }
}
export default function TheCurfewCellar() {
  return (<ErrorBoundary><TheCurfewCellarApp /></ErrorBoundary>);
}
