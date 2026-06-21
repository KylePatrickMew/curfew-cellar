import React, { useState, useMemo, useEffect, useRef } from "react";
// import { useCallback } from "react"; // might need later
import {
  Plus, ClipboardList, BookOpen, Beer, Sparkles, Check, CheckCircle2,
  AlertTriangle, Clock, X, ArrowRight, Trash2, Search, Loader2, Bell, Calendar, History, ChevronDown, Database, Download, Upload, Copy, QrCode, Camera, FileText, Package, MoreHorizontal, BarChart3, Pencil,
} from "lucide-react";

// ---------- Brand ----------
const C = {
  ink: "#1B2230", inkSoft: "#2B3445", brass: "#A9791F", brassSoft: "#C79A3E",
  stone: "#E8E7E2", surface: "#FCFBF9", line: "#DBD8D0", cream: "#F3EFE6",
};
const STORE_KEY = "curfew-cellar:data:v1";
const MODEL = "claude-sonnet-4-6";
const store = (typeof window !== "undefined" && window.localStorage) ? {
  get: async (k) => { const v = localStorage.getItem(k); return v == null ? null : { key: k, value: v }; },
  set: async (k, v) => { localStorage.setItem(k, v); return { key: k, value: v }; },
} : null;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- Reference data ----------
const STATUSES = [
  { key: "en_route", label: "En route", dateKey: "ordered" },
  { key: "in_cellar", label: "In cellar", dateKey: "delivered" },
  { key: "vented", label: "Vented", dateKey: "vented" },
  { key: "tapped", label: "Tapped", dateKey: "tapped" },
  { key: "on", label: "On", dateKey: "on" },
  { key: "off", label: "Off", dateKey: "off" },
];
const STATUS_INDEX = Object.fromEntries(STATUSES.map((s, i) => [s.key, i]));
const STATUS_STYLE = {
  en_route: "bg-slate-100 text-slate-600 border-slate-200",
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
  { key: "cider", label: "Draught cider" },
];
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
const VIEW_TITLES = { cellar: "Cellar", add: "Add stock", library: "Library", insights: "Insights", allergens: "Allergen sheet", distributors: "Distributors", empties: "Empties to return", backup: "Backup & restore" };
const SIZE_OPTIONS = ["Pin (4.5g)", "Firkin (9g)", "Kilderkin (18g)", "Keg 30L", "Keg 50L", "Bag-in-box 20L"];
const FRESH_LIMIT = 3; // days on a cask before a quality check is worth a look
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
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const fmtDate = (s) => { if (!s) return "—"; return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const dayDiff = (aIso, bIso) => { const a = new Date(aIso); a.setHours(0, 0, 0, 0); const b = new Date(bIso); b.setHours(0, 0, 0, 0); return Math.round((b - a) / DAY); };
const daysUntil = (dateStr) => { if (!dateStr) return null; const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(dateStr + "T00:00:00"); return Math.round((b - a) / DAY); };
const daysOn = (line) => { if (!line.dates.on) return null; return dayDiff(line.dates.on, line.dates.off || new Date().toISOString()); };

// quality nudge for cask only, never a hard "bin it"
const freshness = (line) => {
  if (line.drinkType !== "cask") return null;
  const d = daysOn(line);
  if (d === null) return null;
  if (line.status === "off") return { level: "off", text: `Lasted ${d} day${d === 1 ? "" : "s"}` };
  if (d < FRESH_LIMIT) return { level: "fresh", text: d === 0 ? "On today" : `On ${d} day${d === 1 ? "" : "s"}` };
  return { level: "check", text: `On ${d} days · check quality` };
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
  { id: "b1", brewery: "Tweedside Brewing", location: "Berwick-upon-Tweed", name: "Border Reiver IPA", style: "IPA", abv: "5.4", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Wheat (gluten)"], notes: "Big hazy IPA, mango and pine with a soft bitter finish.", allergensVerified: true, category: "IPA", history: [{ date: isoDaysAgo(120), abv: "5.2", price: "4.10" }, { date: isoDaysAgo(45), abv: "5.4", price: "4.20" }, { date: isoDaysAgo(2), abv: "5.4", price: "4.40" }] },
  { id: "b2", brewery: "Cheviot Hills Brewery", location: "Wooler", name: "Curfew Bell Pale", style: "Pale Ale", abv: "4.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Crisp golden pale, grapefruit and a clean dry finish.", allergensVerified: true, category: "Pale", history: [{ date: isoDaysAgo(200), abv: "3.9", price: "3.50" }, { date: isoDaysAgo(60), abv: "4.0", price: "3.70" }, { date: isoDaysAgo(4), abv: "4.0", price: "3.80" }] },
  { id: "b3", brewery: "Alnwick Ales", location: "Alnwick", name: "Old Wall Bitter", style: "Best Bitter", abv: "3.8", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: ["Barley (gluten)", "Fish (isinglass finings)"], notes: "Classic amber bitter, biscuit malt and earthy hops.", allergensVerified: false, category: "Bitter" },
  { id: "b4", brewery: "Lindisfarne Craft", location: "Holy Island", name: "Lighthouse Porter", style: "Porter", abv: "5.0", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Smooth dark porter, roasted coffee and dark chocolate.", allergensVerified: true, category: "Stout/Porter" },
  { id: "b5", brewery: "Borderlands Brew Co", location: "Coldstream", name: "Ramparts Lager", style: "Lager", abv: "4.6", clarity: "Clear", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)"], notes: "Crisp clean lager, light bready malt and gentle bitterness.", allergensVerified: true, category: "Misc" },
  { id: "b6", brewery: "Tweedside Brewing", location: "Berwick-upon-Tweed", name: "Tweed Haze", style: "IPA", abv: "5.8", clarity: "Hazy", glutenStatus: "Standard", vegan: true, allergens: ["Barley (gluten)", "Oats (gluten)"], notes: "Keg hazy IPA, juicy stone fruit, low bitterness.", allergensVerified: true, category: "IPA" },
  { id: "b7", brewery: "Yard Press", location: "Berwick-upon-Tweed", name: "Courtyard Medium", style: "Medium", abv: "5.2", clarity: "Clear", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Traditional medium cider, crisp apple with light tannin.", allergensVerified: true, category: "Misc" },
  { id: "b8", brewery: "Border Orchard", location: "Kelso", name: "Scrumpy Dry", style: "Dry", abv: "6.0", clarity: "Cloudy", glutenStatus: "Gluten-free", vegan: true, allergens: ["Sulphites"], notes: "Full, dry farmhouse scrumpy with a sharp finish.", allergensVerified: true, category: "Misc" },
];
const seedLines = [
  { id: "l1", beerId: "b1", drinkType: "cask", size: "Firkin (9g)", price: "4.40", status: "on", caskOwner: "Tweedside Brewing", collected: false, bestBefore: dateInDays(4), dates: { ordered: isoDaysAgo(6), delivered: isoDaysAgo(4), vented: isoDaysAgo(3), tapped: isoDaysAgo(2), on: isoDaysAgo(2), off: null } },
  { id: "l2", beerId: "b2", drinkType: "cask", size: "Firkin (9g)", price: "3.80", status: "on", caskOwner: "Cheviot Hills Brewery", collected: false, bestBefore: dateInDays(1), dates: { ordered: isoDaysAgo(7), delivered: isoDaysAgo(5), vented: isoDaysAgo(4), tapped: isoDaysAgo(4), on: isoDaysAgo(4), off: null } },
  { id: "l3", beerId: "b3", drinkType: "cask", size: "Pin (4.5g)", price: "3.70", status: "tapped", caskOwner: "Borders Beer Distribution", collected: false, bestBefore: dateInDays(-1), dates: { ordered: isoDaysAgo(3), delivered: isoDaysAgo(1), vented: isoDaysAgo(0), tapped: isoDaysAgo(0), on: null, off: null } },
  { id: "l4", beerId: "b4", drinkType: "cask", size: "Firkin (9g)", price: "4.30", status: "in_cellar", caskOwner: "Lindisfarne Craft", collected: false, bestBefore: dateInDays(12), dates: { ordered: isoDaysAgo(1), delivered: isoDaysAgo(0), vented: null, tapped: null, on: null, off: null } },
  { id: "l5", beerId: "b5", drinkType: "keg", size: "Keg 50L", price: "4.80", status: "on", caskOwner: "Borderlands Brew Co", collected: false, bestBefore: dateInDays(40), dates: { ordered: isoDaysAgo(5), delivered: isoDaysAgo(3), vented: null, tapped: isoDaysAgo(2), on: isoDaysAgo(2), off: null } },
  { id: "l6", beerId: "b6", drinkType: "keg", size: "Keg 30L", price: "5.20", status: "en_route", caskOwner: "Tweedside Brewing", collected: false, bestBefore: "", dates: { ordered: isoDaysAgo(0), delivered: null, vented: null, tapped: null, on: null, off: null } },
  { id: "l7", beerId: "b7", drinkType: "cider", size: "Bag-in-box 20L", price: "4.60", status: "on", caskOwner: "Yard Press", collected: false, bestBefore: dateInDays(18), dates: { ordered: isoDaysAgo(4), delivered: isoDaysAgo(2), vented: null, tapped: isoDaysAgo(1), on: isoDaysAgo(1), off: null } },
  { id: "l8", beerId: "b8", drinkType: "cider", size: "Bag-in-box 20L", price: "4.70", status: "in_cellar", caskOwner: "Border Orchard", collected: false, bestBefore: dateInDays(25), dates: { ordered: isoDaysAgo(1), delivered: isoDaysAgo(0), vented: null, tapped: null, on: null, off: null } },
  { id: "l9", beerId: "b1", drinkType: "cask", size: "Firkin (9g)", price: "4.40", status: "off", caskOwner: "Tweedside Brewing", collected: false, bestBefore: dateInDays(-2), dates: { ordered: isoDaysAgo(12), delivered: isoDaysAgo(10), vented: isoDaysAgo(9), tapped: isoDaysAgo(8), on: isoDaysAgo(8), off: isoDaysAgo(3) } },
  { id: "l10", beerId: "b3", drinkType: "cask", size: "Firkin (9g)", price: "3.70", status: "off", caskOwner: "Borders Beer Distribution", collected: false, bestBefore: dateInDays(-4), dates: { ordered: isoDaysAgo(14), delivered: isoDaysAgo(11), vented: isoDaysAgo(10), tapped: isoDaysAgo(9), on: isoDaysAgo(9), off: isoDaysAgo(2) } },
];

const seedDistributors = ["HB Clark & Co", "6B", "LWC"];

const emptyForm = {
  drinkType: "cask", brewery: "", location: "", name: "", style: "", abv: "",
  clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: [], notes: "",
  allergensVerified: false, category: "Misc", size: "Firkin (9g)", price: "",
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
  const [lines, setLines] = useState(seedLines);
  const [view, setView] = useState("cellar");
  const [form, setForm] = useState(emptyForm);
  const [fillNote, setFillNote] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [editBeerId, setEditBeerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [storageOk, setStorageOk] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
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

  // Load once on mount, with a timeout so a hanging store can't freeze the app
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!store) { if (!cancelled) { setStorageOk(false); setHydrated(true); } return; }
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1200));
      try {
        const r = await Promise.race([store.get(STORE_KEY, false), timeout]);
        if (!cancelled && r && r.value) {
          const data = JSON.parse(r.value);
          // console.log(data);
          if (Array.isArray(data.library)) setLibrary(data.library);
          if (Array.isArray(data.lines)) setLines(data.lines);
          if (Array.isArray(data.distributors)) setDistributors(data.distributors);
        }
        if (!cancelled) setStorageOk(true);
      } catch (e) {
        // missing key throws on a clean first run (fine); a timeout means storage is unusable here
        if (!cancelled) setStorageOk(!(e && e.message === "timeout"));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save whenever data changes, but only if storage actually responded on load
  useEffect(() => {
    if (!hydrated || !store || storageOk !== true) return;
    (async () => { try { await store.set(STORE_KEY, JSON.stringify({ library, lines, distributors }), false); } catch (e) { /* ignore */ } })();
  }, [library, lines, distributors, hydrated, storageOk]);

  const resetDemo = () => {
    setLibrary(clone(seedLibrary));
    setLines(clone(seedLines));
    setDistributors(clone(seedDistributors));
    setOpenId(null); setHistoryOpen({}); setLibrarySearch(""); setForm(emptyForm); setFillNote(null); setView("cellar"); setConfirmReset(false);
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
    if (!form.name.trim()) { setFillNote({ type: "warn", text: "Type a name first." }); return; }
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
  "location": "town or county the producer is based in, your best knowledge",
  "style": ${isCider ? '"Dry | Medium | Sweet | Perry"' : '"e.g. Pale Ale, IPA, Blonde, Best Bitter, Mild, Stout, Porter"'},
  "abv": "number as a string, e.g. 4.5",
  "clarity": "Clear | Hazy | Cloudy",
  "glutenStatus": "Standard | Low gluten | Gluten-free",
  "vegan": true or false,
  "allergens": ["choose ONLY from: ${ALLERGEN_OPTIONS.join(", ")}"],
  "notes": "one or two sentence tasting note for bar staff"
}

Rules: If unsure of the specific product, estimate from the name. Keep allergens conservative (most ales contain "Barley (gluten)"; most ciders contain "Sulphites"). Never assert a vegan or gluten-free claim you are unsure of: default vegan=false and glutenStatus="Standard" when uncertain (ciders are usually gluten-free). JSON only.`;
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
        location: p.location ? String(p.location) : form.location,
        clarity: CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : "Clear",
        glutenStatus: GLUTEN_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard",
        vegan: !!p.vegan, allergens, notes: p.notes ? String(p.notes) : "",
        allergensVerified: false,
        category: form.drinkType === "cask" ? categorise(style, abv) : form.category,
      });
      setFillNote({ type: "ai", text: "Draft filled in. Check everything, and confirm allergens and dietary status against the producer's own info before serving." });
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
    if (saved) { beerId = saved.id; setLibrary((lib) => lib.map((b) => (b.id === saved.id ? { ...b, ...beerFields, history: [...(b.history || []), entry] } : b))); }
    else { beerId = uid(); setLibrary((lib) => [...lib, { id: beerId, ...beerFields, history: [entry] }]); }
    const dates = { ordered: null, delivered: null, vented: null, tapped: null, on: null, off: null };
    dates[STATUSES[STATUS_INDEX[form.status]].dateKey] = new Date().toISOString();
    const id = uid();
    setLines((ls) => [...ls, { id, beerId, drinkType: form.drinkType, size: form.size, price: form.price.trim(), status: form.status, caskOwner: form.caskOwner.trim() || form.brewery.trim(), collected: false, bestBefore: form.bestBefore, dates }]);
    setForm(emptyForm); setFillNote(null); setAddMode("pick"); setShowMore(false); setView("cellar"); setOpenId(id);
  };

  const advance = (id) => setLines((ls) => ls.map((c) => {
    if (c.id !== id) return c;
    const idx = STATUS_INDEX[c.status];
    if (idx >= STATUSES.length - 1) return c;
    const next = STATUSES[idx + 1];
    const dates = { ...c.dates };
    if (!dates[next.dateKey]) dates[next.dateKey] = new Date().toISOString();
    return { ...c, status: next.key, dates };
  }));
  const setBestBefore = (id, v) => setLines((ls) => ls.map((c) => (c.id === id ? { ...c, bestBefore: v } : c)));
  const setLineCategory = (id, beerId, cat) => { setLibrary((lib) => lib.map((b) => (b.id === beerId ? { ...b, category: cat } : b))); };
  const setOnDate = (id, v) => setLines((ls) => ls.map((c) => { if (c.id !== id) return c; const d = new Date(v); d.setHours(12, 0, 0, 0); return { ...c, dates: { ...c.dates, on: d.toISOString() } }; }));
  const verify = (beerId) => setLibrary((lib) => lib.map((b) => (b.id === beerId ? { ...b, allergensVerified: true } : b)));
  const updateBeer = (id, patch) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const toggleBeerAllergen = (id, a) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, allergens: b.allergens.includes(a) ? b.allergens.filter((x) => x !== a) : [...b.allergens, a] } : b)));
  const removeLine = (id) => { snapshotUndo("Removed from cellar"); setLines((ls) => ls.filter((c) => c.id !== id)); setOpenId(null); };
  const latestPrice = (beer) => { const h = beer.history || []; return h.length ? h[h.length - 1].price : ""; };
  const loadBeerIntoForm = (beer) => setForm({ ...emptyForm, drinkType: "cask", brewery: beer.brewery, location: beer.location, name: beer.name, style: beer.style, abv: beer.abv, clarity: beer.clarity, glutenStatus: beer.glutenStatus, vegan: beer.vegan, allergens: beer.allergens, notes: beer.notes, allergensVerified: beer.allergensVerified, category: beer.category || categorise(beer.style, beer.abv), price: latestPrice(beer) });
  const pickBeer = (beer) => { loadBeerIntoForm(beer); setShowMore(false); setFillNote({ type: "ok", text: `Loaded "${beer.name}". Just set price, best before and status.` }); setAddMode("form"); };
  const startNewBeer = () => { setForm(emptyForm); setFillNote(null); setShowMore(false); setAddMode("form"); };
  const addLineOfBeer = (beer) => { loadBeerIntoForm(beer); setShowMore(false); setFillNote({ type: "ok", text: `Loaded "${beer.name}" from your library.` }); setAddMode("form"); setView("add"); };
  const go = (v) => { if (v === "add") { setAddMode("pick"); setAddPickSearch(""); setForm(emptyForm); setFillNote(null); setShowMore(false); } setView(v); };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.includes(",") ? s.split(",")[1] : s); };
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
  // scan output isn't always clean json, this is a bit rough but does the job
  const parseLooseJSON = (text) => { try { return JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim()); } catch { const m = text.match(/[\[{][\s\S]*[\]}]/); if (!m) throw new Error("no json"); return JSON.parse(m[0]); } };
  const visionCall = async (file, promptText, useSearch = false) => {
    const b64 = await fileToBase64(file);
    const isPdf = file.type === "application/pdf";
    const source = { type: "base64", media_type: isPdf ? "application/pdf" : (file.type || "image/jpeg"), data: b64 };
    const body = { model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: [{ type: isPdf ? "document" : "image", source }, { type: "text", text: promptText }] }] };
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
  const labelPrompt = `This image is a beer or cider pump clip, cask end, or bottle/can label. Read what's printed AND use your knowledge of this product (look it up if it helps) to complete the details accurately. Return STRICT JSON only:\n{"brewery": string, "location": "town or county the brewery is based in (use your knowledge if not printed)", "name": string, "kind": "beer"|"cider", "style": string, "abv": "number as string", "bestBefore": "best before date if printed, as YYYY-MM-DD, reading any dd/mm/yyyy in UK day-month order", "deliveredBy": "distributor or wholesaler named on the label, e.g. after 'To:', else empty", "clarity": "Clear|Hazy|Cloudy", "glutenStatus": "Standard|Low gluten|Gluten-free", "vegan": true|false, "allergens": [only from: ${ALLERGEN_OPTIONS.join(", ")}], "notes": "short tasting note"}\nIf a field isn't legible or known, estimate from the style, or use "" for text fields. Default vegan=false and glutenStatus="Standard" when unsure.${distHint} JSON only, no other text.`;
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
      const prompt = `This is a delivery invoice or delivery note from a brewery or drinks wholesaler. Extract every distinct beer or cider product line. Return STRICT JSON array only:\n[{"brewery": string, "name": string, "abv": "number as string or empty", "price": "unit price as string or empty", "deliveredBy": "distributor or wholesaler if named, else empty"}]\nIgnore totals, VAT, delivery charges and non-drink lines. If brewery isn't shown per line, infer it from the header.${distHint} JSON array only.`;
      const arr = parseLooseJSON(await visionCall(file, prompt));
      if (!Array.isArray(arr) || !arr.length) throw new Error("empty");
      setInvoiceItems(arr.map((x, i) => ({ id: "inv" + i, brewery: x.brewery ? String(x.brewery) : "", name: x.name ? String(x.name) : "", abv: x.abv != null ? String(x.abv) : "", price: x.price != null ? String(x.price) : "", caskOwner: x.deliveredBy ? String(x.deliveredBy) : "", drinkType: "cask", include: true })));
      setBatchSource("invoice"); setAddMode("invoice");
    } catch (e) {
      setScanError("Couldn't read that invoice. Try a clearer photo, or add items by hand.");
    } finally { setScanning(false); }
  };
  const updateInvoice = (idx, patch) => setInvoiceItems((items) => items.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const addDistributor = () => setDistributors((d) => [...d, ""]);
  const updateDistributor = (i, v) => setDistributors((d) => d.map((x, j) => (j === i ? v : x)));
  const removeDistributor = (i) => setDistributors((d) => d.filter((_, j) => j !== i));
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
    const enRoute = batchSource === "list";
    let lib = [...library];
    const newLines = [];
    chosen.forEach((x) => {
      const existing = lib.find((b) => b.brewery.trim().toLowerCase() === x.brewery.trim().toLowerCase() && b.name.trim().toLowerCase() === x.name.trim().toLowerCase());
      const entry = { date: nowIso, abv: x.abv, price: x.price };
      let beerId;
      if (existing) { beerId = existing.id; lib = lib.map((b) => (b.id === existing.id ? { ...b, abv: x.abv || b.abv, history: [...(b.history || []), entry] } : b)); }
      else { beerId = uid(); lib = [...lib, { id: beerId, brewery: x.brewery.trim(), location: x.location || "", name: x.name.trim(), style: x.style || "", abv: x.abv, clarity: x.clarity || "Clear", glutenStatus: x.glutenStatus || "Standard", vegan: x.vegan || false, allergens: x.allergens || [], notes: x.notes || "", allergensVerified: false, category: x.category || (x.drinkType === "cask" ? categorise(x.style || "", x.abv) : "Misc"), history: [entry] }]; }
      newLines.push({ id: uid(), beerId, drinkType: x.drinkType, size: x.drinkType === "cider" ? "Bag-in-box 20L" : x.drinkType === "keg" ? "Keg 50L" : "Firkin (9g)", price: x.price, status: enRoute ? "en_route" : "in_cellar", caskOwner: invoiceOwner.trim() || x.caskOwner || x.brewery.trim(), collected: false, bestBefore: x.bestBefore || "", dates: enRoute ? { ordered: nowIso, delivered: null, vented: null, tapped: null, on: null, off: null } : { ordered: null, delivered: nowIso, vented: null, tapped: null, on: null, off: null } });
    });
    setLibrary(lib); setLines((ls) => [...ls, ...newLines]);
    setInvoiceItems(null); setInvoiceOwner(""); setAddMode("pick"); setFillNote(null); setView("cellar");
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

  // ---------- Cards ----------
  const cardSignal = (line) => {
    const bb = bbStatus(line);
    const f = freshness(line);
    if (line.status === "off") return { text: "Off", warn: false };
    if (bb && bb.level === "past") return { text: "Best before passed", warn: true };
    if (bb && bb.level === "soon") return { text: bb.text, warn: false };
    if (line.status === "on" && f && f.level === "check") return { text: f.text, warn: false };
    if (line.status === "on") return { text: f ? f.text : "On", warn: false };
    return { text: STATUSES[STATUS_INDEX[line.status]].label, warn: false };
  };

  const LineRow = ({ line }) => {
    const beer = beerById[line.beerId];
    if (!beer) return null;
    const sig = cardSignal(line);
    return (
      <button onClick={() => setOpenId(line.id)} className="w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer.name}</p>
            <p className="truncate text-sm text-slate-500">{beer.brewery} · {beer.location}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-medium text-slate-700">{beer.style}</p>
            <p className="text-xs text-slate-500">{beer.abv}% · £{line.price || "—"}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge className={sig.warn ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100 text-slate-600 border-slate-200"}>{sig.text}</Badge>
          {!beer.allergensVerified && <span title="Allergens not verified" className="inline-flex items-center text-amber-600"><AlertTriangle size={14} /></span>}
          <span className="ml-auto"><DietaryMini beer={beer} /></span>
        </div>
      </button>
    );
  };

  const NavButton = ({ id, icon: Icon, label }) => {
    const active = view === id;
    return (
      <button onClick={() => go(id)} style={active ? { background: C.brass, color: C.ink } : { color: C.cream }}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${active ? "" : "hover:opacity-80"}`}>
        <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  const Cellar = () => {
    const live = lines.filter((l) => l.status !== "off");
    const empties = lines.filter((l) => l.status === "off" && !l.collected);
    const cask = live.filter((l) => l.drinkType === "cask");
    const keg = live.filter((l) => l.drinkType === "keg").sort(byBB);
    const cider = live.filter((l) => l.drinkType === "cider").sort(byBB);
    const caskByCat = CATEGORIES.map((cat) => ({ cat, items: cask.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).sort(byBB) })).filter((g) => g.items.length);

    if (!lines.length) {
      return (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
          <Bell className="mx-auto mb-2" style={{ color: C.brass }} />
          <p className="font-semibold" style={{ color: C.ink }}>The cellar's empty</p>
          <p className="mt-1 text-sm text-slate-500">Nothing in yet. Add your first cask to ring it in.</p>
          <button onClick={() => go("add")} className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90" style={{ background: C.ink }}><Plus size={16} /> Add a cask</button>
        </div>
      );
    }
    return (
      <div className="space-y-7">
        {!!cask.length && (
          <section>
            <h2 className="mb-3 text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Cask ale</h2>
            <div className="space-y-5">
              {caskByCat.map((g) => (
                <div key={g.cat}>
                  <Eyebrow count={g.items.length}><span className="inline-flex items-center gap-1.5"><Badge className={CAT_STYLE[g.cat]}>{g.cat}</Badge></span></Eyebrow>
                  <div className="grid gap-3 sm:grid-cols-2">{g.items.map((l) => <LineRow key={l.id} line={l} />)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {!!keg.length && (
          <section>
            <h2 className="mb-3 text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Keg</h2>
            <div className="grid gap-3 sm:grid-cols-2">{keg.map((l) => <LineRow key={l.id} line={l} />)}</div>
          </section>
        )}
        {!!cider.length && (
          <section>
            <h2 className="mb-3 text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Draught cider</h2>
            <div className="grid gap-3 sm:grid-cols-2">{cider.map((l) => <LineRow key={l.id} line={l} />)}</div>
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
            <p className="mt-1 text-sm text-slate-500">{batchSource === "labels" ? "Read from your photos. Untick any you don't want, tweak as needed, then add. They arrive as \"In cellar\". Allergens and full details stay unverified until you confirm them." : batchSource === "list" ? "Read from your list. Anything already saved reuses its details; the rest were looked up. Untick any you don't want, then add. They go in as \"En route\". Check details and allergens before serving." : "Pulled from your invoice. Untick anything that isn't a cask line, tweak as needed, then add. They arrive as \"In cellar\". Allergens and full details stay unverified until you confirm them."}</p>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700">Delivered by (who collects the empties)</label>
              <input value={invoiceOwner} onChange={(e) => setInvoiceOwner(e.target.value)} placeholder="Leave blank to use each beer's brewery" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
            </div>
            <div className="mt-3 space-y-2">
              {items.length === 0 && <p className="py-3 text-center text-sm text-slate-400">Nothing found.</p>}
              {items.map((x, idx) => (
                <div key={x.id} className="rounded-lg border p-2.5" style={{ borderColor: C.line }}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={x.include} onChange={(e) => updateInvoice(idx, { include: e.target.checked })} className="h-4 w-4" />
                    <input value={x.name} onChange={(e) => updateInvoice(idx, { name: e.target.value })} placeholder="Name" className={cellChk} style={{ borderColor: C.line }} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input value={x.brewery} onChange={(e) => updateInvoice(idx, { brewery: e.target.value })} placeholder="Brewery" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <input value={x.abv} onChange={(e) => updateInvoice(idx, { abv: e.target.value })} placeholder="ABV %" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <input value={x.price} onChange={(e) => updateInvoice(idx, { price: e.target.value })} placeholder="£ price" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <select value={x.drinkType} onChange={(e) => updateInvoice(idx, { drinkType: e.target.value })} className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }}>{DRINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={importInvoice} disabled={!count} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50" style={{ background: C.ink }}><Plus size={16} /> Add {count} to cellar</button>
            <button onClick={() => { setAddMode("pick"); setInvoiceItems(null); }} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" style={{ borderColor: C.line }}>Cancel</button>
          </div>
        </div>
      );
    }
    if (addMode === "pick") {
      const q = addPickSearch.trim().toLowerCase();
      const matches = library.filter((b) => !q || [b.name, b.brewery, b.style].some((x) => (x || "").toLowerCase().includes(q)));
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <input ref={labelRef} type="file" accept="image/*" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length === 1) scanLabel(fs[0]); else if (fs.length > 1) scanLabelsBatch(fs); }} className="hidden" />
          <input ref={invoiceRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanInvoice(f); }} className="hidden" />
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Scan it in</p>
            <p className="mt-1 text-sm text-slate-500">Snap one pump clip, or pick several photos at once to add a whole delivery. Take the photos while you serve, then add them together.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => labelRef.current && labelRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ background: C.ink }}><Camera size={16} /> Scan labels</button>
              <button onClick={() => invoiceRef.current && invoiceRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><FileText size={16} /> Scan an invoice</button>
              <button onClick={() => setShowList((v) => !v)} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><ClipboardList size={16} /> Paste a list</button>
            </div>
            {showList && (
              <div className="mt-3">
                <textarea value={listText} onChange={(e) => setListText(e.target.value)} rows={6} placeholder={"Paste a delivery or price list, e.g.\n\nClark's cask\nOakham Citra 4.90\nTimothy Taylor Golden Best 4.30"} className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => importListText(listText)} disabled={scanning || !listText.trim()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ background: C.ink }}><Plus size={16} /> Add list</button>
                  <span className="text-xs text-slate-400">Adds them as en route. Cans are skipped.</span>
                </div>
              </div>
            )}
            {scanning && <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> {scanProgress || "Reading… this can take a few seconds."}</p>}
            {scanError && <p className="mt-2 text-sm text-amber-700">{scanError}</p>}
          </div>
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Add from your library</p>
            <p className="mt-1 text-sm text-slate-500">Most beers come round again. Pick a saved one and you'll only set price, best before and status.</p>
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={addPickSearch} onChange={(e) => setAddPickSearch(e.target.value)} placeholder="Search saved beers…" className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
            </div>
            <div className="mt-3 space-y-2">
              {matches.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No matches. Add it as a new beer below.</p>}
              {matches.map((b) => (
                <button key={b.id} onClick={() => pickBeer(b)} className="flex w-full items-center justify-between gap-2 rounded-lg border bg-white p-2.5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium" style={{ color: C.ink }}>{b.name}</span>
                    <span className="block truncate text-xs text-slate-500">{b.brewery} · {b.style} · {b.abv}%</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{latestPrice(b) ? `last £${latestPrice(b)} ` : ""}→</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={startNewBeer} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Plus size={16} /> Add a beer not in the library</button>
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
                <button key={t.key} onClick={() => setF({ drinkType: t.key, size: t.key === "cider" ? "Bag-in-box 20L" : t.key === "keg" ? "Keg 50L" : "Firkin (9g)" })}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                  style={form.drinkType === t.key ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{t.label}</button>
              ))}
            </div>
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Producer / brewery"><input className={inputCls} value={form.brewery} onChange={(e) => setF({ brewery: e.target.value })} placeholder="e.g. Tweedside Brewing" /></Field>
            <Field label="Location"><input className={inputCls} value={form.location} onChange={(e) => setF({ location: e.target.value })} placeholder="e.g. Berwick-upon-Tweed" /></Field>
          </div>
          <div className="mt-3"><Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="e.g. Border Reiver IPA" /></Field></div>
          <button onClick={autoFill} disabled={loading} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60" style={{ borderColor: C.brass, color: C.brass }}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Filling in…</> : <><Sparkles size={16} /> Auto-fill details</>}
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
            <Field label="Category (auto-set, change if needed)">
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
            <Field label="Container"><select className={inputCls} value={form.size} onChange={(e) => setF({ size: e.target.value })}>{SIZE_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <Field label="Delivered by (collects the empties)"><input className={inputCls} value={form.caskOwner} onChange={(e) => setF({ caskOwner: e.target.value })} placeholder={form.brewery ? `Defaults to ${form.brewery}` : "Defaults to the brewery"} /></Field>
          <Field label="Best before">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" value={form.bestBefore} onChange={(e) => setF({ bestBefore: e.target.value })} />
              <span className="text-sm text-slate-400">or</span>
              <input type="number" inputMode="numeric" min="0" placeholder="days" onChange={(e) => setF({ bestBefore: e.target.value === "" ? "" : dateInDays(Math.max(0, parseInt(e.target.value, 10) || 0)) })} className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              <span className="text-xs text-slate-400">days from today</span>
            </div>
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
              <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-sm"><input type="checkbox" checked={form.allergensVerified} onChange={(e) => setF({ allergensVerified: e.target.checked })} className="h-4 w-4" /><span className="text-slate-700">Allergens verified against the producer's own info</span></label>
              <Field label="Tasting notes (knowledge card)"><textarea className={`${inputCls} h-20 resize-none`} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} placeholder="How would you describe this to a customer?" /></Field>
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
    const filtered = library.filter((b) => !q || [b.name, b.brewery, b.style, b.category, b.location].some((x) => (x || "").toLowerCase().includes(q)));
    const histChrono = (b) => (b.history || []).slice().sort((x, y) => new Date(x.date) - new Date(y.date));
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Search saved ales, breweries, styles…" className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} of {library.length} shown</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((b) => {
            const h = histChrono(b);
            const open = !!historyOpen[b.id];
            return (
              <div key={b.id} className="rounded-xl border bg-white p-3" style={{ borderColor: C.line }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{b.name}</p>
                    <p className="truncate text-sm text-slate-500">{b.brewery} · {b.location}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-slate-700">{b.style} · {b.abv}%</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">{b.category && <Badge className={CAT_STYLE[b.category] || CAT_STYLE.Misc}>{b.category}</Badge>}<DietaryBadges beer={b} /></div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => addLineOfBeer(b)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Plus size={14} /> Add to cellar</button>
                  <button onClick={() => setEditBeerId(b.id)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Pencil size={14} /> Edit</button>
                  <button onClick={() => setHistoryOpen((m) => ({ ...m, [b.id]: !m[b.id] }))} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>
                    <History size={14} /> History{h.length ? ` (${h.length})` : ""} <ChevronDown size={14} className={open ? "rotate-180" : ""} />
                  </button>
                </div>
                {open && (
                  <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: C.line, background: "#FAFAF8" }}>
                    {!h.length ? <p className="text-xs text-slate-400">No history yet. It builds up each time you re-add this over time.</p> : (
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
                                  <span className={abvCh ? "font-semibold text-amber-700" : "text-slate-600"}>{e.abv || "—"}%</span>
                                  <span className={priceCh ? (pN > pP ? "font-semibold text-red-600" : "font-semibold text-emerald-600") : "text-slate-600"}>£{e.price || "—"}{priceCh ? (pN > pP ? " ↑" : " ↓") : ""}</span>
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
          })}
        </div>
      </div>
    );
  };

  const Backup = () => {
    const taCls = `${inputCls} h-28 resize-none font-mono text-xs`;
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Export</h2>
          <p className="mt-1 text-sm text-slate-500">A full copy of your library, cellar and price/strength history, as one JSON file. Keep it somewhere safe.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copyBackup} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Copy size={16} /> Copy backup</button>
            <button onClick={downloadBackup} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Download size={16} /> Download .json</button>
          </div>
          <textarea readOnly value={exportData()} className={`mt-3 ${taCls}`} onFocus={(e) => e.target.select()} />
        </div>

        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Import</h2>
          <p className="mt-1 text-sm text-slate-500">Restore from a backup. This replaces everything currently in the app.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => fileRef.current && fileRef.current.click()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Upload size={16} /> Choose a file</button>
          </div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="…or paste backup text here" className={`mt-3 ${taCls}`} />
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
    const empties = lines.filter((l) => l.status === "off" && !l.collected);
    const owners = [...new Set(empties.map((l) => l.caskOwner || "Unknown"))].sort();
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => go("cellar")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back to cellar</button>
        </div>
        <p className="text-sm text-slate-500">Grouped by who collects them. Tick each off as it's picked up to clear the space.</p>
        {empties.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
            <Check className="mx-auto mb-2 text-emerald-600" />
            <p className="font-medium" style={{ color: C.ink }}>All clear</p>
            <p className="mt-1 text-sm text-slate-500">No empties waiting for collection.</p>
          </div>
        )}
        {owners.map((owner) => {
          const items = empties.filter((l) => (l.caskOwner || "Unknown") === owner);
          return (
            <div key={owner} className="rounded-xl border bg-white p-3" style={{ borderColor: C.line }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold" style={{ color: C.ink }}>{owner} <span className="text-sm font-normal text-slate-400">· {items.length}</span></p>
              </div>
              <ul className="space-y-1.5">
                {items.map((l) => {
                  const beer = beerById[l.beerId];
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: C.line }}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium" style={{ color: C.ink }}>{beer ? beer.name : "Unknown"}</span>
                        <span className="block truncate text-xs text-slate-500">{l.size} · off {l.dates.off ? fmtDate(l.dates.off.slice(0, 10)) : "—"}</span>
                      </span>
                      <button onClick={() => markCollected(l.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={13} /> Mark collected</button>
                    </li>
                  );
                })}
              </ul>
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
          <Stat label="Avg days a cask lasts" value={avgDays == null ? "—" : avgDays} sub={lasted.length ? `from ${lasted.length} finished` : "no finished casks yet"} />
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

  const Distributors = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button onClick={addDistributor} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Plus size={15} /> Add</button>
      </div>
      <p className="text-sm text-slate-500">Names the scanners recognise as distributors. When one shows up on a label, invoice or pasted list, it's set as who delivered it (and collects the empties), rather than mistaken for the brewery.</p>
      {distributors.length === 0 && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-400" style={{ borderColor: C.line }}>No distributors yet.</p>}
      <div className="space-y-2">
        {distributors.map((d, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border bg-white p-2.5" style={{ borderColor: C.line }}>
            <input value={d} onChange={(e) => updateDistributor(i, e.target.value)} placeholder="Distributor name" className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
            <button onClick={() => removeDistributor(i)} className="inline-flex shrink-0 items-center gap-1 text-xs text-red-600 hover:text-red-700"><Trash2 size={13} /> Remove</button>
          </div>
        ))}
      </div>
    </div>
  );

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
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}><Download size={15} /> Print / Save PDF</button>
        </div>
        <p className="no-print text-sm text-slate-500">A printable list of everything on now. Unverified items say to ask staff. Print this for the bar folder.</p>
        <div id="allergen-sheet" className="rounded-xl border bg-white p-5" style={{ borderColor: C.line }}>
          <h1 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>What's on: allergen and dietary guide</h1>
          <p className="mt-0.5 text-xs text-slate-500">Please confirm with staff before ordering.</p>
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

  const TapList = () => {
    const on = lines.filter((l) => l.status === "on");
    const soon = lines.filter((l) => ["tapped", "vented", "in_cellar", "en_route"].includes(l.status));
    const cask = on.filter((l) => l.drinkType === "cask");
    const keg = on.filter((l) => l.drinkType === "keg").sort(byBB);
    const cider = on.filter((l) => l.drinkType === "cider").sort(byBB);
    const caskByCat = CATEGORIES.map((cat) => ({ cat, items: cask.filter((l) => (beerById[l.beerId]?.category || "Misc") === cat).sort(byBB) })).filter((g) => g.items.length);
    const faint = "rgba(243,239,230,0.55)";

    const Item = ({ line }) => {
      const beer = beerById[line.beerId];
      if (!beer) return null;
      const diet = [];
      if (beer.vegan) diet.push("Vegan");
      if (beer.glutenStatus === "Gluten-free") diet.push("Gluten-free");
      else if (beer.glutenStatus === "Low gluten") diet.push("Low gluten");
      return (
        <div className="py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>{beer.name}</p>
            <p className="shrink-0 text-lg font-semibold" style={{ color: C.brassSoft, fontFamily: "Fraunces, Georgia, serif" }}>£{line.price || "—"}</p>
          </div>
          <p className="text-sm" style={{ color: "rgba(243,239,230,0.7)" }}>{beer.brewery} · {beer.style} · {beer.abv}%{beer.clarity ? ` · ${beer.clarity}` : ""}</p>
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

          <div className="mt-8">
            {on.length === 0 && <p className="py-12 text-center" style={{ color: "rgba(243,239,230,0.6)" }}>Nothing pouring just now. Back shortly.</p>}

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

            {soon.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest" style={{ color: C.brass }}>Coming soon</h2>
                <p className="text-sm" style={{ color: "rgba(243,239,230,0.7)" }}>{soon.map((l) => beerById[l.beerId]?.name).filter(Boolean).join(" · ")}</p>
              </section>
            )}

            <p className="mt-10 text-center text-xs" style={{ color: "rgba(243,239,230,0.4)" }}>Allergen and dietary information is prepared with care, but please confirm with staff before ordering.</p>
          </div>
        </div>
      </div>
    );
  };

  const EditBeer = () => {
    const beer = editBeerId ? beerById[editBeerId] : null;
    if (!beer) return null;
    const close = () => setEditBeerId(null);
    const chip = (on) => (on ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft });
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" style={{ background: "rgba(27,34,48,0.45)" }} onClick={close}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>Edit beer details</h2>
            <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-xs text-slate-500">Shared by every cask of this beer, on the board, allergen sheet and tap list.</p>
            <Field label="Name"><input className={inputCls} value={beer.name} onChange={(e) => updateBeer(beer.id, { name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Producer / brewery"><input className={inputCls} value={beer.brewery} onChange={(e) => updateBeer(beer.id, { brewery: e.target.value })} /></Field>
              <Field label="Location"><input className={inputCls} value={beer.location || ""} onChange={(e) => updateBeer(beer.id, { location: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Style"><input className={inputCls} value={beer.style || ""} onChange={(e) => updateBeer(beer.id, { style: e.target.value })} /></Field>
              <Field label="ABV %"><input className={inputCls} value={beer.abv || ""} onChange={(e) => updateBeer(beer.id, { abv: e.target.value })} /></Field>
            </div>
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
              <button onClick={() => updateBeer(beer.id, { allergensVerified: !beer.allergensVerified })} className="rounded-md border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" style={chip(!!beer.allergensVerified)}>{beer.allergensVerified ? "Verified" : "Mark verified"}</button>
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
    const idx = STATUS_INDEX[openLine.status];
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" style={{ background: "rgba(27,34,48,0.45)" }} onClick={() => setOpenId(null)}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 flex items-start justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
            <div>
              <h2 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{beer.name}</h2>
              <p className="text-sm text-slate-500">{beer.brewery} · {beer.location}</p>
            </div>
            <button onClick={() => setOpenId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">{DRINK_TYPES.find((t) => t.key === openLine.drinkType)?.label}</Badge>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">{beer.style}</Badge>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">{beer.abv}%</Badge>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">£{openLine.price || "—"}</Badge>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">{openLine.size}</Badge>
            </div>
            <DietaryBadges beer={beer} />
            <button onClick={() => { setEditBeerId(beer.id); setOpenId(null); }} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Pencil size={14} /> Edit beer details</button>

            {f && openLine.status === "on" && <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium ${FRESH_STYLE[f.level]}`}><Clock size={16} /> {f.text}</div>}
            {bb && <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium ${BB_STYLE[bb.level]}`}><Calendar size={16} /> {bb.text}</div>}

            {openLine.drinkType === "cask" && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => setLineCategory(openLine.id, beer.id, cat)} className="rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                      style={(beer.category || "Misc") === cat ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{cat}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Allergens</p>
              {beer.allergens.length ? <div className="flex flex-wrap gap-1.5">{beer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
              {!beer.allergensVerified ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                  <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not yet verified. Don't serve on this alone.</span>
                  <button onClick={() => verify(beer.id)} className="shrink-0 rounded-md bg-amber-800 px-2 py-1 text-xs font-medium text-white hover:bg-amber-900">Mark verified</button>
                </div>
              ) : <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Verified by staff</p>}
            </div>

            {beer.notes && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Tasting notes</p><p className="text-sm leading-relaxed text-slate-700">{beer.notes}</p></div>}

            <div className="rounded-xl border p-3" style={{ borderColor: C.line }}>
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cellar lifecycle</p><StatusBadge status={openLine.status} /></div>
              <ol className="space-y-1.5">
                {STATUSES.map((s, i) => {
                  const done = i <= idx;
                  return (
                    <li key={s.key} className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-2 ${done ? "text-slate-800" : "text-slate-400"}`}>{done ? <CheckCircle2 size={15} className="text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}{s.label}</span>
                      <span className="text-xs text-slate-400">{fmt(openLine.dates[s.dateKey])}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2" style={{ borderColor: C.line }}>
                <label className="text-xs text-slate-500">Best before<input type="date" value={openLine.bestBefore || ""} onChange={(e) => setBestBefore(openLine.id, e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300" /></label>
                {openLine.dates.on && <label className="text-xs text-slate-500">On date<input type="date" value={openLine.dates.on.slice(0, 10)} onChange={(e) => setOnDate(openLine.id, e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300" /></label>}
              </div>
              <label className="mt-2 block text-xs text-slate-500">Delivered by (collects the empties)<input value={openLine.caskOwner || ""} onChange={(e) => setCaskOwner(openLine.id, e.target.value)} placeholder="e.g. the brewery or distributor" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300" /></label>
              {openLine.status === "off" && (openLine.collected
                ? <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> Empty collected</p>
                : <button onClick={() => markCollected(openLine.id)} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={15} /> Mark empty as collected</button>)}
              {idx < STATUSES.length - 1 && <button onClick={() => advance(openLine.id)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300" style={{ background: C.ink }}>Advance to "{STATUSES[idx + 1].label}" <ArrowRight size={15} /></button>}
            </div>

            <button onClick={() => removeLine(openLine.id)} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"><Trash2 size={14} /> Remove from cellar</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: C.stone, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap'); @media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      {view === "taplist" ? TapList() : (<>
      <header className="no-print sticky top-0 z-40 border-b" style={{ background: C.ink, borderColor: "#000" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full" style={{ background: C.brass, color: C.ink }}><Bell size={20} /></div>
            <div>
              <p className="text-lg font-semibold leading-tight" style={{ color: C.cream, fontFamily: "Fraunces, Georgia, serif" }}>The Curfew</p>
              <p className="text-xs uppercase tracking-widest leading-tight" style={{ color: C.brassSoft }}>Micropub cellar management</p>
            </div>
          </div>
          <nav className="relative flex items-center gap-1">
            <NavButton id="cellar" icon={ClipboardList} label="Cellar" />
            <NavButton id="add" icon={Plus} label="Add" />
            <NavButton id="empties" icon={Package} label="Empties" />
            <button onClick={() => setMenuOpen((v) => !v)} style={{ color: C.cream }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-amber-300"><MoreHorizontal size={16} /><span className="hidden sm:inline">More</span></button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border bg-white shadow-lg" style={{ borderColor: C.line }}>
                  {[["library", "Library", BookOpen], ["insights", "Insights", BarChart3], ["distributors", "Distributors", Package], ["allergens", "Allergen sheet", FileText], ["taplist", "Tap list", QrCode], ["backup", "Backup", Database]].map(([id, label, Icon]) => (
                    <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Icon size={15} className="text-slate-400" />{label}</button>
                  ))}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        {!hydrated ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading your cellar…</div>
        ) : (
          <>
            {VIEW_TITLES[view] && <h1 className="no-print mb-4 text-2xl font-bold" style={{ color: C.ink, fontFamily: "Fraunces, Georgia, serif" }}>{VIEW_TITLES[view]}</h1>}
            {view === "cellar" && Cellar()}
            {view === "add" && AddForm()}
            {view === "library" && Library()}
            {view === "insights" && Insights()}
            {view === "allergens" && AllergenSheet()}
            {view === "distributors" && Distributors()}
            {view === "empties" && Empties()}
            {view === "backup" && Backup()}
          </>
        )}
      </main>
      <footer className="no-print mx-auto max-w-4xl px-4 pb-8 pt-2 text-center">
        <p className="text-xs text-slate-400">Cellar tracking for cask, keg and cider</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <span className="text-xs text-slate-400">{storageOk === false ? "Saving not available in this view" : "Changes saved on this device"}</span>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700">Reset demo</button>
          ) : (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="text-slate-500">Reset to the original lineup?</span>
              <button onClick={resetDemo} className="rounded-md px-2 py-0.5 font-medium text-white" style={{ background: C.ink }}>Yes, reset</button>
              <button onClick={() => setConfirmReset(false)} className="rounded-md border px-2 py-0.5 font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
            </span>
          )}
        </div>
      </footer>
      </>)}
      {undoState && (
        <div className="no-print fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full px-4 py-2 text-sm text-white shadow-lg" style={{ background: C.ink }}>
            <span>{undoState.label}</span>
            <button onClick={doUndo} className="font-semibold" style={{ color: C.brassSoft }}>Undo</button>
          </div>
        </div>
      )}
      {CardModal()}
      {EditBeer()}
    </div>
  );
}
