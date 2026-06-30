import React, { useState, useMemo, useEffect, useRef } from "react";
// import { useCallback } from "react"; // might need later
import {
  Plus, ClipboardList, BookOpen, Beer, Sparkles, Check, CheckCircle2,
  AlertTriangle, Clock, X, ArrowRight, Trash2, Search, Loader2, Bell, Calendar, History, ChevronDown, Database, Download, Upload, Copy, QrCode, Camera, FileText, Package, MoreHorizontal, BarChart3, Pencil, Printer, RotateCcw, Compass, Lock,
} from "lucide-react";

// ---------- Brand ----------
const C = {
  ink: "#1B2230", inkSoft: "#2B3445", brass: "#A9791F", brassSoft: "#C79A3E",
  stone: "#E8E7E2", surface: "#FCFBF9", line: "#DBD8D0", cream: "#F3EFE6",
};
const TYPE_ACCENT = { cask: "#A9791F", keg: "#3F6E8C", keykeg: "#3F6E8C", cider: "#5E8C4F" };
const CAT_ACCENT = { IPA: "#A9791F", Pale: "#C79A3E", Bitter: "#9C6B2E", "Stout/Porter": "#4E3B30", Stout: "#4E3B30", Porter: "#4E3B30", Misc: "#9AA1AC" };
const STORE_KEY = "curfew-cellar:data:v1";
const MODEL = "claude-sonnet-4-6";
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
    _rev = rev;
    try { const c = await _client(); await c.from("cellar").upsert({ id: CLOUD_ID, data: JSON.parse(value), updated_at: new Date().toISOString() }, { onConflict: "id" }); } catch (e) { /* offline: cache holds, resyncs on next change */ }
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
  { key: "on", label: "On", dateKey: "on" },
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
const LAUNCH_PRICES = { b1: "4.50", b2: "4.50", b3: "4.90", b5: "4.70", b7: "4.90", b9: "4.70", b11: "4.90", b12: "4.50", b14: "4.30", b16: "4.70", b17: "4.90", b20: "4.30", b23: "4.70", b25: "4.70", b33: "5.70", b40: "6.20" };
const EMPTIES_NEW_BEERS = [
  { id: "b57", brewery: "Campervan", location: "Leith, Edinburgh", name: "Mango Mimosa", style: "Fruit Sour", abv: "4.7", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Berliner Weisse with mango and lime, fruity and tart.", allergensVerified: false, category: "Misc" },
  { id: "b49", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "GFB", style: "Session Bitter", abv: "3.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Golden session bitter, hoppy aroma with East Kent Goldings and a dry finish.", allergensVerified: false, category: "Bitter" },
  { id: "b50", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Entire Stout", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Rich dark stout, strong roasted malt flavour with coffee and dark chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b51", brewery: "Phoenix", location: "Heywood, Greater Manchester", name: "Arizona", style: "Pale Ale", abv: "4.1", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Best-selling session pale brewed with Goldings hops, floral and honey notes.", allergensVerified: false, category: "Pale" },
  { id: "b52", brewery: "Potting Shed Brew", location: "", name: "Unknown", style: "", abv: "", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Name not confirmed, check with Kyle before serving.", allergensVerified: false, category: "Misc" },
  { id: "b53", brewery: "Two by Two", location: "North Shields", name: "Citra Motueka", style: "New World Pale", abv: "4.6", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Tropical hop character from Citra, Motueka and Sabro, oats and wheat for mouthfeel. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b54", brewery: "Two by Two", location: "North Shields", name: "Azacca Mosaic", style: "Pale Ale", abv: "4.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Tropical, citrus and dank pale ale. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b55", brewery: "Two by Two", location: "North Shields", name: "Razorbill", style: "Pale Ale", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward pale ale. Not confirmed online, check ABV and style with Kyle.", allergensVerified: false, category: "Misc" },
  { id: "b56", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Hawaiian Shirt", style: "Fruit Sour", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Tropical fruited sour with guava, mango and passionfruit.", allergensVerified: false, category: "Misc" },
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
// Pint is the stored price; Half = pint/2; Schooner = pint x 2/3, each rounded to the penny.
const money = (n) => `£${(Math.round(n * 100) / 100).toFixed(2)}`;
const priceTriple = (pint) => {
  const p = parseFloat(pint);
  if (!isFinite(p) || p <= 0) return null;
  return { pint: money(p), half: money(p / 2), schooner: money(p * 2 / 3) };
};
const fmtUpdated = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return null; } };
const STATUS_STYLE = {
  in_cellar: "bg-indigo-50 text-indigo-700 border-indigo-200",
  vented: "bg-violet-50 text-violet-700 border-violet-200",
  tapped: "bg-blue-50 text-blue-700 border-blue-200",
  on: "bg-emerald-50 text-emerald-700 border-emerald-200",
  off: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

// TODO: add bottles + cans as a 4th type
const DRINK_TYPES = [
  { key: "cask", label: "Cask ale" },
  { key: "keg", label: "Keg" },
  { key: "keykeg", label: "Key Keg" },
  { key: "cider", label: "Draught cider" },
];
// Key kegs run through the keg taps, so they share the keg pump group.
const PUMP_DRINK = (dt) => (dt === "keykeg" ? "keg" : dt);
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
const CLARITY_OPTIONS = ["Clear", "Hazy", "Cloudy"];
const VIEW_TITLES = { cellar: "Cellar", add: "Add Stock", library: "Library", allergens: "Allergen Sheet", stock: "Stock List", empties: "Empties to Return", backup: "Backup & Restore" };
const SIZE_OPTIONS = ["Keg 30L", "Keg 50L", "Bag-in-box 20L"];
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
const categorise = (style, abv) => {
  const s = (style || "").toLowerCase();
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

const aiDraft = (name) => {
  const l = (name || "").toLowerCase();
  let d = { style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Golden and sessionable, light citrus and a clean dry finish." };
  if (/stout|porter/.test(l)) d = { ...d, style: /porter/.test(l) ? "Porter" : "Stout", abv: "4.8", allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Dark and roasty, coffee and dark chocolate, smooth and dry." };
  else if (/ipa/.test(l)) d = { ...d, style: "IPA", abv: "5.6", clarity: /hazy|juic|neipa/.test(l) ? "Hazy" : "Clear", allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Hop-forward, tropical fruit and citrus over a firm bitterness." };
  else if (/bitter/.test(l)) d = { ...d, style: "Best Bitter", abv: "3.9", notes: "Amber, biscuity malt with earthy English hops." };
  else if (/cider|scrumpy|apple/.test(l)) d = { style: "Medium", abv: "5.2", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Traditional medium cider, crisp apple with a gentle tannic finish." };
  else if (/pear|perry/.test(l)) d = { style: "Perry", abv: "4.5", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Soft, lightly sweet perry with ripe pear notes." };
  return { ...d, allergensVerified: false };
};

// ---------- Demo data ----------
const seedLibrary = [
  { id: "b1", brewery: "Ampersand", location: "Pewsey, Wiltshire", name: "Extra Pale Ale", style: "Extra Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Light, crisp extra pale ale with gentle citrus hops.", allergensVerified: false, category: "Pale" },
  { id: "b2", brewery: "Bank Top", location: "Bolton", name: "Harlequin", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Pale ale showcasing the Harlequin hop, soft tropical fruit.", allergensVerified: false, category: "Pale" },
  { id: "b3", brewery: "Timothy Taylor", location: "Keighley, West Yorkshire", name: "Landlord", style: "Pale Ale", abv: "4.3", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Classic award-winning pale ale, citrus and biscuit malt.", allergensVerified: false, category: "Bitter" },
  { id: "b4", brewery: "Durham", location: "Bowburn, County Durham", name: "Dark Angel", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Dark, roasty stout.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b5", brewery: "Blackjack", location: "Manchester", name: "Spring and Axle", style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Hoppy, easy-drinking pale ale.", allergensVerified: false, category: "IPA" },
  { id: "b6", brewery: "Fyne", location: "Cairndow, Argyll", name: "Hurricane Jack", style: "Blonde Ale", abv: "4.4", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Well-balanced blonde, Cascade and Amarillo, citrus over biscuit malt.", allergensVerified: false, category: "IPA" },
  { id: "b7", brewery: "Ossett", location: "Ossett, West Yorkshire", name: "White Rat", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Intensely hoppy pale, resinous grapefruit and citrus.", allergensVerified: false, category: "Pale" },
  { id: "b8", brewery: "Cheviot", location: "Slingley, Northumberland", name: "Upland Ale", style: "Bitter", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Traditional Northumbrian bitter, malty and balanced.", allergensVerified: false, category: "Bitter" },
  { id: "b9", brewery: "Marble", location: "Salford, Greater Manchester", name: "Whitehead's", style: "Stout", abv: "4.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Dark, roasty stout.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b10", brewery: "Ossett", location: "Ossett, West Yorkshire", name: "Butterley", style: "Pale Ale", abv: "3.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Light, refreshing session pale.", allergensVerified: false, category: "Pale" },
  { id: "b11", brewery: "Oakham", location: "Peterborough", name: "Citra", style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hugely aromatic single-hop Citra pale, lime and lychee.", allergensVerified: false, category: "Pale" },
  { id: "b12", brewery: "Castle Rock", location: "Nottingham", name: "Preservation", style: "Bitter", abv: "4.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Amber best bitter, malt backbone with citrus hops.", allergensVerified: false, category: "Bitter" },
  { id: "b13", brewery: "Black Isle", location: "Munlochy, Highland", name: "Porter", style: "Porter", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Organic porter, roast coffee and dark chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b14", brewery: "Timothy Taylor", location: "Keighley, West Yorkshire", name: "Golden Best", style: "Light Mild", abv: "3.5", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Pale Pennine light mild, delicate and refreshing.", allergensVerified: false, category: "Bitter" },
  { id: "b15", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Long White Cloud", style: "Pale Ale", abv: "5.6", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "NZ-hopped pale, tropical fruit and a juicy body.", allergensVerified: false, category: "Pale" },
  { id: "b16", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Crop Circle", style: "Blonde Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Pale, hoppy summer ale, floral and citrus.", allergensVerified: false, category: "Pale" },
  { id: "b17", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Summer Lightning", style: "Golden Ale", abv: "5.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Straw-coloured golden ale, clean bitterness and a long dry finish.", allergensVerified: false, category: "Pale" },
  { id: "b18", brewery: "Burton Bridge", location: "Burton upon Trent", name: "Sunshine Pale", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Easy-drinking golden pale ale.", allergensVerified: false, category: "Pale" },
  { id: "b19", brewery: "Arbor", location: "Bristol", name: "Oyster Stout", style: "Stout", abv: "4.6", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Smooth dry stout, roast and dark chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b20", brewery: "Burning Sky", location: "Firle, East Sussex", name: "Plateau", style: "Pale Ale", abv: "3.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Light, hoppy table pale, citrus and stone fruit.", allergensVerified: false, category: "Pale" },
  { id: "b21", brewery: "Fyne", location: "Cairndow, Argyll", name: "Avalanche", style: "Pale Ale", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Refreshing pale, Cascade hops, lemon and grapefruit.", allergensVerified: false, category: "Pale" },
  { id: "b22", brewery: "The Kernel", location: "London", name: "Summer Pale Krush", style: "Pale Ale", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward pale ale, soft and juicy.", allergensVerified: false, category: "Pale" },
  { id: "b23", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Citra", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Single-hop Citra pale, zesty grapefruit.", allergensVerified: false, category: "Pale" },
  { id: "b24", brewery: "Fyne", location: "Cairndow, Argyll", name: "Jarl", style: "Blonde Ale", abv: "3.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Citra session blonde, waves of citrus and a clean finish.", allergensVerified: false, category: "Pale" },
  { id: "b25", brewery: "Neptune", location: "Maghull, Liverpool", name: "Abyss", style: "Stout", abv: "6.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Rich, dark stout.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b26", brewery: "Loch Lomond", location: "Alexandria, West Dunbartonshire", name: "Silkie Stout", style: "Oatmeal Stout", abv: "5.0", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Robust oatmeal stout, roast coffee and chocolate, smooth finish.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b27", brewery: "Loch Lomond", location: "Alexandria, West Dunbartonshire", name: "Lost in Mosaic", style: "New World IPA", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hazy New World IPA, pineapple, citrus and melon.", allergensVerified: false, category: "IPA" },
  { id: "b28", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Cresta", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Roasty session stout.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b29", brewery: "Cheviot", location: "Slingley, Northumberland", name: "Black Hag", style: "Porter", abv: "4.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Dark, roasty porter.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b30", brewery: "Fyne", location: "Cairndow, Argyll", name: "Like Clockwork", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward pale ale.", allergensVerified: false, category: "Pale" },
  { id: "b31", brewery: "Two by Two", location: "North Shields", name: "Strata Pale", style: "Pale Ale", abv: "4.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hazy pale hopped with Strata, tropical and dank.", allergensVerified: false, category: "Misc" },
  { id: "b32", brewery: "Rodenbach", location: "Roeselare, Belgium", name: "Fruitage", style: "Flemish Red Sour", abv: "3.9", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Refreshing Flanders red blended with cherry, sweet and sour.", allergensVerified: false, category: "Misc" },
  { id: "b33", brewery: "Wylam", location: "Newcastle upon Tyne", name: "State of Mind", style: "Pale Ale", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Juicy, hazy pale ale.", allergensVerified: false, category: "Misc" },
  { id: "b34", brewery: "Burning Sky", location: "Firle, East Sussex", name: "Three Arms", style: "Dark Mild", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Dark, malty session ale.", allergensVerified: false, category: "Misc" },
  { id: "b35", brewery: "The Kernel", location: "London", name: "Pale Ale Citra", style: "Pale Ale", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward Citra pale, grapefruit and tropical fruit.", allergensVerified: false, category: "Misc" },
  { id: "b36", brewery: "Deya", location: "Cheltenham", name: "Steady Rolling Man", style: "Pale Ale", abv: "5.2", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Iconic hazy pale, soft and juicy with tropical hops.", allergensVerified: false, category: "Misc" },
  { id: "b37", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Daisy Age", style: "Hazy IPA", abv: "5.3", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Juicy, hazy IPA.", allergensVerified: false, category: "Misc" },
  { id: "b38", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Graceland Pilsner", style: "Pilsner", abv: "4.8", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Crisp German-style pilsner, clean and floral.", allergensVerified: false, category: "Misc" },
  { id: "b39", brewery: "Polly's", location: "Mold, Flintshire", name: "The Ritual Continues", style: "IPA", abv: "5.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Hazy, juicy IPA.", allergensVerified: false, category: "Misc" },
  { id: "b40", brewery: "Burning Sky", location: "Firle, East Sussex", name: "Le Coeur Framboise", style: "Raspberry Sour", abv: "5.0", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Barrel-aged raspberry sour.", allergensVerified: false, category: "Misc" },
  { id: "b41", brewery: "Schneider Weisse", location: "Kelheim, Germany", name: "Hefeweissbier", style: "Weissbier", abv: "5.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Classic Bavarian wheat beer, banana and clove.", allergensVerified: false, category: "Misc" },
  { id: "b42", brewery: "Weston's", location: "Much Marcle, Herefordshire", name: "Old Rosie", style: "Cloudy Scrumpy", abv: "7.3", clarity: "Cloudy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Cloudy traditional scrumpy, full-bodied and dry.", allergensVerified: false, category: "Misc" },
  { id: "b43", brewery: "Broadoak", location: "Clutton, Somerset", name: "Rhubarb", style: "Fruit Cider", abv: "4.0", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Sweet, fruity rhubarb cider.", allergensVerified: false, category: "Misc" },
  { id: "b44", brewery: "Dudda's Tun", location: "Doddington, Kent", name: "Wild Haze", style: "Cider", abv: "5.4", clarity: "Hazy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Medium, semi-cloudy Kentish cider, smooth and juicy.", allergensVerified: false, category: "Misc" },
  { id: "b45", brewery: "Thistly Cross", location: "Belhaven, East Lothian", name: "Cloudy", style: "Cloudy Cider", abv: "4.4", clarity: "Cloudy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Cloudy Scottish cider, fresh pressed apple.", allergensVerified: false, category: "Misc" },
  { id: "b46", brewery: "Sandford Orchards", location: "Crediton, Devon", name: "Blackberry", style: "Fruit Cider", abv: "4.0", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Devon cider with blackberry.", allergensVerified: false, category: "Misc" },
  { id: "b47", brewery: "Celtic Marches", location: "Bishops Frome, Herefordshire", name: "Wild Berries", style: "Fruit Cider", abv: "4.0", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Mixed berry fruit cider.", allergensVerified: false, category: "Misc" },
  { id: "b48", brewery: "Dudda's Tun", location: "Doddington, Kent", name: "Disco", style: "Cider", abv: "5.0", clarity: "Hazy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Kentish craft cider.", allergensVerified: false, category: "Misc" },
  { id: "b49", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "GFB", style: "Session Bitter", abv: "3.4", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Golden session bitter, hoppy aroma with East Kent Goldings and a dry finish.", allergensVerified: false, category: "Bitter" },
  { id: "b50", brewery: "Hop Back", location: "Salisbury, Wiltshire", name: "Entire Stout", style: "Stout", abv: "4.5", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Rich dark stout, strong roasted malt flavour with coffee and dark chocolate.", allergensVerified: false, category: "Stout/Porter" },
  { id: "b51", brewery: "Phoenix", location: "Heywood, Greater Manchester", name: "Arizona", style: "Pale Ale", abv: "4.1", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Best-selling session pale brewed with Goldings hops, floral and honey notes.", allergensVerified: false, category: "Pale" },
  { id: "b52", brewery: "Potting Shed Brew", location: "", name: "Unknown", style: "", abv: "", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)"], notes: "Name not confirmed, check with Kyle before serving.", allergensVerified: false, category: "Misc" },
  { id: "b53", brewery: "Two by Two", location: "North Shields", name: "Citra Motueka", style: "New World Pale", abv: "4.6", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Tropical hop character from Citra, Motueka and Sabro, oats and wheat for mouthfeel. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b54", brewery: "Two by Two", location: "North Shields", name: "Azacca Mosaic", style: "Pale Ale", abv: "4.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Tropical, citrus and dank pale ale. ABV estimated.", allergensVerified: false, category: "Misc" },
  { id: "b55", brewery: "Two by Two", location: "North Shields", name: "Razorbill", style: "Pale Ale", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Hop-forward pale ale. Not confirmed online, check ABV and style with Kyle.", allergensVerified: false, category: "Misc" },
  { id: "b56", brewery: "Tempest", location: "Tweedbank, Scottish Borders", name: "Hawaiian Shirt", style: "Fruit Sour", abv: "4.5", clarity: "Hazy", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Wheat (gluten)", "Oats (gluten)"], notes: "Tropical fruited sour with guava, mango and passionfruit.", allergensVerified: false, category: "Misc" },
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
  status: "in_cellar", bestBefore: "", caskOwner: "",
};

// ---------- UI atoms ----------
const Badge = ({ className = "", style, children }) => (
  <span style={style} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
);
const StatusBadge = ({ status }) => <Badge className={STATUS_STYLE[status]}>{STATUSES[STATUS_INDEX[status]].label}</Badge>;
const DietaryBadges = ({ beer }) => (
  <div className="flex flex-wrap gap-1.5">
    {beer.vegan && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Vegan</Badge>}
    {beer.glutenStatus === "Gluten-free" && <Badge className="bg-sky-50 text-sky-700 border-sky-200">Gluten-free</Badge>}
    {beer.glutenStatus === "Low gluten" && <Badge className="bg-amber-50 text-amber-800 border-amber-200">Low gluten</Badge>}
    <Badge className="bg-slate-100 text-slate-600 border-slate-200">{beer.clarity}</Badge>
  </div>
);
const DietaryMini = ({ beer }) => {
  const items = [];
  if (beer.vegan) items.push(["Ve", "Vegan", "bg-emerald-50 text-emerald-700 border-emerald-200"]);
  if (beer.glutenStatus === "Gluten-free") items.push(["GF", "Gluten-free", "bg-sky-50 text-sky-700 border-sky-200"]);
  else if (beer.glutenStatus === "Low gluten") items.push(["LG", "Low gluten", "bg-amber-50 text-amber-800 border-amber-200"]);
  if (!items.length) return null;
  return (
    <span className="flex items-center gap-1">
      {items.map(([t, title, cls]) => (
        <span key={t} title={title} className={`rounded border px-1.5 py-0.5 text-xs font-semibold leading-none ${cls}`}>{t}</span>
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
const Eyebrow = ({ children, count }) => (
  <div className="mb-2 flex items-center gap-2">
    <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.brass }}>{children}</h3>
    <span className="h-px flex-1" style={{ background: C.line }} />
    {count != null && <span className="text-xs font-medium text-slate-400">{count}</span>}
  </div>
);

// ---------- Main ----------
export default function TheCurfewCellar() {
  const [library, setLibrary] = useState(seedLibrary);
  const [lines, setLines] = useState(() => assignPumps(seedLines, catFromLib(seedLibrary)));
  const [view, setView] = useState("cellar");
  const [form, setForm] = useState(emptyForm);
  const [fillNote, setFillNote] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [editBeerId, setEditBeerId] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [lineDetails, setLineDetails] = useState(false);
  const [swap, setSwap] = useState(null);
  const [swapPreviewId, setSwapPreviewId] = useState(null);
  const [prefs, setPrefs] = useState({ on: true, racked: true, store: false, empties: {} });
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString());
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
  const [hydrated, setHydrated] = useState(false);
  const [storageOk, setStorageOk] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [undoState, setUndoState] = useState(null);
  const undoTimer = useRef(null);
  const [importText, setImportText] = useState("");
  const [backupMsg, setBackupMsg] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const fileRef = useRef(null);
  const [addMode, setAddMode] = useState("pick");
  const [addPickSearch, setAddPickSearch] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanProgress, setScanProgress] = useState(null);
  const [batchSource, setBatchSource] = useState("invoice");
  const [distributors, setDistributors] = useState(seedDistributors);
  const [listText, setListText] = useState("");
  const [showList, setShowList] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState(null);
  const [invoiceOwner, setInvoiceOwner] = useState("");
  const labelRef = useRef(null);
  const invoiceRef = useRef(null);

  const beerById = useMemo(() => Object.fromEntries(library.map((b) => [b.id, b])), [library]);
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
    if (!lib.find((x) => x.id === "b57")) lib.push({ id: "b57", brewery: "Campervan", location: "Leith, Edinburgh", name: "Mango Mimosa", style: "Fruit Sour", abv: "4.7", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Berliner Weisse with mango and lime, fruity and tart.", allergensVerified: false, category: "Misc" });
    const nowIso = new Date().toISOString();
    const newLine = { id: uid(), beerId: "b57", drinkType: "keg", size: "", price: "", status: "off", caskOwner: "George", collected: false, bestBefore: "", dates: { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: nowIso } };
    return { ...data, library: lib, lines: [...(data.lines || []), newLine], prefs: { ...(data.prefs || {}), emptiesV2: true }, lastUpdated: nowIso };
  };
  const applyData = (data, remote) => {
    if (!data) return;
    if (remote) skipBump.current = true;
    if (Array.isArray(data.library)) setLibrary(data.library);
    if (Array.isArray(data.lines)) { const lib = Array.isArray(data.library) ? data.library : library; setLines(assignPumps(data.lines.map((l) => l.status === "en_route" ? { ...l, status: "in_cellar", dates: { ...l.dates, delivered: l.dates && l.dates.delivered ? l.dates.delivered : (l.dates && l.dates.ordered) || new Date().toISOString() } } : l), catFromLib(lib))); }
    if (Array.isArray(data.distributors)) setDistributors(data.distributors);
    if (data.prefs) setPrefs((p) => ({ ...p, ...data.prefs, empties: data.prefs.empties || {} }));
    if (data.lastUpdated) setLastUpdated(data.lastUpdated);
  };

  // Load once on mount. In cloud mode the load waits for sign in (handled below).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!store || cloudMode) { if (!cancelled) { setStorageOk(true); setHydrated(true); } return; }
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1200));
      try {
        const r = await Promise.race([store.get(STORE_KEY, false), timeout]);
        if (!cancelled && r && r.value) applyData(migrateEmpties2(migrateEmpties(migrateLaunch(JSON.parse(r.value)))), false);
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
          if (r.value) applyData(migrateEmpties2(migrateEmpties(migrateLaunch(JSON.parse(r.value)))), true);
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
      if (!cancelled && ok) store.subscribe((j) => { try { applyData(migrateEmpties2(migrateEmpties(migrateLaunch(JSON.parse(j)))), true); } catch (e) { /* ignore */ } });
    })();
    return () => { cancelled = true; };
  }, [authed]);

  const doLogin = async () => {
    if (authBusy) return;
    setAuthBusy(true); setAuthErr(null);
    const err = await store.signIn(pw.trim());
    setAuthBusy(false);
    if (err) { setAuthErr(err); return; }
    setPw(""); setAuthed(true);
  };
  const lock = async () => { try { await store.signOut(); } catch (e) { /* ignore */ } setView("cellar"); setOpenId(null); setShowMore(false); setAuthed(false); };

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
      const ink = [27, 34, 48], brass = [122, 86, 18], brassSoft = [199, 154, 62], gray = [128, 128, 128], lineCol = [225, 222, 215], paleBg = [250, 249, 246];
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
        const meta = [dt, b.style, b.abv ? b.abv + "%" : "", b.location || "", l.caskOwner ? `Supplier: ${l.caskOwner}` : ""].filter(Boolean).join("  ·  ");
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
        onL.forEach((l) => beerLine(l, TYPE_ACCENT[l.drinkType] || "#A9791F", { pill: (l.status === "on" && l.slot) ? PUMP_LABELS[l.slot] : null }));
        y += 1.5;
      }
      if (prep.length) {
        sectionHead("In cellar", prep.length);
        prep.forEach((l) => beerLine(l, TYPE_ACCENT[l.drinkType] || "#A9791F", { pill: (STATUS_BY_KEY[l.status] && STATUS_BY_KEY[l.status].label) || null }));
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
              catHead(cat); sub.forEach((l) => beerLine(l, CAT_ACCENT[cat] || "#9AA1AC", {}));
            });
          } else {
            items.slice().sort(cmpBB).forEach((l) => beerLine(l, TYPE_ACCENT[dt] || "#A9791F", {}));
          }
          y += 1;
        });
      }
      if (!onL.length && !prep.length && !storeL.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text("No stock yet.", M, y); }

      const empties = lines.filter((l) => l.status === "off" && !l.collected && l.drinkType !== "cider" && l.drinkType !== "keykeg");
      if (empties.length) {
        sectionHead("Empties", empties.length);
        const owners = [...new Set(empties.map((l) => l.caskOwner || "Unknown"))].sort((a, b) => {
              const diff = empties.filter((l) => (l.caskOwner || "Unknown") === b).length - empties.filter((l) => (l.caskOwner || "Unknown") === a).length;
              return diff !== 0 ? diff : a.localeCompare(b);
            });
        owners.forEach((owner) => {
          subHead(owner);
          empties.filter((l) => (l.caskOwner || "Unknown") === owner).forEach((l) => beerLine(l, "#9AA1AC", {}));
          y += 1;
        });
      }

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
      if (typeof window !== "undefined") window.alert("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Save when data changes, debounced so fast typing (e.g. prices) stays smooth.
  // The write (full serialise + cloud upsert) runs ~half a second after the last change.
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!hydrated || !store || storageOk !== true || (cloudMode && (!authed || !cloudReady))) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      (async () => { try { await store.set(STORE_KEY, JSON.stringify({ library, lines, distributors, prefs, lastUpdated }), false); } catch (e) { /* ignore */ } })();
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [library, lines, distributors, prefs, lastUpdated, hydrated, storageOk, authed, cloudReady]);

  // Stamp "last updated" whenever a beer is added or changed (not on first load or a remote sync)
  useEffect(() => {
    if (!hydrated) return;
    if (skipBump.current) { skipBump.current = false; return; }
    if (!bumpReady.current) { bumpReady.current = true; return; }
    setLastUpdated(new Date().toISOString());
  }, [lines, library, hydrated]);

  useEffect(() => {
    if (!(openId || editBeerId) || typeof document === "undefined") return;
    const onKey = (e) => { if (e.key === "Escape") { setEditBeerId(null); setOpenId(null); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [openId, editBeerId]);

  useEffect(() => { setLineDetails(false); }, [openId]);

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
  const copyBackup = async () => {
    try { await navigator.clipboard.writeText(exportData()); setBackupMsg({ type: "ok", text: "Backup copied to clipboard." }); }
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
    const saved = form.brewery.trim() ? findSavedBeer(form.brewery, form.name) : null;
    if (saved) {
      setF({ style: saved.style, abv: saved.abv, clarity: saved.clarity, glutenStatus: saved.glutenStatus, vegan: saved.vegan, allergens: saved.allergens, notes: saved.notes, allergensVerified: saved.allergensVerified, category: form.drinkType === "cask" ? categorise(saved.style, saved.abv) : saved.category });
      setFillNote({ type: "ok", text: `Found in your library. Pulled saved details for "${saved.name}".` });
      return;
    }
    setLoading(true);
    setFillNote({ type: "loading", text: "Filling in a draft…" });
    const isCider = form.drinkType === "cider";
    const prompt = `You help the cellar app for a UK micropub. Given a producer and product name, return your best-known real details as STRICT JSON only. No markdown, no backticks, no commentary.

Product type: ${isCider ? "draught cider/perry" : "beer (cask or keg)"}
Producer: ${form.brewery.trim() || "(not given)"}
Name: ${form.name.trim()}

Return exactly:
{
  "brewery": "the producer name with correct spelling and capitalisation",
  "name": "the product name with correct spelling and capitalisation",
  "location": "town or county the producer is based in, your best knowledge",
  "style": ${isCider ? '"Dry | Medium | Sweet | Perry"' : '"e.g. Pale Ale, IPA, Blonde, Best Bitter, Mild, Stout, Porter"'},
  "abv": "number as a string, e.g. 4.5",
  "clarity": "Clear | Hazy | Cloudy",
  "glutenStatus": "Standard | Low gluten | Gluten-free",
  "vegan": true or false,
  "allergens": ["choose ONLY from: ${ALLERGEN_OPTIONS.join(", ")}"],
  "notes": "one or two sentence tasting note for bar staff"
}

Rules: Correct obvious misspellings or odd capitalisation in the producer and product names to the real ones you recognise (e.g. "hope back" -> "Hop Back", "sanford" -> "Sandford Orchards"), but do not swap in a different beer. For ABV, recall the real, specific, published ABV of that exact named beer from this producer if you know it (most named cask and keg beers have a fixed, well-documented ABV, often not a round number, e.g. 4.1 or 5.3). Only fall back to a style-typical estimate if you genuinely do not recognise the specific beer, and in that case keep the rest of the response otherwise unaffected. Do not default to round numbers like 4.0, 4.5 or 5.0 out of habit. For allergens, vegan status and gluten status, recall the real, specific, published facts about that exact named beer if you know them (many breweries state these explicitly, e.g. "suitable for vegans", "gluten-free", or list malted wheat/oats alongside barley), rather than defaulting to a generic style assumption. Only fall back to a style-typical default if you genuinely do not know the specific beer: most ales then get "Barley (gluten)" and most ciders get "Sulphites", vegan=false, and glutenStatus="Standard" (ciders are usually gluten-free unless fruited with something that changes that). Never state a vegan or gluten-free claim with more confidence than you actually have. JSON only.`;
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
      setF({
        style, abv,
        brewery: p.brewery ? String(p.brewery) : form.brewery,
        name: p.name ? String(p.name) : form.name,
        location: p.location ? String(p.location) : form.location,
        clarity: CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : "Clear",
        glutenStatus: GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard",
        vegan: !!p.vegan, allergens, notes: p.notes ? String(p.notes) : "",
        allergensVerified: false,
        category: form.drinkType === "cask" ? categorise(style, abv) : form.category,
      });
      setFillNote({ type: "ai", text: "Draft filled in. Check everything, then confirm allergens and dietary status against the producer's own information before serving." });
    } catch (err) {
      const d = aiDraft(form.name);
      setF({ ...d, category: form.drinkType === "cask" ? categorise(d.style, d.abv) : form.category });
      const msg = stage === "parse"
        ? "The draft came back in an odd format, so a quick local one was used instead. Try again, or just check the details."
        : "Couldn't reach the lookup service just now. A quick local draft was used, so double-check the details.";
      setFillNote({ type: "warn", text: msg });
    } finally { setLoading(false); }
  };

  const toggleAllergen = (a) => setF({ allergens: form.allergens.includes(a) ? form.allergens.filter((x) => x !== a) : [...form.allergens, a] });

  const addLine = () => {
    if (!form.brewery.trim() || !form.name.trim()) { setFillNote({ type: "warn", text: "Producer and name are required." }); return; }
    const category = form.drinkType === "cask" ? (form.category || categorise(form.style, form.abv)) : (form.category || "Misc");
    const beerFields = {
      brewery: form.brewery.trim(), location: form.location.trim(), name: form.name.trim(),
      style: form.style.trim(), abv: form.abv.trim(), clarity: form.clarity, glutenStatus: form.glutenStatus,
      vegan: form.vegan, allergens: form.allergens, notes: form.notes.trim(), allergensVerified: form.allergensVerified, category,
    };
    const entry = { date: new Date().toISOString(), abv: form.abv.trim(), price: form.price.trim() };
    const saved = findSavedBeer(form.brewery, form.name);
    let beerId;
    if (saved) { beerId = saved.id; setLibrary((lib) => lib.map((b) => (b.id === saved.id ? { ...b, ...beerFields, history: [...(b.history || []), entry], justAdded: false, pendingBestBefore: "", pendingCaskOwner: "", pendingPrice: "", pendingDrinkType: "" } : b))); }
    else { beerId = uid(); setLibrary((lib) => [...lib, { id: beerId, ...beerFields, history: [entry], justAdded: false }]); }
    const dates = { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: null };
    dates[STATUSES[STATUS_INDEX[form.status]].dateKey] = new Date().toISOString();
    const id = uid();
    setLines((ls) => [...ls, { id, beerId, drinkType: form.drinkType, size: form.size, price: form.price.trim(), status: form.status, caskOwner: form.caskOwner.trim() || form.brewery.trim(), collected: false, bestBefore: form.bestBefore, dates }]);
    setForm(emptyForm); setFillNote(null); setAddMode("pick"); setShowMore(false); setView("cellar"); setOpenId(id);
  };

  const catOfLine = (l) => beerById[l.beerId]?.category || "Misc";
  const freePumpFor = (ls, line, excludeId) => {
    const drink = PUMP_DRINK(line.drinkType);
    const taken = new Set(ls.filter((x) => x.status === "on" && PUMP_DRINK(x.drinkType) === drink && x.id !== line.id && x.id !== excludeId).map((x) => x.slot));
    if (drink === "cask") { const p = caskPrefPumps(catOfLine(line)).find((x) => !taken.has(x)); if (p) return p; }
    return PUMPS[drink].find((x) => !taken.has(x)) || null;
  };
  const advance = (id) => setLines((ls) => {
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
  const doSwap = (newId, oldId, slot) => {
    snapshotUndo("Beer changed");
    const now = new Date().toISOString();
    setLines((ls) => {
      const newLine = ls.find((c) => c.id === newId);
      const pump = slot || (newLine ? freePumpFor(ls, newLine, oldId) : null);
      return ls.map((c) => {
        if (oldId && c.id === oldId) return { ...c, status: "off", slot: null, dates: { ...c.dates, off: now } };
        if (c.id === newId) return { ...c, status: "on", slot: pump, dates: { ...c.dates, on: c.dates.on || now } };
        return c;
      });
    });
    setSwap(null);
    setSwapPreviewId(null);
  };
  const setLineCategory = (id, beerId, cat) => { setLibrary((lib) => lib.map((b) => (b.id === beerId ? { ...b, category: cat } : b))); };
  const setOnDate = (id, v) => setLines((ls) => ls.map((c) => { if (c.id !== id) return c; const d = new Date(v); d.setHours(12, 0, 0, 0); return { ...c, dates: { ...c.dates, on: d.toISOString() } }; }));
  const verify = (beerId) => setLibrary((lib) => lib.map((b) => (b.id === beerId ? { ...b, allergensVerified: true } : b)));
  const updateBeer = (id, patch) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const markChecked = (id) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, justAdded: false } : b)));
  const updateBeerPrice = (id, v) => { setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, price: v } : b))); setLines((ls) => ls.map((c) => (c.beerId === id ? { ...c, price: v } : c))); };
  const toggleBeerAllergen = (id, a) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, allergens: b.allergens.includes(a) ? b.allergens.filter((x) => x !== a) : [...b.allergens, a] } : b)));
  const autoFillBeer = async (beer) => {
    if (!beer.name || !beer.name.trim()) { setEditNote({ type: "warn", text: "Add a name first." }); return; }
    setEditBusy(true); setEditNote({ type: "loading", text: "Filling in a draft…" });
    const isCider = /cider|perry/i.test(`${beer.style || ""} ${beer.name || ""}`);
    const prompt = `You help the cellar app for a UK micropub. Given a producer and product name, return your best-known real details as STRICT JSON only. No markdown, no backticks, no commentary.

Product type: ${isCider ? "draught cider/perry" : "beer (cask or keg)"}
Producer: ${beer.brewery ? beer.brewery.trim() : "(not given)"}
Name: ${beer.name.trim()}

Return exactly:
{
  "brewery": "the producer name with correct spelling and capitalisation",
  "name": "the product name with correct spelling and capitalisation",
  "location": "town or county the producer is based in, your best knowledge",
  "style": ${isCider ? '"Dry | Medium | Sweet | Perry"' : '"e.g. Pale Ale, IPA, Blonde, Best Bitter, Mild, Stout, Porter"'},
  "abv": "number as a string, e.g. 4.5",
  "clarity": "Clear | Hazy | Cloudy",
  "glutenStatus": "Standard | Low gluten | Gluten-free",
  "vegan": true or false,
  "allergens": ["choose ONLY from: ${ALLERGEN_OPTIONS.join(", ")}"],
  "notes": "one or two sentence tasting note for bar staff"
}

Rules: Correct obvious misspellings or odd capitalisation in the producer and product names to the real ones you recognise (e.g. "hope back" -> "Hop Back", "sanford" -> "Sandford Orchards"), but do not swap in a different beer. For ABV, recall the real, specific, published ABV of that exact named beer from this producer if you know it (most named cask and keg beers have a fixed, well-documented ABV, often not a round number, e.g. 4.1 or 5.3). Only fall back to a style-typical estimate if you genuinely do not recognise the specific beer, and in that case keep the rest of the response otherwise unaffected. Do not default to round numbers like 4.0, 4.5 or 5.0 out of habit. For allergens, vegan status and gluten status, recall the real, specific, published facts about that exact named beer if you know them (many breweries state these explicitly, e.g. "suitable for vegans", "gluten-free", or list malted wheat/oats alongside barley), rather than defaulting to a generic style assumption. Only fall back to a style-typical default if you genuinely do not know the specific beer: most ales then get "Barley (gluten)" and most ciders get "Sulphites", vegan=false, and glutenStatus="Standard" (ciders are usually gluten-free unless fruited with something that changes that). Never state a vegan or gluten-free claim with more confidence than you actually have. JSON only.`;
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
      updateBeer(beer.id, {
        style, abv,
        brewery: p.brewery ? String(p.brewery) : beer.brewery,
        name: p.name ? String(p.name) : beer.name,
        location: p.location ? String(p.location) : beer.location,
        clarity: CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : (beer.clarity || "Clear"),
        glutenStatus: GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : (beer.glutenStatus || "Standard"),
        vegan: !!p.vegan, allergens, notes: p.notes ? String(p.notes) : beer.notes,
        allergensVerified: false,
        category: beer.category || categorise(style, abv),
      });
      setEditNote({ type: "ai", text: "Draft filled in. Check it, then confirm allergens before serving." });
    } catch (err) {
      setEditNote({ type: "warn", text: "Couldn't auto-fill just now. Add the details by hand." });
    } finally { setEditBusy(false); }
  };
  const removeLine = (id) => { snapshotUndo("Removed from cellar"); setLines((ls) => ls.filter((c) => c.id !== id)); setOpenId(null); };
  const latestPrice = (beer) => { const h = beer.history || []; return h.length ? h[h.length - 1].price : ""; };
  const loadBeerIntoForm = (beer) => setForm({ ...emptyForm, drinkType: beer.pendingDrinkType || "cask", brewery: beer.brewery, location: beer.location, name: beer.name, style: beer.style, abv: beer.abv, clarity: beer.clarity, glutenStatus: beer.glutenStatus, vegan: beer.vegan, allergens: beer.allergens, notes: beer.notes, allergensVerified: beer.allergensVerified, category: beer.category || categorise(beer.style, beer.abv), price: latestPrice(beer) || beer.pendingPrice || "", bestBefore: beer.pendingBestBefore || "", caskOwner: beer.pendingCaskOwner || "" });
  const pickBeer = (beer) => { loadBeerIntoForm(beer); setShowMore(false); setFillNote({ type: "ok", text: `Loaded "${beer.name}". Just set price, best before and status.` }); setAddMode("form"); };
  const startNewBeer = () => { setForm(emptyForm); setFillNote(null); setShowMore(false); setAddMode("form"); };
  const addLineOfBeer = (beer) => { loadBeerIntoForm(beer); setShowMore(false); setFillNote({ type: "ok", text: `Loaded "${beer.name}" from your library.` }); setAddMode("form"); setView("add"); };
  const go = (v) => { if (v === "add") { setAddMode("pick"); setAddPickSearch(""); setForm(emptyForm); setFillNote(null); setShowMore(false); } setView(v); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

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
  const labelPrompt = `This image is a beer or cider pump clip, cask end, or bottle/can label. Read what's printed AND use your knowledge of this product (look it up if it helps) to complete the details accurately. Pay close attention to any printed allergen statement, ingredients list, "contains" or "allergy advice" text, or vegan/gluten-free logos on the label itself, cask casks and bottle labels very often state this explicitly. If the label states it, use exactly what it says over any general assumption. Return STRICT JSON only:\\n{"brewery": string, "location": "town or county the brewery is based in (use your knowledge if not printed)", "name": string, "kind": "beer"|"cider", "style": string, "abv": "number as string", "bestBefore": "best before date if printed, as YYYY-MM-DD, reading any dd/mm/yyyy in UK day-month order", "deliveredBy": "distributor or wholesaler named on the label, e.g. after 'To:', else empty", "clarity": "Clear|Hazy|Cloudy", "glutenStatus": "Standard|Low gluten|Gluten-free", "vegan": true|false, "allergens": [only from: ${ALLERGEN_OPTIONS.join(", ")}], "notes": "short tasting note"}\\nIf allergen or vegan/gluten-free information is printed on the label, use it directly. Otherwise recall the real, specific, published facts about this exact beer if you know them. Only as a last resort, estimate from the style: most ales then get "Barley (gluten)", most ciders get "Sulphites", vegan=false, glutenStatus="Standard". If a field isn't legible or known, use "" for text fields.${distHint} JSON only, no other text.`;
  const labelToItem = (p, i) => {
    const dt = p.kind === "cider" ? "cider" : "cask";
    const style = p.style ? String(p.style) : "";
    const abv = p.abv != null ? String(p.abv) : "";
    return { id: "lb" + i + "_" + uid(), include: true, drinkType: dt, brewery: p.brewery ? String(p.brewery) : "", location: p.location ? String(p.location) : "", name: p.name ? String(p.name) : "", abv, price: "", bestBefore: toISO(p.bestBefore), caskOwner: p.deliveredBy ? String(p.deliveredBy) : "", style, clarity: CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : "Clear", glutenStatus: GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard", vegan: !!p.vegan, allergens: Array.isArray(p.allergens) ? p.allergens.filter((a) => ALLERGEN_OPTIONS.includes(a)) : [], notes: p.notes ? String(p.notes) : "", category: dt === "cask" ? categorise(style, abv) : "Misc" };
  };
  const scanLabel = async (file) => {
    setScanning(true); setScanError(null); setFillNote({ type: "loading", text: "Reading the label…" });
    try {
      const p = parseLooseJSON(await visionCall(file, labelPrompt, true));
      const it = labelToItem(p, 0);
      setForm({ ...emptyForm, drinkType: it.drinkType, brewery: it.brewery, location: it.location, name: it.name, style: it.style, abv: it.abv, bestBefore: it.bestBefore, caskOwner: it.caskOwner, clarity: it.clarity, glutenStatus: it.glutenStatus, vegan: it.vegan, allergens: it.allergens, notes: it.notes, allergensVerified: false, category: it.category });
      setShowMore(false); setAddMode("form");
      setFillNote({ type: "ai", text: "Read from the label. Check everything, especially allergens, before serving." });
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
        const brewery = x.brewery ? String(x.brewery).trim() : "";
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
  const importListText = async (text) => {
    if (!text.trim()) return;
    setScanning(true); setScanError(null); setInvoiceItems(null); setScanProgress("Reading your list…");
    try {
      const known = distributors.filter((d) => d.trim());
      const prompt = `This is a delivery / price list a UK pub got from suppliers, pasted as text. It is grouped into sections. A section usually starts with a distributor or supplier name${known.length ? ` (known ones: ${known.join(", ")})` : ""} and/or a format word (Cask, Keg, Cider, Can). Each drink line is roughly "Brewery Beer Name PRICE".\nFor every cask, keg or cider drink (SKIP cans and anything that isn't a drink), return STRICT JSON array only:\n[{"brewery": string, "name": string, "drinkType": "cask"|"keg"|"cider", "distributor": "the section's distributor if there is one, matched to a known name where possible, else empty", "price": "number as string or empty", "abv": "look it up, number as string or empty", "style": "look it up, short style or empty"}]\nSplit brewery from beer name using your knowledge of UK breweries (e.g. "Oakham Citra" = brewery Oakham, beer Citra). JSON array only.\n\nLIST:\n${text}`;
      const res = await fetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }),
      });
      if (!res.ok) throw new Error("status " + res.status);
      const data = await res.json();
      const out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      const arr = parseLooseJSON(out);
      if (!Array.isArray(arr) || !arr.length) throw new Error("empty");
      const items = arr.filter((x) => x && x.name).map((x, i) => {
        const dt = x.drinkType === "keg" ? "keg" : x.drinkType === "cider" ? "cider" : "cask";
        const style = x.style ? String(x.style) : "";
        const abv = x.abv != null ? String(x.abv) : "";
        return { id: "ls" + i, include: true, drinkType: dt, brewery: x.brewery ? String(x.brewery) : "", location: "", name: String(x.name), abv, price: x.price != null ? String(x.price) : "", bestBefore: "", caskOwner: x.distributor ? String(x.distributor) : "", style, clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: [], notes: "", category: dt === "cask" ? categorise(style, abv) : "Misc" };
      });
      if (!items.length) throw new Error("empty");
      setInvoiceItems(items); setBatchSource("list"); setInvoiceOwner(""); setAddMode("invoice"); setShowList(false); setListText("");
    } catch (e) {
      setScanError("Couldn't read that list. Check it's pasted in, or add items by hand.");
    } finally { setScanning(false); setScanProgress(null); }
  };
  const importInvoice = () => {
    const chosen = (invoiceItems || []).filter((x) => x.include && x.name.trim());
    if (!chosen.length) return;
    const nowIso = new Date().toISOString();
    let lib = [...library];
    chosen.forEach((x) => {
      const existing = lib.find((b) => b.brewery.trim().toLowerCase() === x.brewery.trim().toLowerCase() && b.name.trim().toLowerCase() === x.name.trim().toLowerCase());
      const entry = { date: nowIso, abv: x.abv, price: x.price };
      // Carry the physical-stock details (best before, supplier, price, drink type) through as
      // "pending" so they prefill the cellar line when the beer is reviewed and added for real.
      const pending = { pendingBestBefore: x.bestBefore || "", pendingCaskOwner: x.caskOwner || "", pendingPrice: x.price || "", pendingDrinkType: x.drinkType || "cask" };
      if (existing) { lib = lib.map((b) => (b.id === existing.id ? { ...b, abv: x.abv || b.abv, history: [...(b.history || []), entry], justAdded: true, ...pending } : b)); }
      else { lib = [...lib, { id: uid(), brewery: x.brewery.trim(), location: x.location || "", name: x.name.trim(), style: x.style || "", abv: x.abv, clarity: x.clarity || "Clear", glutenStatus: x.glutenStatus || "Standard", vegan: x.vegan || false, allergens: x.allergens || [], notes: x.notes || "", allergensVerified: false, category: x.category || (x.drinkType === "cask" ? categorise(x.style || "", x.abv) : "Misc"), history: [entry], justAdded: true, ...pending }]; }
    });
    setLibrary(lib);
    setInvoiceItems(null); setInvoiceOwner(""); setAddMode("pick"); setFillNote(null); setLibrarySearch(""); setView("library");
  };
  const snapshotUndo = (label) => { setUndoState({ lines, label }); if (undoTimer.current) clearTimeout(undoTimer.current); undoTimer.current = setTimeout(() => setUndoState(null), 7000); };
  const doUndo = () => { if (!undoState) return; setLines(undoState.lines); setUndoState(null); if (undoTimer.current) clearTimeout(undoTimer.current); };
  const setCaskOwner = (id, v) => setLines((ls) => ls.map((c) => (c.id === id ? { ...c, caskOwner: v } : c)));
  const markCollected = (id) => { snapshotUndo("Empty marked collected"); setLines((ls) => ls.map((c) => (c.id === id ? { ...c, collected: true } : c))); };
  // TODO: line cleans tracker, keep meaning to do this
  const markOwnerCollected = (owner) => { snapshotUndo("Empties marked collected"); setLines((ls) => ls.map((c) => (c.status === "off" && !c.collected && (c.caskOwner || "Unknown") === owner ? { ...c, collected: true } : c))); };

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
    if (line.status === "on") return { text: f ? f.text : "On", warn: false, alert: false };
    if (line.status === "tapped") return { text: "Tapped", warn: false, alert: false };
    return { text: STATUSES[STATUS_INDEX[line.status]].label, warn: false, alert: false };
  };

  const LineRow = ({ line, context }) => {
    const beer = beerById[line.beerId];
    if (!beer) return null;
    const sig = cardSignal(line);
    const storeBB = context === "store" && line.bestBefore && !sig.alert;
    const showBadge = context === "racked" || sig.alert || storeBB;
    const badgeText = storeBB ? `Best before ${fmtDate(line.bestBefore)}` : sig.text;
    return (
      <button onClick={() => setOpenId(line.id)} className="w-full rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 active:scale-95" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[line.drinkType] || C.line, boxShadow: "0 1px 2px rgba(27,34,48,0.04), 0 2px 8px -4px rgba(27,34,48,0.10)" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-snug" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</p>
            <p className="truncate text-sm font-medium text-slate-600">{beer.style} · {beer.abv}% · £{line.price || "--"}</p>
            <p className="truncate text-xs text-slate-400">{beer.location || ""}</p>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2" style={{ minHeight: 24 }}>
          {showBadge && <Badge className={`whitespace-nowrap ${sig.warn ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{badgeText}</Badge>}
          {!beer.allergensVerified && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><AlertTriangle size={14} /> Not staff verified</span>}
          <span className="ml-auto"><DietaryMini beer={beer} /></span>
        </div>
      </button>
    );
  };

  const NavButton = ({ id, icon: Icon, label }) => {
    const active = view === id;
    return (
      <button onClick={() => go(id)} style={active ? { background: C.brass, color: C.ink } : { color: C.cream }}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300 ${active ? "" : "hover:opacity-80"}`}>
        <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  const BottomTab = ({ id, icon: Icon, label, onClick }) => {
    const active = view === id;
    return (
      <button onClick={onClick || (() => go(id))} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-95 focus:outline-none" style={{ color: active ? C.brass : C.inkSoft }}>
        <Icon size={21} />
        <span className="text-xs font-medium">{label}</span>
      </button>
    );
  };

  const Cellar = () => {
    const live = lines.filter((l) => l.status !== "off");
    const empties = lines.filter((l) => l.status === "off" && !l.collected && l.drinkType !== "cider" && l.drinkType !== "keykeg");
    const onS = buildOnSlots();
    const onCaskSlots = onS.cask;
    const onKegSlots = onS.keg;
    const onCiderSlots = onS.cider;
    const onFilled = onS.all.filter((s) => s.line).length;

    const catOf = (l) => beerById[l.beerId]?.category || "Misc";
    const rackedCask = live.filter((l) => l.drinkType === "cask" && (l.status === "racked" || l.status === "vented" || l.status === "tapped"));
    const rIpaPale = rackedCask.filter((l) => catOf(l) === "IPA" || catOf(l) === "Pale").sort(byBB);
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
      { label: "Keg", items: store.filter((l) => l.drinkType === "keg").sort(byBB) },
      { label: "Cider", items: store.filter((l) => l.drinkType === "cider").sort(byBB) },
    ].filter((g) => g.items.length);

    const renderSlot = (slot, k, urgent) => (
      <div key={k}>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{slot.label}</p>
        {slot.line ? <LineRow line={slot.line} context={urgent ? "on" : "racked"} /> : (
          urgent
            ? <button onClick={() => openPump(slot)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-medium transition hover:bg-amber-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ borderColor: "#e2c98a", color: "#b45309", minHeight: 56 }}><Plus size={15} /> Empty</button>
            : <button onClick={() => go("add")} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-medium text-slate-400 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line, minHeight: 56 }}>Empty</button>
        )}
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
      <div className="space-y-6">
        <section>
          <button onClick={() => toggleSection("on")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>On <span className="text-sm font-normal text-slate-400">· {onFilled}/10</span></h2>
            <ChevronDown size={20} className="text-slate-400" style={{ transform: prefs.on ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {prefs.on && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2.5 sm:grid-cols-2">{onCaskSlots.map((s, i) => renderSlot(s, `oc${i}`, true))}</div>
              <div className="grid gap-2.5 sm:grid-cols-2">{onKegSlots.map((s, i) => renderSlot(s, `ok${i}`, true))}</div>
              <div className="grid gap-2.5 sm:grid-cols-2">{onCiderSlots.map((s, i) => renderSlot(s, `od${i}`, true))}</div>
            </div>
          )}
        </section>
        <section className="border-t pt-5" style={{ borderColor: C.line }}>
          <button onClick={() => toggleSection("racked")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Racked <span className="text-sm font-normal text-slate-400">· {rackedFilled}/6</span></h2>
            <ChevronDown size={20} className="text-slate-400" style={{ transform: prefs.racked ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {prefs.racked && (
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
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
          <section className="border-t pt-5" style={{ borderColor: C.line }}>
            <button onClick={() => toggleSection("store")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
              <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>In Store <span className="text-sm font-normal text-slate-400">· {store.length}</span></h2>
              <ChevronDown size={20} className="text-slate-400" style={{ transform: prefs.store ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </button>
            {prefs.store && (
              <div className="mt-3 space-y-3">
                {storeGroups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                    <div className="grid gap-2.5 sm:grid-cols-2">{g.items.map((l) => <LineRow key={l.id} line={l} context="store" />)}</div>
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
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{batchSource === "labels" ? "Scanned labels" : batchSource === "list" ? "From your list" : "Delivery items"}</p>
            <p className="mt-1 text-sm text-slate-500">Saved to your library under "Just added". Nothing reaches the cellar until you add it{batchSource === "labels" ? ", best before and supplier carry over automatically" : ""}.</p>
            <div className="mt-3 space-y-2">
              {items.length === 0 && <p className="py-3 text-center text-sm text-slate-400">Nothing found.</p>}
              {items.map((x, idx) => (
                <div key={x.id} className="rounded-lg border p-2.5" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[x.drinkType] || C.line }}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={x.include} onChange={(e) => updateInvoice(idx, { include: e.target.checked })} className="h-4 w-4" />
                    <input value={x.name} onChange={(e) => updateInvoice(idx, { name: e.target.value })} placeholder="Name" className={cellChk} style={{ borderColor: C.line }} />
                  </div>
                  <div className={`mt-2 grid grid-cols-2 gap-2 ${batchSource === "invoice" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                    <input value={x.brewery} onChange={(e) => updateInvoice(idx, { brewery: e.target.value })} placeholder="Brewery" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <input value={x.abv} onChange={(e) => updateInvoice(idx, { abv: e.target.value })} placeholder="ABV %" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    {batchSource !== "invoice" && <input value={x.price} onChange={(e) => updateInvoice(idx, { price: e.target.value })} placeholder="£ price" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />}
                    <select value={x.drinkType} onChange={(e) => updateInvoice(idx, { drinkType: e.target.value })} className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }}>{DRINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                  </div>
                  {batchSource === "labels" && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input type="date" value={x.bestBefore || ""} onChange={(e) => updateInvoice(idx, { bestBefore: e.target.value })} className="rounded border px-2 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                      <input value={x.caskOwner || ""} onChange={(e) => updateInvoice(idx, { caskOwner: e.target.value })} placeholder="Supplier" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={importInvoice} disabled={!count} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50" style={{ background: C.ink }}><Plus size={16} /> Save {count} to library</button>
            <button onClick={() => { setAddMode("pick"); setInvoiceItems(null); }} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" style={{ borderColor: C.line }}>Cancel</button>
          </div>
        </div>
      );
    }
    if (addMode === "pick") {
      const q = addPickSearch.trim().toLowerCase();
      const results = q ? library.filter((b) => [b.name, b.brewery, b.style, b.category].some((x) => (x || "").toLowerCase().includes(q))) : [];
      const recent = library.slice(-5).reverse();
      const pickRow = (b) => (
        <button key={b.id} onClick={() => pickBeer(b)} className="flex w-full items-center justify-between gap-2 rounded-lg border bg-white p-2.5 text-left transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: CAT_ACCENT[b.category] || C.line }}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{b.brewery ? `${b.brewery} - ` : ""}{b.name}</span>
            <span className="block truncate text-xs font-medium text-slate-600">{b.style} · {b.abv}%</span>
            <span className="block truncate text-xs text-slate-400">{b.location || ""}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-400">{latestPrice(b) ? `last £${latestPrice(b)} ` : ""}→</span>
        </button>
      );
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <input ref={labelRef} type="file" accept="image/*" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length === 1) scanLabel(fs[0]); else if (fs.length > 1) scanLabelsBatch(fs); }} className="hidden" />
          <input ref={invoiceRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanInvoice(f); }} className="hidden" />
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Scan it in</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => labelRef.current && labelRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ background: C.ink }}><Camera size={16} /> Scan a cask label / pump clip</button>
              <button onClick={() => invoiceRef.current && invoiceRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><FileText size={16} /> Scan an invoice</button>
              <button onClick={() => setShowList((v) => !v)} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><ClipboardList size={16} /> Paste a list</button>
              <button onClick={startNewBeer} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><Plus size={16} /> Add manually</button>
            </div>
            {showList && (
              <div className="mt-3">
                <textarea value={listText} onChange={(e) => setListText(e.target.value)} rows={6} placeholder={"Paste a delivery or price list, e.g.\n\nClark's cask\nOakham Citra 4.90\nTimothy Taylor Golden Best 4.30"} className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => importListText(listText)} disabled={scanning || !listText.trim()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ background: C.ink }}><Plus size={16} /> Add list</button>
                </div>
              </div>
            )}
            {scanning && <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> {scanProgress || "Reading… this can take a few seconds."}</p>}
            {scanError && <p className="mt-2 text-sm text-amber-700">{scanError}</p>}
          </div>
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Add from your library</p>
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
    const allergenSummary = [form.allergens.length ? form.allergens.join(", ") : "no allergens set", form.vegan ? "vegan" : null, form.glutenStatus !== "Standard" ? form.glutenStatus.toLowerCase() : null, form.allergensVerified ? "verified" : "unverified"].filter(Boolean).join(" · ");
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <button onClick={() => { setAddMode("pick"); setFillNote(null); }} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back to library</button>

        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <Field label="Type">
            <div className="flex gap-2">
              {DRINK_TYPES.map((t) => (
                <button key={t.key} onClick={() => setF({ drinkType: t.key, size: t.key === "cider" ? "Bag-in-box 20L" : t.key === "keg" ? "Keg 50L" : "" })}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                  style={form.drinkType === t.key ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{t.label}</button>
              ))}
            </div>
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Producer / brewery"><input className={inputCls} value={form.brewery} onChange={(e) => setF({ brewery: e.target.value })} placeholder="e.g. Wylam" /></Field>
            <Field label="Location"><input className={inputCls} value={form.location} onChange={(e) => setF({ location: e.target.value })} placeholder="e.g. Berwick-upon-Tweed" /></Field>
          </div>
          <div className="mt-3"><Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="e.g. Border Reiver IPA" /></Field></div>
          <button onClick={autoFill} disabled={loading} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ borderColor: C.brass, color: C.brass }}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Filling in…</> : <><Sparkles size={16} /> Auto-fill</>}
          </button>
          {fillNote && (
            <div className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-sm ${fillNote.type === "ai" || fillNote.type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : fillNote.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {fillNote.type === "loading" ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" /> : fillNote.type === "ai" || fillNote.type === "warn" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
              <span>{fillNote.text}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: C.line }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Style"><input className={inputCls} value={form.style} onChange={(e) => setF(form.drinkType === "cask" ? { style: e.target.value, category: categorise(e.target.value, form.abv) } : { style: e.target.value })} placeholder="e.g. IPA" /></Field>
            <Field label="ABV %"><input className={inputCls} value={form.abv} onChange={(e) => setF(form.drinkType === "cask" ? { abv: e.target.value, category: categorise(form.style, e.target.value) } : { abv: e.target.value })} placeholder="e.g. 5.4" /></Field>
          </div>
          {form.drinkType === "cask" && (
            <Field label="Category">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => setF({ category: cat })} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                    style={form.category === cat ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{cat}</button>
                ))}
              </div>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price (£)"><input className={inputCls} value={form.price} onChange={(e) => setF({ price: e.target.value })} placeholder="e.g. 4.40" /></Field>
            {form.drinkType !== "cask" && <Field label="Container"><select className={inputCls} value={form.size} onChange={(e) => setF({ size: e.target.value })}>{SIZE_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>}
          </div>
          <Field label="Supplied by"><input className={inputCls} value={form.caskOwner} onChange={(e) => setF({ caskOwner: e.target.value })} placeholder={form.brewery ? `Defaults to ${form.brewery}` : "Defaults to the brewery"} /></Field>
          <Field label="Best before">
            <input type="date" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" value={form.bestBefore} onChange={(e) => setF({ bestBefore: e.target.value })} />
          </Field>
          <Field label="Status"><select className={inputCls} value={form.status} onChange={(e) => setF({ status: e.target.value })}>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        </div>

        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <button onClick={() => setShowMore((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <span className="min-w-0">
              <span className="block text-sm font-medium" style={{ color: C.ink }}>More details</span>
              <span className="block truncate text-xs text-slate-500">{allergenSummary}</span>
            </span>
            <ChevronDown size={18} className={showMore ? "shrink-0 rotate-180 text-slate-500" : "shrink-0 text-slate-500"} />
          </button>
          {showMore && (
            <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: C.line }}>
              <Field label="Clarity">
                <div className="flex gap-2">
                  {CLARITY_OPTIONS.map((c) => (
                    <button key={c} onClick={() => setF({ clarity: c })} className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                      style={form.clarity === c ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{c}</button>
                  ))}
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Gluten status"><select className={inputCls} value={form.glutenStatus} onChange={(e) => setF({ glutenStatus: e.target.value })}>{GLUTEN_OPTIONS.map((g) => <option key={g}>{g}</option>)}</select></Field>
                <Field label="Vegan"><button onClick={() => setF({ vegan: !form.vegan })} className={`w-full rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 ${form.vegan ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}>{form.vegan ? "Vegan friendly" : "Not vegan / unknown"}</button></Field>
              </div>
              <Field label="Allergens">
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_OPTIONS.map((a) => (
                    <button key={a} onClick={() => toggleAllergen(a)} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                      style={form.allergens.includes(a) ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{a}</button>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-sm"><input type="checkbox" checked={form.allergensVerified} onChange={(e) => setF({ allergensVerified: e.target.checked })} className="h-4 w-4" /><span className="text-slate-700">Allergens verified against the producer's own information</span></label>
              <Field label="Tasting notes"><textarea className={`${inputCls} h-20 resize-none`} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} placeholder="How would you describe this to a customer?" /></Field>
            </div>
          )}
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
    const justAddedBeers = library.filter((b) => b.justAdded);
    const results = q ? library.filter(match) : [];
    const rest = library.filter((b) => !b.justAdded).slice().sort((a, b) => {
      if (a.allergensVerified !== b.allergensVerified) return a.allergensVerified ? 1 : -1;
      return (a.brewery || "").localeCompare(b.brewery || "") || (a.name || "").localeCompare(b.name || "");
    });
    const histChrono = (b) => (b.history || []).slice().sort((x, y) => new Date(x.date) - new Date(y.date));
    const libRow = (b) => {
      const h = histChrono(b);
      const open = !!historyOpen[b.id];
      return (
        <div key={b.id} className="rounded-xl border bg-white p-2.5" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: CAT_ACCENT[b.category] || C.line }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{b.brewery ? `${b.brewery} - ` : ""}{b.name}</p>
              <p className="truncate text-xs font-medium text-slate-600">{b.style} · {b.abv}%{!b.allergensVerified ? " · not staff verified" : ""}</p>
              <p className="truncate text-xs text-slate-400">{b.location || ""}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => addLineOfBeer(b)} title="Add to cellar" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Plus size={13} /> Add</button>
              <button onClick={() => setEditBeerId(b.id)} title="Edit details" className="rounded-lg border p-1.5 text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Pencil size={14} /></button>
              <button onClick={() => setHistoryOpen((m) => ({ ...m, [b.id]: !m[b.id] }))} title="Price & ABV history" className="inline-flex items-center gap-0.5 rounded-lg border p-1.5 text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><History size={14} />{h.length ? <span className="text-xs font-medium">{h.length}</span> : null}</button>
            </div>
          </div>
          {open && (
            <div className="mt-2.5 rounded-lg border p-2.5" style={{ borderColor: C.line, background: "#FAFAF8" }}>
              {!h.length ? <p className="text-xs text-slate-400">No history yet.</p> : (
                <>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400"><span>When</span><span className="flex gap-4"><span>ABV</span><span>Price</span></span></div>
                  <ul className="space-y-1">
                    {h.map((e, i) => {
                      const prev = i > 0 ? h[i - 1] : null;
                      const pN = parseFloat(e.price), pP = prev ? parseFloat(prev.price) : NaN;
                      const aN = parseFloat(e.abv), aP = prev ? parseFloat(prev.abv) : NaN;
                      const priceCh = !isNaN(pP) && !isNaN(pN) && pN !== pP;
                      const abvCh = !isNaN(aP) && !isNaN(aN) && aN !== aP;
                      return (
                        <li key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{new Date(e.date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
                          <span className="flex items-center gap-4">
                            <span className={abvCh ? "font-semibold text-amber-700" : "text-slate-600"}>{e.abv || "--"}%</span>
                            <span className={priceCh ? (pN > pP ? "font-semibold text-red-600" : "font-semibold text-emerald-600") : "text-slate-600"}>£{e.price || "--"}{priceCh ? (pN > pP ? " ↑" : " ↓") : ""}</span>
                          </span>
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
            {justAddedBeers.length > 0 && (
              <div className="rounded-xl border p-3" style={{ borderColor: "#e2c98a", background: "#fffbeb" }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: "#92400e" }}>Just added · check details · {justAddedBeers.length}</p>
                  <button onClick={() => setLibrary((lib) => lib.map((b) => (b.justAdded ? { ...b, justAdded: false } : b)))} className="shrink-0 text-xs font-medium text-amber-800 hover:underline focus:outline-none">Mark all checked</button>
                </div>
                <div className="space-y-2">
                  {justAddedBeers.map((b) => (
                    <div key={b.id} className="rounded-lg border bg-white p-2.5" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: CAT_ACCENT[b.category] || C.line }}>
                      <p className="truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{b.brewery ? `${b.brewery} - ` : ""}{b.name}</p>
                      <p className="truncate text-xs font-medium text-slate-600">{b.style ? b.style : "--"}{b.abv ? ` · ${b.abv}%` : ""}{!b.allergensVerified ? " · not staff verified" : ""}</p>
                      <p className="truncate text-xs text-slate-400">{b.location || ""}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <button onClick={() => setEditBeerId(b.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none" style={{ borderColor: C.line }}><Pencil size={13} /> Check &amp; edit</button>
                        <button onClick={() => addLineOfBeer(b)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition hover:bg-amber-50 focus:outline-none" style={{ borderColor: C.brass, color: C.brass }}><Plus size={13} /> Add to cellar</button>
                        <button onClick={() => markChecked(b.id)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-white transition hover:opacity-90 focus:outline-none" style={{ background: "#3f7d4f" }}><Check size={13} /> Done</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-dashed bg-white p-6 text-center" style={{ borderColor: C.line }}>
              <Search size={22} className="mx-auto mb-2 text-slate-300" />
              <p className="font-semibold" style={{ color: C.ink }}>Search your library</p>
              <p className="mt-1 text-sm text-slate-500">{library.length} beer{library.length === 1 ? "" : "s"} saved. Type a name, brewery or style.</p>
            </div>
            {rest.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Library · unverified first</p>
                <div className="space-y-2">{rest.map(libRow)}</div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const Backup = () => {
    const taCls = `${inputCls} h-28 resize-none font-mono text-xs`;
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Export</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copyBackup} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Copy size={16} /> Copy backup</button>
            <button onClick={downloadBackup} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Download size={16} /> Download .json</button>
          </div>
          <textarea readOnly value={exportData()} className={`mt-3 ${taCls}`} onFocus={(e) => e.target.select()} />
        </div>

        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Import</h2>
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
      </div>
    );
  };

  const Empties = () => {
    const empties = lines.filter((l) => l.status === "off" && !l.collected && l.drinkType !== "cider" && l.drinkType !== "keykeg");
    const owners = [...new Set(empties.map((l) => l.caskOwner || "Unknown"))].sort((a, b) => {
      const diff = empties.filter((l) => (l.caskOwner || "Unknown") === b).length - empties.filter((l) => (l.caskOwner || "Unknown") === a).length;
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => go("cellar")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back</button>
        </div>
        {empties.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
            <Check className="mx-auto mb-2 text-emerald-600" />
            <p className="font-medium" style={{ color: C.ink }}>All clear</p>
            <p className="mt-1 text-sm text-slate-500">No empties waiting for collection.</p>
          </div>
        )}
        {owners.map((owner) => {
          const items = empties.filter((l) => (l.caskOwner || "Unknown") === owner);
          const open = !!prefs.empties[owner];
          return (
            <div key={owner} className="rounded-xl border bg-white" style={{ borderColor: C.line }}>
              <button onClick={() => setPrefs((p) => ({ ...p, empties: { ...p.empties, [owner]: !p.empties[owner] } }))} className="flex w-full items-center justify-between gap-2 p-3 text-left focus:outline-none">
                <p className="font-semibold" style={{ color: C.ink }}>{owner} <span className="text-sm font-normal text-slate-400">· {items.length}</span></p>
                <ChevronDown size={18} className="text-slate-400" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {open && (
                <ul className="space-y-1.5 px-3 pb-3">
                  {items.map((l) => {
                    const beer = beerById[l.beerId];
                    const dt = (DRINK_TYPES.find((t) => t.key === l.drinkType) || {}).label || l.drinkType;
                    return (
                      <li key={l.id} className="flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[l.drinkType] || C.line }}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer ? `${beer.brewery ? beer.brewery + " - " : ""}${beer.name}` : "Unknown"}</span>
                          {beer && <span className="block truncate text-xs font-medium text-slate-600">{dt}{beer.style ? ` · ${beer.style}` : ""}{beer.abv ? ` · ${beer.abv}%` : ""}</span>}
                          {beer && beer.location && <span className="block truncate text-xs text-slate-400">{beer.location}</span>}
                          <span className="block truncate text-xs text-slate-500">{l.size ? `${l.size} · ` : ""}finished {l.dates.off ? fmtDate(l.dates.off.slice(0, 10)) : "--"}</span>
                        </span>
                        <button onClick={() => markCollected(l.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={13} /> Collected</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const Insights = () => {
    const onNow = lines.filter((l) => l.status === "on");
    const completed = lines.filter((l) => l.dates.on && l.dates.off);
    const withName = completed.map((l) => ({ name: beerById[l.beerId]?.name || "Unknown", days: dayDiff(l.dates.on, l.dates.off) }));
    const lasted = withName.map((x) => x.days);
    const avgDays = lasted.length ? Math.round(lasted.reduce((a, b) => a + b, 0) / lasted.length) : null;
    const fastest = withName.length ? withName.reduce((a, b) => (b.days < a.days ? b : a)) : null;
    const slowest = withName.length ? withName.reduce((a, b) => (b.days > a.days ? b : a)) : null;
    const caskOn = onNow.filter((l) => l.drinkType === "cask");
    const catCounts = CATEGORIES.map((cat) => ({ cat, n: caskOn.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).length })).filter((c) => c.n);
    const maxCat = Math.max(1, ...catCounts.map((c) => c.n));
    const Stat = ({ label, value, sub }) => (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    );
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="On now" value={onNow.length} />
          <Stat label="Avg days a cask lasts" value={avgDays == null ? "--" : avgDays} sub={lasted.length ? `from ${lasted.length} finished` : "no finished casks yet"} />
          <Stat label="In the library" value={library.length} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-xs uppercase tracking-wide text-slate-400">Fastest to go</p>
            {fastest ? <p className="mt-1 text-sm" style={{ color: C.ink }}><span className="font-semibold">{fastest.name}</span> · {fastest.days} day{fastest.days === 1 ? "" : "s"}</p> : <p className="mt-1 text-sm text-slate-400">No finished casks yet.</p>}
          </div>
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-xs uppercase tracking-wide text-slate-400">Slowest to go</p>
            {slowest ? <p className="mt-1 text-sm" style={{ color: C.ink }}><span className="font-semibold">{slowest.name}</span> · {slowest.days} day{slowest.days === 1 ? "" : "s"}</p> : <p className="mt-1 text-sm text-slate-400">No finished casks yet.</p>}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Cask ale on now, by category</p>
          {catCounts.length === 0 ? <p className="text-sm text-slate-400">No cask ale on right now.</p> : (
            <div className="space-y-2">
              {catCounts.map((c) => (
                <div key={c.cat} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-slate-600">{c.cat}</span>
                  <span className="h-4 rounded" style={{ width: `${(c.n / maxCat) * 100}%`, minWidth: "8px", background: C.brass }} />
                  <span className="text-xs text-slate-500">{c.n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Printer size={15} /> Print</button>
        </div>
        <div id="allergen-sheet" className="rounded-xl border bg-white p-5" style={{ borderColor: C.line }}>
          <h1 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>What's on: allergen and dietary guide</h1>
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
                  const diet = [beer.vegan ? "Vegan" : null, beer.glutenStatus === "Gluten-free" ? "Gluten-free" : beer.glutenStatus === "Low gluten" ? "Low gluten" : null].filter(Boolean).join(", ");
                  return (
                    <div key={l.id} className="py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium" style={{ color: C.ink }}>{beer.name}</span>
                        <span className="text-xs text-slate-500">{beer.brewery} · {beer.abv}%</span>
                      </div>
                      <p className="text-xs text-slate-600">{diet ? diet + " · " : ""}{beer.allergensVerified ? (beer.allergens.length ? "Contains: " + beer.allergens.join(", ") : "No declared allergens") : "Allergens: please ask staff"}</p>
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
        <div className="flex items-start justify-between gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</p>
            <p className="truncate text-xs font-medium text-slate-600">{dt} · {beer.style} · {beer.abv}%</p>
            <p className="truncate text-xs text-slate-400">{beer.location || ""}{l.caskOwner ? `${beer.location ? " · " : ""}Supplier: ${l.caskOwner}` : ""}</p>
          </div>
          <div className="shrink-0 text-right">
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
          <button onClick={sharePDF} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line, color: C.ink }}>{pdfBusy ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />} Share PDF</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Printer size={15} /> Print</button>
        </div>
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: C.line }}>
          <h1 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Stock List</h1>
          {fmtUpdated(lastUpdated) && <p className="mt-0.5 text-xs text-slate-400">Last updated: {fmtUpdated(lastUpdated)}</p>}
          {total === 0 && <p className="mt-4 text-sm text-slate-400">No stock yet.</p>}
          <Section title="On" items={onL} withStage={false} />
          <Section title="In Cellar" items={prep} withStage={true} />
          {storeL.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.brass }}>In store · {storeL.length}</h3>
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
          {(() => {
            const empties = lines.filter((l) => l.status === "off" && !l.collected && l.drinkType !== "cider" && l.drinkType !== "keykeg");
            if (!empties.length) return null;
            const owners = [...new Set(empties.map((l) => l.caskOwner || "Unknown"))].sort((a, b) => {
              const diff = empties.filter((l) => (l.caskOwner || "Unknown") === b).length - empties.filter((l) => (l.caskOwner || "Unknown") === a).length;
              return diff !== 0 ? diff : a.localeCompare(b);
            });
            return (
              <div className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.brass }}>Empties · {empties.length}</h3>
                {owners.map((owner) => (
                  <div key={owner} className="mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{owner}</p>
                    {empties.filter((l) => (l.caskOwner || "Unknown") === owner).map((l) => <Row key={l.id} l={l} stage={null} />)}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };
  const TapList = () => {
    const on = lines.filter((l) => l.status === "on");
    const soon = lines.filter((l) => ["tapped", "vented", "in_cellar"].includes(l.status));
    const cask = on.filter((l) => l.drinkType === "cask");
    const keg = on.filter((l) => l.drinkType === "keg").sort(byBB);
    const cider = on.filter((l) => l.drinkType === "cider").sort(byBB);
    const caskByCat = CATEGORIES.map((cat) => ({ cat, items: cask.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).sort(byBB) })).filter((g) => g.items.length);
    const faint = "rgba(243,239,230,0.55)";

    const Item = ({ line }) => {
      const beer = beerById[line.beerId];
      if (!beer) return null;
      const tlp = priceTriple(line.price);
      const diet = [];
      if (beer.vegan) diet.push("Vegan");
      if (beer.glutenStatus === "Gluten-free") diet.push("Gluten-free");
      else if (beer.glutenStatus === "Low gluten") diet.push("Low gluten");
      return (
        <div className="py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</p>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold" style={{ color: C.brassSoft, fontFamily: "Fraunces, Georgia, serif" }}>{tlp ? tlp.pint : `£${line.price || "--"}`}</p>
              {tlp && <p className="text-xs" style={{ color: "rgba(243,239,230,0.55)" }}>Half {tlp.half} · Schooner {tlp.schooner}</p>}
            </div>
          </div>
          <p className="text-sm font-medium" style={{ color: "rgba(243,239,230,0.85)" }}>{beer.style} · {beer.abv}%{beer.clarity ? ` · ${beer.clarity}` : ""}</p>
          {beer.location && <p className="text-xs" style={{ color: "rgba(243,239,230,0.5)" }}>{beer.location}</p>}
          {beer.notes && <p className="mt-1 text-sm italic" style={{ color: faint }}>{beer.notes}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {diet.map((d) => <span key={d} className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.brassSoft }}>{d}</span>)}
            <span className="text-xs" style={{ color: "rgba(243,239,230,0.45)" }}>{beer.allergensVerified ? (beer.allergens.length ? `Contains: ${beer.allergens.join(", ")}` : "No declared allergens") : "Allergens: please ask at the bar"}</span>
          </div>
        </div>
      );
    };

    return (
      <div className="min-h-screen" style={{ background: C.ink }}>
        <div className="mx-auto max-w-2xl px-5 py-8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full" style={{ background: C.brass, color: C.ink }}><Bell size={22} /></div>
              <div>
                <p className="text-2xl font-semibold leading-tight" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>The Curfew</p>
                <p className="text-xs uppercase tracking-widest" style={{ color: C.brassSoft }}>What's on today</p>
              </div>
            </div>
            <button onClick={() => go("cellar")} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: C.brass, color: C.brassSoft }}>Exit preview</button>
          </div>
          {fmtUpdated(lastUpdated) && <p className="mt-3 text-xs" style={{ color: "rgba(243,239,230,0.5)" }}>Last updated: {fmtUpdated(lastUpdated)}</p>}

          <div className="mt-8">
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
    const candStatuses = isCask ? ["tapped", "vented", "racked"] : ["in_cellar"];
    const statusRank = { tapped: 0, vented: 1, racked: 2, in_cellar: 3 };
    const dateForStatus = (l) => l.status === "tapped" ? l.dates.tapped : l.status === "vented" ? l.dates.vented : l.status === "racked" ? l.dates.racked : l.dates.delivered;
    const pool = lines.filter((l) => l.drinkType === swap.drink && candStatuses.includes(l.status));
    const matching = allowedCats ? pool.filter((l) => allowedCats.includes(beerById[l.beerId]?.category || "Misc")) : pool;
    const base = matching.length ? matching : pool;
    const list = base.slice().sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || ((dateForStatus(a) || "").localeCompare(dateForStatus(b) || "")));
    const groupDefs = isCask ? [["tapped", "Tapped and Ready"], ["vented", "Vented"], ["racked", "Racked"]] : [["in_cellar", "Ready to go on"]];
    const groups = groupDefs.map(([k, label]) => ({ k, label, items: list.filter((l) => l.status === k) })).filter((g) => g.items.length);
    const emptyMsg = isCask ? "Nothing racked, vented or tapped yet. Rack and vent a cask to get one ready." : `Nothing in the store to put on. Add ${swap.drink === "keg" ? "a keg" : "a cider"} first.`;
    const previewLine = swapPreviewId ? lines.find((l) => l.id === swapPreviewId) : null;
    const previewBeer = previewLine ? beerById[previewLine.beerId] : null;
    const pmeta = previewBeer ? [DRINK_TYPES.find((t) => t.key === previewLine.drinkType)?.label, previewBeer.style, `${previewBeer.abv}%`, `£${previewLine.price || "--"}`, previewLine.size ? previewLine.size.replace("Bag-in-box ", "").replace("Keg ", "") : ""].filter(Boolean).join("  ·  ") : "";
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(27,34,48,0.45)" }} onClick={close}>
        <div className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
          {previewBeer ? (
            <>
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
                <button onClick={() => setSwapPreviewId(null)} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-700 focus:outline-none"><ArrowRight size={15} className="rotate-180" /> Back</button>
                <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{previewBeer.name}</h2>
                  <p className="text-sm text-slate-500">{previewBeer.brewery} · {previewBeer.location}</p>
                </div>
                <div className="space-y-2.5">
                  <p className="text-base font-medium text-slate-700">{pmeta}</p>
                  <DietaryBadges beer={previewBeer} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-500">Allergens</p>
                  {previewBeer.allergens.length ? <div className="flex flex-wrap gap-1.5">{previewBeer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
                  {!previewBeer.allergensVerified ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                      <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not staff verified yet</span>
                      <button onClick={() => verify(previewBeer.id)} className="shrink-0 rounded-md bg-amber-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-900">Verify</button>
                    </div>
                  ) : <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Verified by staff</p>}
                </div>
                {previewBeer.notes && <div><p className="mb-2 text-sm font-medium text-slate-500">Tasting notes</p><p className="text-sm leading-relaxed text-slate-600">{previewBeer.notes}</p></div>}
              </div>
              <div className="sticky bottom-0 border-t bg-white p-4" style={{ borderColor: C.line }}>
                <button onClick={() => doSwap(previewLine.id, swap.oldId, swap.slot)} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Check size={16} /> Put on</button>
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Choose next</h2>
                  {catLabel && <p className="truncate text-xs text-slate-500">{matching.length ? catLabel : `No ${catLabel} ready, showing all casks`}</p>}
                </div>
                <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {groups.length ? groups.map((g) => (
                  <div key={g.k} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                    {g.items.map((l) => {
                      const beer = beerById[l.beerId];
                      if (!beer) return null;
                      const when = dateForStatus(l);
                      return (
                        <button key={l.id} onClick={() => setSwapPreviewId(l.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border bg-white p-3 text-left transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ borderColor: C.line, borderLeftWidth: 3, borderLeftColor: TYPE_ACCENT[swap.drink] || C.line }}>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</span>
                            <span className="block truncate text-sm font-medium text-slate-600">{beer.style} · {beer.abv}%</span>
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
    const close = () => { setEditBeerId(null); setEditNote(null); };
    const chip = (on) => (on ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft });
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(27,34,48,0.45)" }} onClick={close}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Edit beer details</h2>
            <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
          </div>
          <div className="space-y-3 p-4">
            <button onClick={() => autoFillBeer(beer)} disabled={editBusy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 active:scale-95 disabled:opacity-60" style={{ borderColor: C.brass, color: C.brass }}>
              {editBusy ? <><Loader2 size={16} className="animate-spin" /> Filling in…</> : <><Sparkles size={16} /> Auto-fill</>}
            </button>
            {editNote && (
              <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${editNote.type === "ai" || editNote.type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : editNote.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {editNote.type === "loading" ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" /> : editNote.type === "ai" || editNote.type === "warn" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
                <span>{editNote.text}</span>
              </div>
            )}
            <Field label="Name"><input className={inputCls} value={beer.name} onChange={(e) => updateBeer(beer.id, { name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Producer / brewery"><input className={inputCls} value={beer.brewery} onChange={(e) => updateBeer(beer.id, { brewery: e.target.value })} /></Field>
              <Field label="Location"><input className={inputCls} value={beer.location || ""} onChange={(e) => updateBeer(beer.id, { location: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Style"><input className={inputCls} value={beer.style || ""} onChange={(e) => updateBeer(beer.id, { style: e.target.value })} /></Field>
              <Field label="ABV %"><input className={inputCls} value={beer.abv || ""} onChange={(e) => updateBeer(beer.id, { abv: e.target.value })} /></Field>
            </div>
            <Field label="Price (£ per pint)"><input className={inputCls} inputMode="decimal" value={beer.price || ""} onChange={(e) => updateBeerPrice(beer.id, e.target.value)} placeholder="e.g. 4.40" /></Field>
            <Field label="Category">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => updateBeer(beer.id, { category: cat })} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip((beer.category || "Misc") === cat)}>{cat}</button>
                ))}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Clarity"><select className={inputCls} value={beer.clarity || "Clear"} onChange={(e) => updateBeer(beer.id, { clarity: e.target.value })}>{CLARITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>
              <Field label="Gluten"><select className={inputCls} value={beer.glutenStatus || "Standard"} onChange={(e) => updateBeer(beer.id, { glutenStatus: e.target.value })}>{GLUTEN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>
            </div>
            <button onClick={() => updateBeer(beer.id, { vegan: !beer.vegan })} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(!!beer.vegan)}>{beer.vegan ? <Check size={15} /> : null} Vegan</button>
            <Field label="Allergens">
              <div className="flex flex-wrap gap-2">
                {ALLERGEN_OPTIONS.map((a) => (
                  <button key={a} onClick={() => toggleBeerAllergen(beer.id, a)} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(beer.allergens.includes(a))}>{a}</button>
                ))}
              </div>
            </Field>
            <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5" style={{ borderColor: C.line }}>
              <span className="text-sm text-slate-600">Allergens verified by staff</span>
              <button onClick={() => updateBeer(beer.id, { allergensVerified: !beer.allergensVerified })} className="rounded-md border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(!!beer.allergensVerified)}>{beer.allergensVerified ? "Verified" : "Verify"}</button>
            </div>
            <Field label="Tasting notes"><textarea className={inputCls} rows={3} value={beer.notes || ""} onChange={(e) => updateBeer(beer.id, { notes: e.target.value })} /></Field>
            <button onClick={close} className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}>Done</button>
          </div>
        </div>
      </div>
    );
  };

  const CardModal = () => {
    if (!openLine) return null;
    const beer = beerById[openLine.beerId];
    const f = freshness(openLine);
    const bb = bbStatus(openLine);
    const flow = flowFor(openLine.drinkType);
    const stageIdx = flow.indexOf(openLine.status);
    const alert = (f && openLine.status === "on" && f.level === "check") ? { cls: FRESH_STYLE.check, Icon: Clock, text: f.text } : null;
    const AlertIcon = alert ? alert.Icon : null;
    const bbCls = bb && bb.level === "past" ? "text-red-700" : bb && bb.level === "soon" ? "text-amber-700" : "text-slate-700";
    const sizeShort = openLine.size ? openLine.size.replace("Bag-in-box ", "").replace("Keg ", "") : "";
    const meta = [DRINK_TYPES.find((t) => t.key === openLine.drinkType)?.label, beer.style, `${beer.abv}%`, sizeShort].filter(Boolean).join("  ·  ");
    const measures = priceTriple(openLine.price);
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(27,34,48,0.45)" }} onClick={() => setOpenId(null)}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 flex items-start justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
            <div>
              <h2 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer.brewery ? `${beer.brewery} - ` : ""}{beer.name}</h2>
              <p className="text-sm text-slate-500">{beer.location || ""}</p>
            </div>
            <button onClick={() => setOpenId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-2.5">
              <p className="text-base font-medium text-slate-700">{meta}</p>
              {measures && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span className="text-slate-700"><span className="text-slate-400">Pint</span> {measures.pint}</span>
                  <span className="text-slate-700"><span className="text-slate-400">Half</span> {measures.half}</span>
                  <span className="text-slate-700"><span className="text-slate-400">Schooner</span> {measures.schooner}</span>
                </div>
              )}
              <DietaryBadges beer={beer} />
              {openLine.bestBefore && <p className={`text-sm font-medium ${bbCls}`}>Best before {fmtDate(openLine.bestBefore)}{bb && bb.level === "past" ? " · passed" : ""}</p>}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-500">Allergens</p>
              {beer.allergens.length ? <div className="flex flex-wrap gap-1.5">{beer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
              {!beer.allergensVerified ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                  <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not staff verified yet</span>
                  <button onClick={() => verify(beer.id)} className="shrink-0 rounded-md bg-amber-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-900">Verify</button>
                </div>
              ) : <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Verified by staff</p>}
            </div>

            {beer.notes && <div><p className="mb-2 text-sm font-medium text-slate-500">Tasting notes</p><p className="text-sm leading-relaxed text-slate-600">{beer.notes}</p></div>}

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
                {stageIdx > 0 && <button onClick={() => goBack(openLine.id)} className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><ArrowRight size={15} className="rotate-180" /> Back</button>}
                {openLine.status === "on"
                  ? <button onClick={() => finishAndChoose(openLine)} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Check size={16} /> Line finished</button>
                  : stageIdx < flow.length - 1
                    ? <button onClick={() => advance(openLine.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}>Advance to {flow[stageIdx + 1] === "tapped" ? "Tapped" : STATUS_BY_KEY[flow[stageIdx + 1]].label} <ArrowRight size={15} /></button>
                    : null}
              </div>
              {openLine.status === "off" && openLine.drinkType !== "cider" && openLine.drinkType !== "keykeg" && (openLine.collected
                ? <p className="mt-2.5 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Empty collected</p>
                : <button onClick={() => markCollected(openLine.id)} className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={15} /> Mark empty collected</button>)}
              <button onClick={() => setLineDetails((v) => !v)} className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-700"><ChevronDown size={14} style={{ transform: lineDetails ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> Dates & supplier</button>
              {lineDetails && (
                <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: C.line }}>
                  <ol className="space-y-1.5">
                    {flow.map((key, i) => {
                      const s = STATUS_BY_KEY[key];
                      const done = i <= stageIdx;
                      return (
                        <li key={s.key} className="flex items-center justify-between text-sm">
                          <span className={`flex items-center gap-2 ${done ? "text-slate-800" : "text-slate-400"}`}>{done ? <CheckCircle2 size={15} className="text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}{s.label}</span>
                          <span className="text-xs text-slate-400">{fmt(openLine.dates[s.dateKey])}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="grid gap-2 border-t pt-3 sm:grid-cols-2" style={{ borderColor: C.line }}>
                    <label className="text-xs text-slate-500">Best before<input type="date" value={openLine.bestBefore || ""} onChange={(e) => setBestBefore(openLine.id, e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" /></label>
                    {openLine.dates.on && <label className="text-xs text-slate-500">On date<input type="date" value={openLine.dates.on.slice(0, 10)} onChange={(e) => setOnDate(openLine.id, e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" /></label>}
                  </div>
                  <label className="block text-xs text-slate-500">Supplied by<input value={openLine.caskOwner || ""} onChange={(e) => setCaskOwner(openLine.id, e.target.value)} placeholder="e.g. the brewery or distributor" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" /></label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: C.line }}>
              <button onClick={() => { setEditBeerId(beer.id); setOpenId(null); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"><Pencil size={15} /> Edit details</button>
              <button onClick={() => removeLine(openLine.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700"><Trash2 size={15} /> Remove</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (cloudMode && (authChecking || !authed || (!cloudReady && !cloudLoadError))) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6" style={{ background: C.ink }}>
        <div className="w-full max-w-xs">
          <div className="mb-6 text-center">
            <p className="text-2xl font-bold" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>The Curfew</p>
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
        <div className="w-full max-w-xs text-center">
          <AlertTriangle className="mx-auto mb-3" size={28} color={C.brassSoft} />
          <p className="text-lg font-semibold" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>Could not load the cellar</p>
          <p className="mt-2 text-sm" style={{ color: "rgba(243,239,230,0.7)" }}>Check your connection and try again. Editing stays paused until this loads, so nothing gets overwritten.</p>
          <button onClick={() => loadCellar()} className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold transition active:scale-95" style={{ background: C.brass, color: C.ink }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ background: "linear-gradient(180deg, #EFEDE7 0%, #E8E7E2 60%)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap');
html, body { overflow-x: hidden; width: 100%; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { touch-action: manipulation; overscroll-behavior-y: contain; }
@media (max-width: 640px) { input, select, textarea { font-size: 16px !important; } }
@media print { .no-print { display: none !important; } body { background: #fff; } }
.cc-fade{animation:ccfade .28s ease both}
@keyframes ccfade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.cc-overlay{animation:ccov .2s ease both}
@keyframes ccov{from{opacity:0}to{opacity:1}}
.cc-pop{animation:ccpop .28s cubic-bezier(.16,1,.3,1) both}
@keyframes ccpop{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
.cc-sheet{animation:ccsheet .3s cubic-bezier(.16,1,.3,1) both}
@keyframes ccsheet{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion: reduce){.cc-fade,.cc-overlay,.cc-pop,.cc-sheet{animation:none}}`}</style>
      {view === "taplist" ? TapList() : (<>
      <header className="no-print sticky top-0 z-40 border-b" style={{ background: C.ink, borderColor: "rgba(169,121,31,0.35)", boxShadow: "0 1px 0 rgba(169,121,31,0.22), 0 10px 26px -18px rgba(0,0,0,0.65)" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full" style={{ background: C.brass, color: C.ink }}><Bell size={20} /></div>
            <div>
              <p className="text-lg font-semibold leading-tight" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>The Curfew</p>
              <p className="text-xs uppercase tracking-widest leading-tight" style={{ color: C.brassSoft }}>Micropub cellar management</p>
            </div>
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
                  {[["library", "Library", BookOpen], ["stock", "Stock List", Beer], ["allergens", "Allergen Sheet", FileText], ["taplist", "Customer Tap List", QrCode], ["backup", "Backup", Database]].map(([id, label, Icon]) => (
                    <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Icon size={15} className="text-slate-400" />{label}</button>
                  ))}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-28 sm:pb-6">
        {!hydrated ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading your cellar…</div>
        ) : (
          <>
            {VIEW_TITLES[view] && (
              <div className="no-print mb-5">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{VIEW_TITLES[view]}</h1>
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

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-white sm:hidden" style={{ borderColor: C.line, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -6px 22px -14px rgba(27,34,48,0.4)" }}>
        <div className="mx-auto flex max-w-md items-end justify-around px-2">
          <BottomTab id="cellar" icon={ClipboardList} label="Cellar" />
          <BottomTab id="library" icon={BookOpen} label="Library" />
          <button onClick={() => go("add")} className="flex flex-1 flex-col items-center justify-center transition active:scale-95 focus:outline-none">
            <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full" style={{ background: C.brass, color: C.ink, boxShadow: "0 6px 16px -6px rgba(169,121,31,0.65)" }}><Plus size={24} /></span>
            <span className="mt-0.5 text-xs font-medium" style={{ color: view === "add" ? C.brass : C.inkSoft }}>Add</span>
          </button>
          <BottomTab id="empties" icon={Package} label="Empties" />
          <BottomTab id="more" icon={MoreHorizontal} label="More" onClick={() => setMenuOpen(true)} />
        </div>
      </nav>

      {menuOpen && (
        <div className="no-print fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 cc-overlay" style={{ background: "rgba(27,34,48,0.45)" }} onClick={() => setMenuOpen(false)} />
          <div className="cc-sheet absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: C.line }} />
            <div className="grid grid-cols-3 gap-2.5">
              {[["stock", "Stock List", Beer], ["allergens", "Allergen Sheet", FileText], ["taplist", "Customer Tap List", QrCode], ["backup", "Backup", Database]].map(([id, label, Icon]) => (
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
