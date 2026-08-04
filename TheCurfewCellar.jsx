import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus, ClipboardList, BookOpen, Beer, Sparkles, Check, CheckCircle2,
  Droplet, AlertTriangle, Clock, X, ArrowRight, Trash2, Search, Loader2, Bell, Calendar, History, ChevronDown, Database, Download, Upload, Copy, QrCode, Camera, FileText, Package, MoreHorizontal, BarChart3, Pencil, Printer, RotateCcw, Compass, Lock, Share, Wrench,
} from "lucide-react";

const C = {
  ink: "#203B43",
  inkSoft: "#376673",
  accent: "#1F6B6A",
  accentSoft: "#8ACFCE",
  cream: "#F6EDE5",
  paper: "#F9F6F3",
  stone: "#ECE6E2",
  line: "#E0DAD4",
  muted: "#51666C",
  alert: "#B23A2C",
};
const BEER = { yellow: "#E4C234", gold: "#E39E1A", amber: "#D6771C", red: "#CB4132", brown: "#974A31" };
const TYPE_ACCENT = { cask: C.ink, keg: C.accent, keykeg: C.accent, cider: "#4C7C6F" };
const DIET_BADGE_STYLE = {
  vegan: { background: "#EDF3E7", color: "#3F6B33", borderColor: "#C7DAB8" },
  gluten: { background: "#E8F2F1", color: "#1F5C54", borderColor: "#BFDDD9" },
  hazy: { background: "#F7E9E7", color: C.alert, borderColor: "#E8CCC8" },
};
const CAT_ACCENT = { IPA: BEER.gold, Pale: BEER.yellow, Bitter: BEER.amber, "Stout/Porter": BEER.brown, Stout: BEER.brown, Porter: BEER.brown, Cider: "#4C7C6F", Sour: BEER.red, Misc: "#7C8F96" };
const STORE_KEY = "curfew-cellar:data:v1";
const MODEL = "claude-sonnet-4-6";
const APP_BUILD = "2026-07-29 11:48";
const SB_URL = "https://fnqhrckxmzioinbokicb.supabase.co";
const SB_KEY = "sb_publishable_RyO06sDdZg3bH7Mt6hwHEQ_EA9RNkJ8";
const MANAGER_EMAIL = "manager@curfewcellar.app";
const STAFF_EMAIL = "staff@curfewcellar.app";
const READONLY_EMAIL = "readonly@curfewcellar.app";
const ROLE_BY_EMAIL = { [MANAGER_EMAIL]: "manager", [STAFF_EMAIL]: "staff", [READONLY_EMAIL]: "readonly" };
const roleFromSession = (session) => (session && session.user && ROLE_BY_EMAIL[session.user.email]) || "manager";
const CLOUD_ID = "default";
let _sb = null;
let _rev = null;
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
const authedFetchHeaders = async () => {
  try {
    const c = await _client();
    const { data } = await c.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    return token ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } : { "Content-Type": "application/json" };
  } catch (e) { return { "Content-Type": "application/json" }; }
};
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
  async signIn(password) {
    try {
      const c = await _client();
      let lastError = "Sign in failed";
      for (const email of [MANAGER_EMAIL, STAFF_EMAIL, READONLY_EMAIL]) {
        const { error } = await c.auth.signInWithPassword({ email, password });
        if (!error) return null;
        lastError = error.message || lastError;
      }
      return lastError;
    } catch (e) { return "Cannot reach the cloud. Check your connection."; }
  },
  async signOut() { try { const c = await _client(); await c.auth.signOut(); } catch (e) {} },
  async get(key) {
    try {
      const c = await _client();
      const { data, error } = await c.from("cellar").select("data").eq("id", CLOUD_ID).maybeSingle();
      if (!error) {
        if (data && data.data) { const v = JSON.stringify(data.data); _rev = _revOf(v); try { localStorage.setItem(key, v); } catch (e) {} return { key, value: v, cloudOk: true }; }
        return { key, value: null, cloudOk: true };
      }
    } catch (e) { }
    try { const v = localStorage.getItem(key); if (v) { _rev = _revOf(v); return { key, value: v, cloudOk: false }; } } catch (e) {}
    return { key, value: null, cloudOk: false };
  },
  async set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
    const rev = _revOf(value);
    if (rev && rev === _rev) return { key, value };
    try {
      const c = await _client();
      const { data: current } = await c.from("cellar").select("data").eq("id", CLOUD_ID).maybeSingle();
      const remoteRev = current && current.data ? _revOf(JSON.stringify(current.data)) : null;
      if (remoteRev && _rev && remoteRev !== _rev) {
        return { key, value, conflict: true, remoteValue: JSON.stringify(current.data) };
      }
      _rev = rev;
      await c.from("cellar").upsert({ id: CLOUD_ID, data: JSON.parse(value), updated_at: new Date().toISOString() }, { onConflict: "id" });
    } catch (e) { }
    return { key, value };
  },
  async subscribe(onRemote) {
    try {
      const c = await _client();
      const channel = c.channel("cellar-sync").on("postgres_changes", { event: "*", schema: "public", table: "cellar" }, (payload) => {
        try { const row = payload.new; if (!row || !row.data) return; const v = JSON.stringify(row.data); const rev = _revOf(v); if (rev && rev === _rev) return; _rev = rev; onRemote(v); } catch (e) {}
      });
      channel.subscribe();
      return channel;
    } catch (e) { return null; }
  },
  async fetchHistory(limit = 15) {
    try {
      const c = await _client();
      const { data, error } = await c.from("cellar_history").select("id, data, created_at").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    } catch (e) { return null; }
  },
};
const store = (typeof window !== "undefined" && window.storage) ? window.storage : cloudStore;
const clone = (x) => JSON.parse(JSON.stringify(x));

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
const STAGE_ACCENT = { in_cellar: "#E8DFB0", racked: BEER.yellow, vented: BEER.gold, tapped: BEER.amber, on: BEER.red, off: BEER.brown };
const SHORT_FLOW = ["in_cellar", "on", "off"];
const flowFor = (drinkType) => (drinkType === "cask" ? CASK_FLOW : SHORT_FLOW);

const PUB_CONFIG = {
  name: "The Curfew",
  fullName: "The Curfew Micropub",
  typeLabel: "Micropub",
  shortName: "Curfew",
  slug: "curfew",
  pumps: { cask: ["cask0", "cask1", "cask2", "cask3"], keg: ["keg0", "keg1", "keg2"], cider: ["cider0", "cider1", "cider2"] },
  pumpLabels: { cask0: "IPA", cask1: "Pale", cask2: "Bitter", cask3: "Stout", keg0: "Keg 1", keg1: "Keg 2", keg2: "Keg 3", cider0: "Cider 1", cider1: "Cider 2", cider2: "Cider 3" },
  pumpNumber: { cask0: 1, cask1: 2, cask2: 3, cask3: 4, keg0: 5, keg1: 6, keg2: 7, cider0: 8, cider1: 9, cider2: 10 },
  caskPrefPumps: (cat) => (cat === "IPA" || cat === "Pale") ? ["cask0", "cask1"] : cat === "Bitter" ? ["cask2"] : cat === "Stout/Porter" ? ["cask3"] : [],
  lineCleanDays: 7,
};
const PUMPS = PUB_CONFIG.pumps;
const PUMP_LABELS = PUB_CONFIG.pumpLabels;
const PUMP_NUMBER = PUB_CONFIG.pumpNumber;
const caskPrefPumps = PUB_CONFIG.caskPrefPumps;
const ALL_PUMPS = [...PUMPS.cask, ...PUMPS.keg, ...PUMPS.cider];
const TENANT_FEATURES = {
  cellarStats: false,
};
const bbCmp = (a, b) => (a.bestBefore || "9999-12-31").localeCompare(b.bestBefore || "9999-12-31");
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
const money = (n) => `£${(Math.round(n * 100) / 100).toFixed(2)}`;
const roundUpTo5p = (n) => Math.ceil((n * 100 - 1e-6) / 5) * 5 / 100;
const priceTriple = (pint) => {
  const p = parseFloat(pint);
  if (!isFinite(p) || p <= 0) return null;
  return { pint: money(p), half: money(roundUpTo5p(p / 2)), schooner: money(roundUpTo5p(p * 2 / 3)) };
};
const fmtUpdated = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return null; } };
const DRINK_TYPES = [
  { key: "cask", label: "Cask ale" },
  { key: "keg", label: "Keg" },
  { key: "keykeg", label: "Key Keg" },
  { key: "cider", label: "Draught cider" },
];
const PUMP_DRINK = (dt) => (dt === "keykeg" ? "keg" : dt);
const IS_EMPTY = (l) => l.status === "off" && !l.collected && l.drinkType !== "cider" && l.drinkType !== "keykeg";
const CATEGORIES = ["IPA", "Pale", "Bitter", "Stout/Porter", "Misc"];
const caskCategoryGroups = (items, catOf) => {
  const groups = CATEGORIES.map((cat) => ({ cat, items: items.filter((it) => catOf(it) === cat) }));
  const known = new Set(CATEGORIES);
  const leftover = [...new Set(items.map(catOf).filter((c) => !known.has(c)))].sort();
  leftover.forEach((cat) => groups.push({ cat, items: items.filter((it) => catOf(it) === cat) }));
  return groups.filter((g) => g.items.length);
};
const ALLERGEN_OPTIONS = [
  "Barley (gluten)", "Wheat (gluten)", "Oats (gluten)", "Rye (gluten)",
  "Sulphites", "Fish (isinglass finings)", "Milk (lactose)",
];
const GLUTEN_OPTIONS = ["Standard", "Low gluten", "Gluten-free", "Gluten-free (enzyme treated)"];
// What autofill and label/invoice scanning are allowed to set on their own. The enzyme-treated
// route needs real certainty, not an inference from OCR or an AI guess, so it's excluded here
// and only ever reachable by picking it directly from the dropdown.
const GLUTEN_AI_OPTIONS = GLUTEN_OPTIONS.slice(0, 3);
const CLARITY_OPTIONS = ["Clear", "Hazy"];
const CIDER_SWEETNESS = ["Sweet", "Medium Sweet", "Medium", "Medium Dry", "Dry"];

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

const FontBoot = () => <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=DM+Sans:wght@500;600;700;800&display=swap');
:root { --font-data: 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; --font-display: 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; --font-brand: 'DM Sans', 'Archivo', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }`}</style>;
const VIEW_TITLES = { cellar: "Cellar", add: "Add Stock", library: "Library", allergens: "Allergen Sheet", stock: "Stock List", empties: "Empties to Return", lines: "Line Cleaning", libtools: "Library Tools", stats: "Cellar Stats", guide: "How to Use", notify: "Notifications", backup: "Backup & Restore" };
const SIZE_OPTIONS = ["Bag-in-box 20L"];
const FRESH_LIMIT = 4;
const BB_SOON = 2;

const PUB_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAfo0lEQVR42u3deZB1eV3f8Xc/3c8zMLIM+xI1GBYNRHBBDSoKKY0aNYYKGmMiFv9gUqgJRo2UGFKaEqJiGTVaGpLSqBgEAUFklxGUZVgEJewT2QZlmWFg9nl6yR/nnOrDnX56eZ7unu6e16vq1n2e2+eee8/pvvf7Ob/f7/zO0vVXXhEAcNtyyi4AAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAgAACAAAgAAAAAgAAIAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAACAAAgAAAAAgAAMCJ8f8BYKyKJclIWfkAAAAASUVORK5CYII=";
const PUB_LOGO_INK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAf8UlEQVR42u3dfZAteV3f8ffcmXt3WYFdnmVDzCqIBiM+oQZXIgSNGjWGChqjUctKFSaFmmDUSIkhpSkxPpUxRsuEpDQqhgcBQQREZQUFXB4ERYSFjSC4ytOysM975yF/dHdNc3buPNw7Mzsz+3pVnTr3nunT53TPnPP9/H79618vXXHl4wMA7l5O2QUAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAACAAIAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAACAAGAXAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAIAACAAAAAn1IpdANwFlsYGyNrssYdXj64eVf3d6m9Vl1UXjT+/ubq+em/159WbqzdVb682ZutZHu/X7GbY5kN4xZWPtxeAw7Q8K86fUn1d9TXVZ1X33OO6bq2uqf6geln1qupj53gtQAAA7uLC/3nVU6onVJfMllkdW/NL423Rxux+qTv3Yl5XvaR6VnWVIAACAHA0/O3q6dW3zor3HQ2HA85V9LezMd7Wx3XMA8Ebqv9V/Vr1UUEAFhL5ZZ/0KfYCcKANjbHw/qvqOdUXz1r7U1E+n+Lf7HlTgFifrfch1VdX31Tdu+FQwcdmr7nhV4MAAHBwxX9jLMavrD6hun0swKfOs+jv9HrTetfG232qx1bfMgaBP6tuEgS4u3MaIHBYbhlb6Id19tGpNrv876geUD2tekv1/dW92jwcsOzXgwAAcHDfN3fFd840WHAKAp9YPaPhFMJvG5dZa/NQBAgAACfIYhB4WPW/G04hfNz4+IbeAAQAgJMdBFars9WV1e9Vv1RdkcMCCAAAJ/77b3kMAmsNgwTfVH1vdabNwwIgAACc0O/BpbE34D7Vj1Wvrf6R3gAEAICTb37GwOdWL69+sWHyIkEAAQDgBJuPD1htmLHwTdV3tjm3gBCAAABwgr8bTzUcFrh/9TPVH1aP0RuAAABw8s0PCzy64WqDv1BdLgggAACcbPPDAmvVk9o8LDAFhPO9lgEIAADH4PtyaewNeFDDYYHXVV/Z5lUJzSaIAABwQk2zCZ6tHlX9VvX86rP7+NkEBQEEAIATZrrE8XS2wBOqP2oYH/DQIxAEhA8EAIAD/g6dzhZYaRgf8MfVT7U5rfAUBA5jsOA0FmGjYTZDEAAADtDyWHTPNlxm+CkNlx3+2eozxiAwP2tgv1voS7P3sFE9tnqEXwsCAHCSbWxzO0xTEZ5OG7x39eTqjdVzG6YWXp71CnSBPQNLszCxMa73YQ2zF14+BhAQAIATYX0sdNMpeeuzIrrVbWO2/Pw5BxkOFi87fFH1xIaphd9UPW3sFWihZ6AdtmV5ITBszMLEwxvOSnh19dvVs/ypsJMVuwA44qYit3KO76y16raG7vdpqt7T1cU7tLDPjutdavMUv4MKAuvj/x853p5evWEs1q+s/rT68EIY2MkV1Zc0DED82ur66iuq1896GuDcf6BXXPl4ewE4yNbwRsMFda4Zi/LaLort1Lpd6eN7Kq9t6Nr+k+rt1XurD1U3jgV9fVz+THXPhqv7Pbj6pIbR+Q+vPrV6yNgyXwwSawcYCKYejPXuPEDvg9U7qrdV7xq36/rq1nH5S6r7jtvx6dVnVZ82bmNjkPjGMUQo/ugBAI6dqfCfmbXc/7B6cfU7Y0v5jgt8jTNjIPmM6vOrLxhb5Z+40FuwOmu571cgmM4amHo1psDygPH2xXtc323VD1XPGP+v+CMAAMfOWkPX/fLY+n1Ww4C2Ny4st7xFq3oKD/Oeh7rzOKf1MUBcO95eND5+6RgCvqihW/3zqgcuPHc6ZDCFgQsJBEuzYDFt+3xswtLC/RQW1sbegCkYfXd19WxZxZ/d/xE6BAAc5HdMOx8CWJ81SD5a/XzD6XN/tVD093Pw3rz4brXe+44h4LFjIPisNrvbDyIQbNcjMu2f0+P9u6v/0jDp0IZWP3oAgOPc6q/61YbBcdduUfT3u8Bttc7lWSC4vnrFeGsMMH+/elx1ZcNx+MXj+KuzYn1qi1b8bt/XVPSXZj0ijQHqF6pnVh/T6kcAAI6r1bGIvrth4pwXzgrx2l1Q2M4VCNYaBuW9t+F8/hoGE35B9ZiG6wE8fIsegilMrM+CwU49EouHN26ormo4HPLihmP+83204c8IAQA4LqZW7pnqedW/aRjJP7X4j0qLdm2LAj09fs14+5VZD8Ejqs9pc4T+Q6r77fF79obq/zWcIvjK6lXVdQuhZC2tfgQA4JhZa3Mk/FOrH10obEc5tGwXCKYegpfPlrms4cyCyxsuH/yAhtkBP2H87j1b3VR9pPqb8fl/WX3gHL0DCj8CAHBsi//F1S3Vt1S/foxbtNsFgmlbbxhvbz+P9c8PP2yk8CMAAMe8+H+kYda6V4/fP6snZPvOVaQXg8Fu9lMKPgIAcFJc0jDb3Vc3nNd/kor/+QQDEACAE18Aq26uvqx6a0P39qpdAwIAcPL99Xhz3jocES4HDByWpZy3DgIAcLej+IMAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAABw4FbsAu6GLjuk8LtefbTaOIHbdcMJ/H2tjb8vEADghPqT6hMOsDBvjAXr5urzq/cfwjbdu7q6ut9YoJcOcLuurx51SMXyftXrq0sPYbs+OG7XTT4iCABwMj2guvgQXueSDu8w21J1/+o+h/Bapw6oEJ/L/at7HcLrbBzydoEAAIfsbHXmEHoAzt4F27V+CC1l2wUCABxLS+MX/voJaiXPt+sgW7K2C04IZwEAgAAAAAgAAIAAAAAIAACAAAAACABAbZ5atnRM17/Td8dJ2y4QAIB9sbFwf1DrXz/k7Vo7pO3a8CcEB8NEQHDwIfsgJx6a1nvYn+WVQ9oujRQQAODYWBqL1z2q369WDyloXNbBTZc7365Lq9fNegEO0nLDdQAOcrtAAAD2vWA+9JBf8zAOBZyuHnYCtwsEAGDfrB7iax1Wd/n6IRdkhwFAAIBj55TtAnyIAQABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAEAABAAAAABAAAQAAAAAQAAEAAAAAWrdgFcOJtzO43quVtll2rlsZbs3tAAACOeLFfnxX9U+f4nK9v8dip7twruDpbdmn8uVAAAgBwBKyPt6nYL7bwb6uurz5UfaR6VHWPMSQsze5vrt5Q3ae6f3Xf6uItXm919noOI4IAAByBz/GHq7dVf1z9afWO6i/Hx28al3lX9dCxkE8BYLn6YPXYcZl7VverPqn6tOozq8+pHjE+vl1PAiAAAAdoarn/afXi6qqx8H9om+dctE2rfWls8d82hoWbqvdUr54tc/8xCDy2+qoxGEzvAxAAgH0u9BtbFO716nT1PdVvL/xseYtW+rSe7cyP97fwmmtjuHjFeHt59fuznoTF9SwJBiAAAOdX+NeqMwvFeatW/fJ4u2NWrC/0tc+1njPj4xft4rvljvF9CQJwxBjAA0fT2lg4z1TXVW9dKMxbBYW1Q3xvazsEh7dV7xvf//IhvjdAAIBjaRrRf7q6sfrJ6pHVs8fP61EvpGvj+3xB9VnVj1cfG7dn2jZAAABmVhu6zleqZzWcrvc9DSP4P+GYbcslDacefl/1udWvzLZt1a8aBABgc3Demert1ddU31Rd0zAqf2mHlvNujq/v9hj8fs0AOA0CvLi6tvrm6iurPxu3czcDEgEBAE508Z8G8P1Uwyl2vzn7+W1tzu53LmsL9+d6nZ2WadY639iH19sY3//kZdXnNRwWWBq3WQiAu4izAOCuLf5VH6j+XfVrDV3n954V/OXqbFvPyDe5ZLyttPMx9jPbtO6Xqsuq23fRcFht+8MSZ8b3dHoWFKbnfV/1xuqnqwdkHgG4SyxdceXj7QXubm5smOnurh6QNhW+G6v3j8V3fYtW8UZ1r20K7g1jS3u3RfT+bX1BoLWG8QYbu3zvFzVMG7yVWxoG/y1tETJOje/5gWPYuasDwNQL8/7qU8ffB+gBAA4ugI/3l463nZwrsNz3PF57q3Wdrj5xH9bTGLDuuc3zHjh7vtY/CABwt7S+y1b3uQrlXk8NXLrA97Ff70nhBwEA9AbcRc89qHUp7iAAAFvY62lwSzu03Pdiu7N/9mtd+7l9gAAAJ8byeTxnfR8/x+vnKOan9uk97ef2AQIAnIiW/1LDaPu/2GXLeKO6vGGA3nzE/PTvd1Yf3UNL+zPavMDQ3G0NE/XstuV+7+ph59i+v2m4FsDSDuubfn5Fw2BGpwSCAAAnptjPTVf3e2nD7Hi79cPV0xqurrcyazGfrv7tuL7dBoBrq09uOCf/1LielbFof2G7H1T4uOr3ZuuZb98vN5zvv1u/VH3LwvZttx+BC2QmQDi44r+8zWdsenynrvKVXXxWl3exrqmAnt5hmZWF5bd7vZVdfLesXOD2ncqMgSAAwDEr/reMLdoLXdd+vae9LHdYr7vTz+9oODQhBIAAAEe++FfdXP37Ni+Py/l9P601XBHx5n0OJuADZhfAvlobW6vfW724ukd7n6iHzX15j+pFDeMJlu1LEADgqBasM9Vrqp+vHmSX7IsHVj9XvXbcv0IACABwZEwj1W+rvn18zMj1/f2eelKbFz1yKAAEADgSplPpfrJ666xHgP3Zt4379afa3WWPAQEADqVALVfvqX6085sFj50tV8+o/nL8txAAAgDcpTbGz9J/bhitfmYsUDudl7+8i9tK288n0GyZ3axnN/MOLO9ynad2+G7ZzXqmny/tYl1nxv37w+NjDgPABTATIFx46/90w8C/Z46P3TreX7/N825vOESw02GC6ec3b7PMR3a5rum9rW+zLbfsYh3T69ywzTK37HH7bt/F9k379ZnVt1Vf1MfPQggIAHDo/qZ68viZ2hiL6SedozVb9feq79hFS3Y6F/4xC89v1mr+xuozd9kqXq4uXXj+dH9p9ZSxqLZD78V69ekLz5+/v0eP27dTV/20fY/cYvsmT2ro9j81vtbquL+BC7B0xZWPtxe4u7mxumf7ewz51Dat6r0sv1Nvw0Gu6yi+p/PZt3s1zdz4/upTx78P0AMA7MrqFgVpOs6/ld122c+L4LkK4dn2djx8ZZuCurqH9Wy3fat7LNDbjQPYavvO59LFgAAA+26vBWlpHz9/+3nWwcqttD8Oa/uA2YcUANADAOzSets3c2/XRb7R/h0C2Ol97PY9Nb6njX1Y117e09TKXzrP9+RwAAgAcOQ+P+vbFLy9dm2v7+PneH2fCulBv6caTrM83+cCAgDsm+mKfy+t/s/4OVpbKKTr1RXVj4w/W5o993T1xuoX2/k0ueWGAXXfXX1Hw4C45VnRW6l+vnrLDuua5s+flr/n7H1No+A/0XDp3bNtP9/+/NS9J59j+15c/c4W++Zc2/fE6msXtm96Xz9R/fVsvy4+93urb579XgABAA7MqepXqj/eZpn7jwFgbiqql1f/Zw+v98AxAGxssa4XV5fuYV1PHQPAxkKhv3YMNLv1wTEAbMwCwLSut+9x+75xDABbhY7nVu/d5rlXV/8k114AAQAO0MZ4hPuZ6s1t9l1vLByZrlWXbLOe+XTBazt8Rleri7dZ5pJdrGt6j2c6dzP/qfF1btqhBWB6nTtt855u3+ZUv6u72L6LtlnmzufYvuk9vqX69LjcvDUCEABg30wX/nl79fFzFMr1djfIb23hfrvltusmWN3jutrlui7kPa3v8T1t7GJd61sst9TQdfH26utmvx9gB0bOwt5bAKre4DN0pL7D3rjw+wEEANhXU/Pym+yKI+Wyhd8PIADAvpr6od85/n/9kD5f5yps6+dR9PazSK7v02ssXeDrvzNnAYAAAAdkY/zMXNlwdbrpsXO58RwFer26eY+vffYcRfPUHte1ts3ye5285+w23yF73b6b2/paCjuta9r/H64+2e6uiAgIALDnAFD1kba/Yty03Huqd/XZ569PRfvle3ztVy18Zqdz+j/ZZnfEToPtptaLSxeOnqfC/6cNgwB3OoqeXuetDVfQW5lt8/T+XrnH7XtFm5f7nd7TqXEfvmcXYeua6opdLAcIAHBBAaAdCuVUbF8wK2jTKYSfbjh3fzdFe/r566r3jcV2Pir+FdVV7a3p+/cXPv/TDIDP3sM6lhtOhXzZwvtZqT5QvXaP2/ey6lPj/tmYhZMXjC0AO+3rqRVAAAABAA4sAHx0D895fpunpk3F7tLxyH23RXua8e6FszAxtSQ8dw/vZXr9P2/owphm6VsZt+k1uyzac8+dHblPRfvFuyjai9t31djKMYWJ6bnP28N7+agAAAIAHKSP76HYvq1hgNp8mt7nnufrPm/2uT09hohX7bFoLzeMTXjx+H7Ojvcvqa7fQ9GeXu/VDd0Ap9tsvv+D89y+KUxMUwC/q2GSn91u38f9aYIAAAfpqj0U27XqD8f/T83/L91j0Z6Wu6xhStxpAq9XjOs7n5HvfzB+/lfOoyVhvn3XzrbndEPz/+vOc/um7oxp+17Y3kb2f8qfJggAcJCu2+Pyz29zcN2r21vz/7zYrlYvusCWhHk3wAcapgb+SOfX/N/C+1iv/qhhKuHz2b6rGgYPTsHpeQf8ewEBANiTm/ZYbN9WvWP89+9f4GtPR+4fb3Ok/V6L9tQN8KJZ0d5L8//i9l3a0P9+qnrOBW7f9Px3trfm/8ZtAgQA2He7OS99q2K71tDHvjren0/RnncDfHw8gv9MFzbxzfPG74DnX8A6pm6A1zRcle91F7h9L2sYl/Cy9j6xj8F/sAcuBgSH45XVQ8ciuXSexWo+puCyC3gvU7F9c8M1DS47z6I995IxGK228xUOt9u+a8Z1vcKfDAgAcJxNhfBN1Y9f4Lqmvv+fH4PEhRbta6sfmK3rQrbvJbMgsX6B2/cTbc60uOZPCAQAOM6uaXMcwPk2VU/Pe+8+vq+37NN6PjHe9mP73uHPBQ6eMQBw2+bqeSAAALdBBs6BAAAACAAAgAAAAAgAAIAAAAAIAACAAAAcWd/XhV1PABAAgGPmXtXTqvvaFSAAACffdMT/qOo+1aMXHgcEAOAEe2zDBXj++fj/dbsEBADg5Fqr7l59w/gd8OixJWAj1wYAAQA4kaZm/m+uLqluqO5YfYvvBBAAgJPvsef4v24AEACAE2itukebA/9Oj/ePTDcACADAiTRv/r9TdXb8Dri5ukO6AUAAAE607+yzm/qnI/7vGu91A4AAAJwga9VK9cXjZ39pIQA8uDrT0A0ACADACfvMb2wTEAABALiNMfgPBAAAQAAAAAQA4Nja6YI/K3YRCADAyXND5z7Nb7263i4CAQA4eUf//7G6V8OI//lpgGvVPasnawUAAQA4GaZC/5vV06vbj4/NA8BSdbvqZ6rfXXgeIAAAx/Cof6P6qupfN0z7u52bGmYEfOT4vGW7EAQA4Ph6SJsT/Sxt01IwdQc82C4DAQA4/q6etQZsZ31c7tN2GQgAwPE1jfh/Q0Pz/kU7LH+7arV6/cLzAQEAOEY2Gpr1P9owBuBtDZcB3srZ6u3V91YfHJ/nwkBwQjndB247IeC51fOr91f3G4/0T41H+SvVx6qHj48r/qAFADghIWC57ccBbIzfCbsZKwAIAMAxsbbPywECAAAgAAAAAgAAIAAAALcypwHC4ViaBW6D7AABAG4jxX9ji8I/v9COUAAIAHDC3KV6SnV59dbqvdWV5yj6y8IAIADAyTj6v6q6tPrD8bFPNMzG9/bqLeP9+xou2LMmCAACABx/0wx8L6we0zAV7z3G2yNmy31sbBn44+pXqmtnAcKsfMC+cxYAHLy1MWy/oHri+NgN1c3jba26V/XI6mljq8C/XAgQy2MYaNZCACAAwBG3OhbtX61+urr9+PjKWNjXGq7Gd3P1oOpZ1SvGVoK18bZR3aHhkr66BwABAI5RS8By9Z+q/1GdGYNBYwhYHgPB6hgGvqF6XfXr1ddVz2noJnh39d+qO9ulwPkyBgBunRDwhIZm/39a3TiGgcVgfna27BMW1vND1aPGkPAJuxXQAgBH3/p4xP8vxiP827XZzD83XZb3bJtdBNNyN1QPrZ48WxZAAIAjbBrVf2P17dVvVqfH29oYECZT18D8fvr3WsOYgdKaBwgAcKxCwFXV4xv6+C8dQ8A0DmCnz+5Sdb/qPtVNWgIAAQCOl+XqtdWjq8c1TBJ0Zhef3Y2GboS3VT88Pmdt1koAIADAEbY2O3L/7erLqp9q6CLYbhKgpYZxAfesnlG9qfpn43M2tmgN2Kl1YEMrAggAwOGHgKn4XlP95+q6NgcCbtd6MI0FeGjDTIMvrL5kYZ3Tcme3+dxPy6wJASAAAIcfBJYazgy4oWEswHxQ4HqbkwLNWwKmcQOrDQML39gwV8C9ZkX9MQ1dDfcd/39q9j2wVt17/PljZ+FBVwIIAMAhfi5vqH5pLOzzswOm/291saBT4+3suNwPNVxo6AcbzjR4XvU13XJa4anQLzfMPPic6tnVHcegIQTACeTUITi6rQDPGIv9DzdcPKjqN6qPVD9eXdzm2QLzMD813988tgD80vj/1bYeGzA3tTh8V/V3q2+qPuNXAloAgMMxNfE/vXpwQ7P+N1Tf33AtgYdXvz+G+JVu2S3Q7PGzbfb9L+/iO2GlYQDiV1W/u4vQAAgAwD5brj5Z/VH1qtlj72o4BfCbGvr7p26B1W45PmB5iwI+H0uwOPlQDacU3lR9a8M8BQYGggAAHKLFkfzTY1Nhf3lDv/6/qT48Fu7lLQr6YvGfjyWYJh9a3yJ8rFc/mSsQggAA3GpBYF6AN2ZH5WsNVwz80urnGgYQrrT16YNT8b+s+u7qK6vvrF6/xXNOjct/QfX1s1AACADAEWohuLL6sbGoXza2EqwvLHuqekPD1MPPbpg86LkNVxb8s/E5awuBYb36R3Y1CADA0Q0CZ6p3NIwRONUtm/VPVU9t6N8/Mxb8Mw1nDPxkm9cYmCyNjz3ILgYBADi6zo5F+z6zAl5D0/7phkGC75stO11uuOryMRhs1X1wh1mLACAAAEfwM71RXbvw+NJY/Feqzx0fO71wf99ZSFic/OcG3xkgAABH3+Xj0fr8SH7690+M9zcv3D9lFiDmz1kf1wcIAMARd2m37M+f5gn4pupF1SOr+zWcRviC6tvGny8vtBycql5jl8LJYipgOFmmwYCvbpgX4L7jEfz8wj+rY7H/tur6himFGx+fHxRMz/to9cqF9QNaAIAjZrmhz/5nO/dFg86Oj1/cuS8TPM0z8PMNYwrMAQACAHDEWwGWql9raLq/qM2R/vOQsNRnzyo4d3Z83uurX+6W8wMAAgBwhIPAd1XvnoWAxdP4Fkf7r8+K//sbZglctStBAACOh42xuH+sYRa/V41FfZrzf3W8TVMMT/9eGZd7zfi8K8b1bNilIAAAxysE/E3DpYR/oHrvWOTPjLfT42369+XVk8bi/2HFH04uZwHAyQ8Bk/9ePbN6dPW11QMaZvi7oaG5/7UNZw9Mk/4o/iAAACfAcsNUvy8db9stt6b4gwAAnAzzKwdut4zR/iAAACc4CAC3YQYBAoAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAAAgAAAAAgAAIAAAAAIAAHDcrdgF3AZtVOvj/fk8j6Nr+r1uHMLfAwgAcMyc6fxav5bHey1nR9Op8XbRBfxdgAAAJ9gHq4vP44hvfQwB19mFR9K11Uerm2dhbbctAKeqT2oF4LZk6forr7AXAOA2RlMmAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAAIAAAAAIAACAAAAACAAAgAAAAAgAACAAAgAAAAAgAAMCJ8f8BwhhoaCdysYUAAAAASUVORK5CYII=";

const uid = () => Math.random().toString(36).slice(2, 9);
const DAY = 86400000;
const isoDaysAgo = (n, hour = 9) => { const d = new Date(Date.now() - n * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const dateInDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
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
const splitNote = (notes) => {
  if (!notes) return [];
  return notes.trim().split(/\.\s+/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean);
};
const dayDiff = (aIso, bIso) => { const a = new Date(aIso); a.setHours(0, 0, 0, 0); const b = new Date(bIso); b.setHours(0, 0, 0, 0); return Math.round((b - a) / DAY); };
const daysUntil = (dateStr) => { if (!dateStr) return null; const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(dateStr + "T00:00:00"); return Math.round((b - a) / DAY); };
const daysOn = (line) => { if (!line.dates.on) return null; return dayDiff(line.dates.on, line.dates.off || new Date().toISOString()); };

const freshness = (line) => {
  if (line.drinkType !== "cask") return null;
  const d = daysOn(line);
  if (d === null) return null;
  if (line.status === "off") return { level: "off", text: `Lasted ${d} day${d === 1 ? "" : "s"}` };
  if (d < FRESH_LIMIT) return null;
  return { level: "check", text: `On for ${d} days · Check quality` };
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

const extraSweetness = (beer) => (beer.sweetness && beer.sweetness.trim().toLowerCase() !== (beer.style || "").trim().toLowerCase()) ? beer.sweetness : "";
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
const cleanBrewery = (name) => {
  if (!name) return "";
  let out = String(name).trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/[\s,]+(?:limited|ltd\.?|co\.?|company|brewery|brewing|brewhouse|breweries|brewers|brew\s*co\.?|ales|beers|beer\s*co\.?|cider|ciders|cidery|cider\s*co\.?|perry|perries|plc)$/i, "").trim();
    if (next === out) break;
    out = next;
  }
  return out || String(name).trim();
};
const normalizeForMatch = (s) => (s || "").toLowerCase().replace(/['".,]/g, "").replace(/\s+/g, " ").trim();
const breweryCore = (s) => normalizeForMatch(cleanBrewery(s));
const findDuplicateCandidates = (library) => {
  const groups = {};
  library.forEach((b) => {
    const key = normalizeForMatch(b.name);
    if (!key) return;
    (groups[key] = groups[key] || []).push(b);
  });
  const pairs = [];
  Object.values(groups).forEach((group) => {
    if (group.length < 2) return;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const c1 = breweryCore(group[i].brewery), c2 = breweryCore(group[j].brewery);
        if (c1 && c2 && (c1 === c2 || c1.includes(c2) || c2.includes(c1))) pairs.push([group[i], group[j]]);
      }
    }
  });
  return pairs;
};
const findLocationClashes = (library) => {
  const groups = {};
  library.forEach((b) => {
    if ((b.collabBrewery || "").trim()) return;
    const loc = (b.location || "").trim();
    if (!loc) return;
    const key = breweryCore(b.brewery);
    if (!key) return;
    const g = (groups[key] = groups[key] || { brewery: b.brewery, byLoc: new Map() });
    if (!g.brewery && b.brewery) g.brewery = b.brewery;
    const lk = loc.toLowerCase();
    const entry = g.byLoc.get(lk) || { loc, beerIds: [] };
    entry.beerIds.push(b.id);
    g.byLoc.set(lk, entry);
  });
  return Object.values(groups)
    .filter((g) => g.byLoc.size > 1)
    .map((g) => ({ brewery: g.brewery, options: [...g.byLoc.values()].sort((a, b) => b.beerIds.length - a.beerIds.length) }));
};
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
// The two real routes to a gluten-free claim are now distinct dropdown values rather than a
// claim plus a validity flag, so there's nothing left to reconcile: a beer is either one of the
// two gluten-free options or it isn't, and the label is just the option itself.
const isGlutenFree = (beer) => beer.glutenStatus === "Gluten-free" || beer.glutenStatus === "Gluten-free (enzyme treated)";
const glutenFreeLabel = (beer) => beer.glutenStatus;
const VEGAN_CONFLICTS = ["Fish (isinglass finings)", "Milk (lactose)"];
const veganClaimConflict = (beer) => !!beer.vegan && (beer.allergens || []).some((a) => VEGAN_CONFLICTS.includes(a));
const isVegan = (beer) => !!beer.vegan && !veganClaimConflict(beer);
const splitTitle = (brewery, name, collabBrewery) => {
  const b = (brewery || "").trim(), n = (name || "").trim(), c = (collabBrewery || "").trim();
  const lead = c ? `${b} X ${c}` : b;
  if (b && n.toLowerCase().startsWith(b.toLowerCase() + " ")) return { lead, rest: n.slice(b.length).trim() };
  return { lead, rest: n };
};
const locationDisplay = (b) => {
  const loc = (b.location || "").trim(), collabLoc = (b.collabLocation || "").trim();
  if (!collabLoc) return loc;
  return loc ? `${loc} X ${collabLoc}` : collabLoc;
};
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
const withContradictionCheck = (note, fields) => {
  const warnings = checkContradictions(fields);
  if (!warnings.length) return note;
  return { type: "warn", text: `${note.text} ${warnings.join(" ")}` };
};
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
const deriveCategory = (drinkType, style, abv) => (drinkType === "cider" ? "Cider" : categorise(style, abv));
const EMPTY_DATES = { ordered: null, delivered: null, racked: null, vented: null, tapped: null, on: null, off: null };
const normaliseData = (data) => {
  if (!data) return data;
  const seenLibIds = new Set();
  const lib = Array.isArray(data.library) ? data.library.map((b) => {
    const id = (b && b.id && !seenLibIds.has(b.id)) ? b.id : uid();
    seenLibIds.add(id);
    // One-off migration: glutenStatus used to be a claim ("Gluten-free") paired with a separate
    // enzymeTreatedGF flag. Folded into a single value so there's one field to read everywhere,
    // not a claim plus a modifier to reconcile.
    let glutenStatus = b.glutenStatus;
    if (glutenStatus === "Gluten-free" && b.enzymeTreatedGF) glutenStatus = "Gluten-free (enzyme treated)";
    const { enzymeTreatedGF, ...rest } = b;
    return {
      ...rest,
      id,
      glutenStatus,
      allergens: Array.isArray(b.allergens) ? b.allergens : [],
      history: Array.isArray(b.history) ? b.history : [],
    };
  }) : [];
  const libIds = new Set(lib.map((b) => b.id));
  const rawLines = Array.isArray(data.lines) ? data.lines : [];
  const dropped = rawLines.filter((l) => !l || !libIds.has(l.beerId)).length;
  if (dropped) console.warn(`normaliseData: dropped ${dropped} line(s) with no matching library beer.`);
  const seenLineIds = new Set();
  const lines = rawLines.filter((l) => l && libIds.has(l.beerId)).map((l) => {
    const id = (l.id && !seenLineIds.has(l.id)) ? l.id : uid();
    seenLineIds.add(id);
    return {
      ...l,
      id,
      status: STATUS_BY_KEY[l.status] ? l.status : "in_cellar",
      dates: { ...EMPTY_DATES, ...(l.dates || {}) },
      collected: !!l.collected,
    };
  });
  return { ...data, library: lib, lines };
};

const aiDraft = (name) => {
  const l = (name || "").toLowerCase();
  let d = { style: "Pale Ale", abv: "4.2", clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: [], notes: "Golden and sessionable, light citrus and a clean dry finish." };
  if (/stout|porter/.test(l)) d = { ...d, style: /porter/.test(l) ? "Porter" : "Stout", abv: "4.8", notes: "Dark and roasty, coffee and dark chocolate, smooth and dry." };
  else if (/ipa/.test(l)) d = { ...d, style: "IPA", abv: "5.6", clarity: /hazy|juic|neipa/.test(l) ? "Hazy" : "Clear", notes: "Hop-forward, tropical fruit and citrus over a firm bitterness." };
  else if (/bitter/.test(l)) d = { ...d, style: "Best Bitter", abv: "3.9", notes: "Amber, biscuity malt with earthy English hops." };
  else if (/cider|scrumpy|apple/.test(l)) d = { style: "Medium", abv: "5.2", clarity: "Clear", glutenStatus: "Gluten-free", vegan: false, allergens: ["Sulphites"], notes: "Traditional medium cider, crisp apple with a gentle tannic finish.", sweetness: /dry/.test(l) ? "Dry" : /sweet/.test(l) ? "Sweet" : "Medium" };
  else if (/pear|perry/.test(l)) d = { style: "Perry", abv: "4.5", clarity: "Clear", glutenStatus: "Gluten-free", vegan: false, allergens: ["Sulphites"], notes: "Soft, lightly sweet perry with ripe pear notes.", sweetness: "Medium Sweet" };
  return { ...d, allergensVerified: false };
};

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
  drinkType: "cask", brewery: "", location: "", collabBrewery: "", collabLocation: "", name: "", style: "", abv: "",
  clarity: "Clear", glutenStatus: "Standard", vegan: false, allergens: [], notes: "",
  allergensVerified: false, category: "Misc", size: "", price: "",
  status: "in_cellar", bestBefore: "", caskOwner: "", sweetness: "",
};

const CatDot = ({ category }) => {
  const c = CAT_ACCENT[category] || CAT_ACCENT.Misc;
  return <span className="inline-block shrink-0 rounded-full" style={{ width: 9, height: 9, background: c, boxShadow: "inset 0 0 0 1.25px rgba(32, 59, 67,0.35)" }} title={category || "Misc"} />;
};
const Badge = ({ className = "", style, children }) => (
  <span style={style} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
);
const DietaryBadges = ({ beer }) => (
  <div className="flex flex-wrap gap-1.5">
    {isVegan(beer) && <Badge style={DIET_BADGE_STYLE.vegan}>Vegan</Badge>}
    {isGlutenFree(beer) && <Badge style={DIET_BADGE_STYLE.gluten}>{glutenFreeLabel(beer)}</Badge>}
    {beer.glutenStatus === "Low gluten" && <Badge style={DIET_BADGE_STYLE.gluten}>Low gluten, &lt;20ppm</Badge>}
    {beer.clarity === "Hazy" && <Badge style={DIET_BADGE_STYLE.hazy}>Hazy</Badge>}
  </div>
);
const DietaryMini = ({ beer }) => {
  const items = [];
  if (isVegan(beer)) items.push(["VG", "Vegan", DIET_BADGE_STYLE.vegan]);
  if (isGlutenFree(beer)) items.push([beer.glutenStatus === "Gluten-free (enzyme treated)" ? "GF*" : "GF", glutenFreeLabel(beer), DIET_BADGE_STYLE.gluten]);
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
const BeerDetailsFields = ({ values, onChange, onAutoFill, busy, note, toggleAllergen }) => {
  const chip = (on) => (on ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft });
  const [showCollab, setShowCollab] = useState(() => !!(values.collabBrewery || values.collabLocation));
  useEffect(() => { if (values.collabBrewery || values.collabLocation) setShowCollab(true); }, [values.collabBrewery, values.collabLocation]);
  return (
    <>
      <button onClick={onAutoFill} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-60" style={{ borderColor: C.accent, color: C.accent }}>
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
      {showCollab ? (
        <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: C.stone }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>Brewed as a collaboration</p>
            <button onClick={() => { setShowCollab(false); onChange({ collabBrewery: "", collabLocation: "" }); }} className="text-xs font-medium text-slate-500 hover:text-slate-700">Remove</button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Second Brewery"><input className={inputCls} value={values.collabBrewery} onChange={(e) => onChange({ collabBrewery: e.target.value })} placeholder="e.g. Wild Beer Co" /></Field>
            <Field label="Second Location"><input className={inputCls} value={values.collabLocation} onChange={(e) => onChange({ collabLocation: e.target.value })} placeholder="e.g. Shepton Mallet" /></Field>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCollab(true)} className="text-left text-xs font-medium" style={{ color: C.inkSoft }}>+ This was brewed as a collaboration</button>
      )}
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
    <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.accent }}>{children}</h3>
    <span className="h-px flex-1" style={{ background: C.line }} />
    {count != null && <span className="text-xs font-medium text-slate-400">{count}</span>}
  </div>
);

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

const LineRow = ({ line, context, beerById, onOpen }) => {
  const beer = beerById[line.beerId];
  if (!beer) return null;
  const sig = cardSignal(line);
  const storeBB = context === "store" && line.bestBefore && !sig.alert;
  const showBadge = context === "racked" || sig.alert || storeBB;
  const bb = bbStatus(line);
  let badgeText = sig.text;
  if (storeBB) badgeText = `BB ${fmtDate(line.bestBefore)}`;
  else if (bb && bb.level === "past") badgeText = "BB passed";
  else if (bb && bb.level === "soon") badgeText = daysUntil(line.bestBefore) === 0 ? "BB today" : `BB ${daysUntil(line.bestBefore)}d`;
  return (
    <button onClick={() => onOpen(line.id)} className="relative flex h-full w-full flex-col gap-1.5 overflow-hidden rounded-xl border py-2 pr-3 text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-teal-300 active:scale-95" style={{ background: C.paper, borderColor: C.line, boxShadow: "0 1px 2px rgba(32, 59, 67,0.04), 0 8px 20px -14px rgba(32, 59, 67,0.28)", minHeight: 52, paddingLeft: 22 }}>
      <span aria-hidden="true" title={beer.category || "Misc"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
        <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[beer.category] || CAT_ACCENT.Misc }} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-normal leading-tight" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{(() => { const t = splitTitle(beer.brewery, beer.name, beer.collabBrewery); return <>{t.lead && <span className="font-semibold" style={{ color: C.ink }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()}</p>
          {!beer.allergensVerified && <AlertTriangle size={13} className="shrink-0" style={{ color: C.alert }} />}
        </div>
        <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[beer.style || "", beer.abv ? `${beer.abv}%` : "", line.price ? `£${line.price}` : "no price set", locationDisplay(beer)].filter(Boolean).join("  ·  ")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1" style={{ minHeight: 22 }}>
        <DietaryMini beer={beer} />
        {showBadge && <span className="max-w-full truncate rounded-full border px-1.5 py-0.5 font-semibold" style={{ fontSize: 10, fontFamily: "var(--font-data)", background: sig.warn ? "#F7E9E7" : C.stone, color: sig.warn ? C.alert : C.inkSoft, borderColor: sig.warn ? "#E8CCC8" : C.line }}>{badgeText}</span>}
      </div>
    </button>
  );
};

const NavButton = ({ id, icon: Icon, label, badge, view, go }) => {
  const active = view === id;
  return (
    <button onClick={() => go(id)} style={active ? { background: C.accent, color: C.cream, fontFamily: "var(--font-data)" } : { color: C.cream, fontFamily: "var(--font-data)" }}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300 ${active ? "" : "hover:opacity-80"}`}>
      <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
      {badge > 0 && <span className="grid place-items-center rounded-full px-1" style={{ height: 15, minWidth: 15, background: active ? C.ink : C.accent, color: active ? C.accentSoft : C.ink, fontSize: 9.5, fontWeight: 700, lineHeight: 1 }}>{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
};

const BottomTab = ({ id, icon: Icon, label, onClick, badge, view, go }) => {
  const active = view === id;
  return (
    <button onClick={onClick || (() => go(id))} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-95 focus:outline-none" style={{ color: active ? C.accent : C.inkSoft }}>
      <span className="relative inline-flex">
        <Icon size={21} />
        {badge > 0 && <span className="absolute grid place-items-center rounded-full px-1" style={{ top: -4, right: -8, height: 14, minWidth: 14, background: C.accent, color: C.ink, fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{badge > 9 ? "9+" : badge}</span>}
      </span>
      <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-data)" }}>{label}</span>
    </button>
  );
};

const fmtBB = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return null; } };
const Row = ({ l, stage, beerById }) => {
  const beer = beerById[l.beerId];
  if (!beer) return null;
  const dt = DRINK_TYPES.find((t) => t.key === l.drinkType)?.label || l.drinkType;
  const bb = fmtBB(l.bestBefore);
  const pump = l.status === "on" && l.slot ? PUMP_LABELS[l.slot] : null;
  return (
    <div className="relative mb-1.5 flex items-start justify-between gap-3 overflow-hidden rounded-lg border py-2 pr-2.5" style={{ background: C.paper, borderColor: C.line, paddingLeft: 20 }}>
      <span aria-hidden="true" title={beer.category || "Misc"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
        <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[beer.category] || CAT_ACCENT.Misc }} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-normal" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{(() => { const t = splitTitle(beer.brewery, beer.name, beer.collabBrewery); return <>{t.lead && <span className="font-semibold" style={{ color: C.ink }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()}</p>
        </div>
        <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[dt, beer.style || "", extraSweetness(beer), beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</p>
        <p className="truncate text-xs text-slate-500" style={{ fontFamily: "var(--font-data)", minHeight: 16 }}>{locationDisplay(beer)}</p>
        <p className="truncate text-xs text-slate-500" style={{ fontFamily: "var(--font-data)", minHeight: 16 }}>{(l.caskOwner && l.drinkType !== "cider" && l.drinkType !== "keykeg") ? `Delivered by: ${l.caskOwner}` : ""}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1" style={{ minHeight: 22 }}><DietaryMini beer={beer} /></div>
      </div>
      <div className="shrink-0 text-right" style={{ fontFamily: "var(--font-data)" }}>
        {pump && <p className="text-xs font-semibold" style={{ color: C.accent }}>{pump}</p>}
        {stage && <p className="text-xs text-slate-500">{stage}</p>}
        {bb && <p className="text-xs text-slate-400">BB {bb}</p>}
      </div>
    </div>
  );
};
const Section = ({ title, items, withStage, beerById }) => items.length ? (
  <div className="mt-4">
    <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.accent }}>{title} · {items.length}</h3>
    <div className="mt-1">{items.map((l) => <Row key={l.id} l={l} stage={withStage ? (STATUS_BY_KEY[l.status] && STATUS_BY_KEY[l.status].label) : null} beerById={beerById} />)}</div>
  </div>
) : null;

const Item = ({ line, beerById }) => {
  const beer = beerById[line.beerId];
  if (!beer) return null;
  const tlp = priceTriple(line.price);
  const diet = [];
  if (isVegan(beer)) diet.push("Vegan");
  if (isGlutenFree(beer)) diet.push(glutenFreeLabel(beer));
  else if (beer.glutenStatus === "Low gluten") diet.push("Low gluten, <20ppm");
  const allergenLine = beer.allergensVerified
    ? (beer.allergens.length ? `Contains: ${beer.allergens.join(", ")}` : "No declared allergens")
    : "Allergens: please ask at the bar";
  return (
    <div className="relative mb-2.5 overflow-hidden rounded-xl border py-3 pr-4" style={{ background: C.paper, borderColor: C.line, paddingLeft: 22, boxShadow: "0 1px 2px rgba(32, 59, 67,0.04), 0 8px 20px -14px rgba(32, 59, 67,0.28)" }}>
      <span aria-hidden="true" title={beer.category || "Misc"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
        <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[beer.category] || CAT_ACCENT.Misc }} />
      </span>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-lg font-normal leading-snug" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{(() => { const t = splitTitle(beer.brewery, beer.name, beer.collabBrewery); return <>{t.lead && <span className="font-semibold">{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()}</p>
        <div className="shrink-0 text-right">
          {(tlp || line.price) ? (
            <p className="text-lg font-semibold leading-tight" style={{ color: C.accent, fontFamily: "var(--font-display)" }}>{tlp ? tlp.pint : `£${line.price}`}</p>
          ) : (
            <p className="text-xs font-medium" style={{ color: C.muted }}>Ask at<br />the bar</p>
          )}
          {tlp && <p className="text-xs leading-tight" style={{ color: C.muted }}>Half {tlp.half}</p>}
          {tlp && <p className="text-xs leading-tight" style={{ color: C.muted }}>Schooner {tlp.schooner}</p>}
        </div>
      </div>
      <p className="mt-0.5 text-sm font-medium" style={{ color: C.inkSoft, fontFamily: "var(--font-data)" }}>{[beer.style, extraSweetness(beer), beer.abv ? `${beer.abv}%` : "", beer.clarity === "Hazy" ? "Hazy" : ""].filter(Boolean).join("  ·  ")}</p>
      {locationDisplay(beer) && <p className="text-xs" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>{locationDisplay(beer)}</p>}
      {beer.notes && <ul className="mt-2 space-y-1">{splitNote(beer.notes).map((n, i) => <li key={i} className="flex gap-1.5 text-sm" style={{ color: C.inkSoft }}><span style={{ color: CAT_ACCENT[beer.category] || CAT_ACCENT.Misc }}>·</span><span>{n}.</span></li>)}</ul>}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2" style={{ borderColor: C.line }}>
        {diet.map((d) => <span key={d} className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(31,107,106,0.10)", color: C.accent }}>{d}</span>)}
        <span className="text-xs" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>{allergenLine}</span>
      </div>
    </div>
  );
};

const EditBeer = ({
  editBeerId, editBeerLineId, beerById, lines, canEdit,
  updateBeer, updateBeerPrice, setCaskOwner, setBestBefore, setLineDrinkType, toggleBeerAllergen,
  autoFillBeer, editBusy, editNote, latestPrice,
  setEditBeerId, setEditBeerLineId, setEditNote,
  deleteBeer, beerIsDeletable, beerArchiveDeletable,
}) => {
  const beer = editBeerId ? beerById[editBeerId] : null;
  const editLine = editBeerLineId ? lines.find((l) => l.id === editBeerLineId) : null;
  const [priceDraft, setPriceDraft] = useState("");
  const [ownerDraft, setOwnerDraft] = useState("");
  const [deleteStage, setDeleteStage] = useState(0);
  const priceTimer = useRef(null);
  const ownerTimer = useRef(null);
  const draftKey = useRef(null);
  const key = beer ? `${beer.id}:${editLine ? editLine.id : ""}` : null;
  if (key && draftKey.current !== key) {
    draftKey.current = key;
    const liveLine0 = lines.find((l) => l.beerId === beer.id && l.status !== "off");
    setPriceDraft(liveLine0 ? (liveLine0.price || "") : (beer.price !== undefined && beer.price !== null ? beer.price : (latestPrice(beer) || "")));
    setOwnerDraft(editLine ? (editLine.caskOwner || "") : "");
    setDeleteStage(0);
  }
  if (!beer || !canEdit) return null;
  const close = () => {
    if (priceTimer.current) { clearTimeout(priceTimer.current); priceTimer.current = null; updateBeerPrice(beer.id, priceDraft); }
    if (ownerTimer.current && editLine) { clearTimeout(ownerTimer.current); ownerTimer.current = null; setCaskOwner(editLine.id, ownerDraft); }
    setEditBeerId(null); setEditBeerLineId(null); setEditNote(null);
  };
  const bb = editLine ? bbStatus(editLine) : null;
  const commitPrice = (v) => {
    setPriceDraft(v);
    if (priceTimer.current) clearTimeout(priceTimer.current);
    priceTimer.current = setTimeout(() => { priceTimer.current = null; updateBeerPrice(beer.id, v); }, 500);
  };
  const commitOwner = (v) => {
    setOwnerDraft(v);
    if (!editLine) return;
    if (ownerTimer.current) clearTimeout(ownerTimer.current);
    ownerTimer.current = setTimeout(() => { ownerTimer.current = null; setCaskOwner(editLine.id, v); }, 500);
  };
  const detailValues = {
    name: beer.name, brewery: beer.brewery, location: beer.location || "", collabBrewery: beer.collabBrewery || "", collabLocation: beer.collabLocation || "", style: beer.style || "", abv: beer.abv || "",
    category: beer.category || "Misc", sweetness: beer.sweetness || "", clarity: beer.clarity || "Clear", glutenStatus: beer.glutenStatus || "Standard",
    vegan: !!beer.vegan, allergens: beer.allergens, allergensVerified: !!beer.allergensVerified, notes: beer.notes || "",
  };
  // Changing a line's drink type is only ever safe In Store or Finished, the two statuses
  // shared by both lifecycle flows with no pump slot attached. Cask has Racked/Vented/Tapped
  // stages keg and cider don't have at all, and a live "on" line's slot belongs to a specific
  // drink type's pump group, so changing type anywhere else would leave the line pointing at a
  // stage or slot that doesn't exist for its new type.
  const typeChangeAllowed = editLine && (editLine.status === "in_cellar" || editLine.status === "off");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(32, 59, 67,0.45)" }} onClick={close}>
      <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "92vh", overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Edit beer details</h2>
          <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4">
          {editLine && (
            <Field label="Type">
              <div className="flex flex-wrap gap-2">
                {DRINK_TYPES.map((t) => (
                  <button key={t.key} disabled={!typeChangeAllowed} onClick={() => typeChangeAllowed && setLineDrinkType(editLine.id, t.key)}
                    className="rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    style={editLine.drinkType === t.key ? { background: C.ink, color: "#fff", borderColor: C.ink } : { borderColor: C.line, color: C.inkSoft }}>{t.label}</button>
                ))}
              </div>
              {!typeChangeAllowed && <p className="mt-1.5 text-xs text-slate-400">Only changeable while In Store or Finished. Racked, Vented, Tapped and Pouring all depend on knowing the type correctly, since cask, keg and cider each use their own pumps and stages.</p>}
            </Field>
          )}
          <BeerDetailsFields key={beer.id} values={detailValues} onChange={(patch) => updateBeer(beer.id, patch)} onAutoFill={() => autoFillBeer(beer)} busy={editBusy} note={editNote} toggleAllergen={(a) => toggleBeerAllergen(beer.id, a)} />
          <Field label="Price (£ per pint)"><input className={inputCls} inputMode="decimal" value={priceDraft} onChange={(e) => commitPrice(e.target.value)} placeholder="e.g. 4.40" /></Field>
          {editLine && (
            <>
              <Field label="Best before">
                <span className="relative block">
                  <input type="date" value={editLine.bestBefore || ""} onChange={(e) => setBestBefore(editLine.id, e.target.value)} className={inputCls} style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light", textAlign: "left", ...(bb && bb.level === "past" ? { borderColor: C.alert, color: C.alert } : {}) }} />
                  {!editLine.bestBefore && <span className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm text-slate-400">Tap to set</span>}
                </span>
              </Field>
              {editLine.drinkType !== "cider" && editLine.drinkType !== "keykeg" && (
                <Field label="Delivered by"><input className={inputCls} value={ownerDraft} onChange={(e) => commitOwner(e.target.value)} placeholder="Brewery / distributor" /></Field>
              )}
            </>
          )}
          <button onClick={() => { updateBeer(beer.id, { archived: !beer.archived }); close(); }} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>
            <Package size={15} /> {beer.archived ? "Restore from archive" : "Archive this beer"}
          </button>
          {!beer.archived && <p className="text-xs text-slate-400">Archiving hides it from your library and search without deleting its history. You can restore it any time.</p>}
          {beerIsDeletable(beer) ? (
            deleteStage > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                <p className="text-xs text-red-800">This beer has never been stocked, so nothing will be lost. Delete it?</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => deleteBeer(beer.id)} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">Delete now</button>
                  <button onClick={() => setDeleteStage(0)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setDeleteStage(1)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300">
                <Trash2 size={15} /> Delete this beer
              </button>
            )
          ) : beer.archived && beerArchiveDeletable(beer) ? (
            deleteStage === 1 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                <p className="text-xs text-red-800">This also permanently erases its full price and stocking history. This can't be undone after a few seconds.</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setDeleteStage(2)} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">Continue</button>
                  <button onClick={() => setDeleteStage(0)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
                </div>
              </div>
            ) : deleteStage === 2 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                <p className="text-xs font-semibold text-red-800">Are you sure? This is permanent.</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => deleteBeer(beer.id)} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">Yes, delete permanently</button>
                  <button onClick={() => setDeleteStage(0)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setDeleteStage(1)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300">
                <Trash2 size={15} /> Delete from archive
              </button>
            )
          ) : null}
          <button onClick={close} className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}>Done</button>
        </div>
      </div>
    </div>
  );
};

function TheCurfewCellarApp() {
  const [library, setLibrary] = useState(seedLibrary);
  const [lines, setLines] = useState(() => assignPumps(seedLines, catFromLib(seedLibrary)));
  const [view, setView] = useState("cellar");
  const [form, setForm] = useState(emptyForm);
  const [fillNote, setFillNote] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [libraryOpenId, setLibraryOpenId] = useState(null);
  const [editBeerId, setEditBeerId] = useState(null);
  const [editBeerLineId, setEditBeerLineId] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [swap, setSwap] = useState(null);
  const [swapPreviewId, setSwapPreviewId] = useState(null);
  const [prefs, setPrefs] = useState({});
  const [uiPrefs, setUiPrefs] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = localStorage.getItem("curfew-cellar:ui-prefs:v1");
        if (raw) return { on: true, racked: true, store: false, empties: {}, libRecent: true, libAll: false, libArchived: false, ...JSON.parse(raw) };
      }
    } catch (e) { }
    return { on: true, racked: true, store: false, empties: {}, libRecent: true, libAll: false, libArchived: false };
  });
  useEffect(() => {
    try { if (typeof window !== "undefined" && window.localStorage) localStorage.setItem("curfew-cellar:ui-prefs:v1", JSON.stringify(uiPrefs)); } catch (e) { }
  }, [uiPrefs]);
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString());
  const lastUpdatedRef = useRef(lastUpdated);
  const bumpReady = useRef(false);
  const skipBump = useRef(false);
  const cloudMode = typeof window !== "undefined" && !window.storage;
  const [authed, setAuthed] = useState(!cloudMode);
  const [role, setRole] = useState("manager");
  const canService = role === "manager" || role === "staff";
  const canEdit = role === "manager";
  const [authChecking, setAuthChecking] = useState(cloudMode);
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(!cloudMode);
  const [cloudLoadError, setCloudLoadError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const toggleSection = (k) => setUiPrefs((p) => ({ ...p, [k]: !p[k] }));
  const [loading, setLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [cellarSearch, setCellarSearch] = useState("");
  const [duplicateResults, setDuplicateResults] = useState(null);
  const [combineCandidate, setCombineCandidate] = useState(null);
  const [combineKeepId, setCombineKeepId] = useState(null);
  const [clashResults, setClashResults] = useState(null);
  const [newDistributor, setNewDistributor] = useState("");
  const [historyOpen, setHistoryOpen] = useState({});
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [undoState, setUndoState] = useState(null);
  const undoTimer = useRef(null);
  const [importText, setImportText] = useState("");
  const [backupMsg, setBackupMsg] = useState(null);
  const [confirmCacheReset, setConfirmCacheReset] = useState(false);
  const [cacheResetMsg, setCacheResetMsg] = useState(null);
  const [historyList, setHistoryList] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmSnapshotId, setConfirmSnapshotId] = useState(null);
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
  const [lineCare, setLineCare] = useState({});
  const lineCleanInfo = (slot) => {
    const last = lineCare[slot];
    if (!last) return { never: true, days: null, overdue: true };
    const days = dayDiff(last, new Date().toISOString());
    return { never: false, days, overdue: days >= PUB_CONFIG.lineCleanDays };
  };
  const linesDueClean = () => ALL_PUMPS.filter((p) => lineCleanInfo(p).overdue).length;
  const [invoiceItems, setInvoiceItems] = useState(null);
  const [invoiceOwner, setInvoiceOwner] = useState("");
  const labelRef = useRef(null);
  const invoiceRef = useRef(null);
  const scrollAreaRef = useRef(null);

  const beerById = useMemo(() => Object.fromEntries(library.map((b) => [b.id, b])), [library]);

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

  const attentionItems = useMemo(() => {
    const out = [];
    lines.filter((l) => l.status !== "off").forEach((l) => {
      const beer = beerById[l.beerId]; if (!beer) return;
      const nm = `${beer.brewery ? beer.brewery + " - " : ""}${beer.name}`;
      const servable = l.status === "on" || l.status === "tapped";
      const bb = bbStatus(l);
      if (bb && bb.level === "past") out.push({ pri: 1, id: l.id, warn: true, text: `${nm}: best before has passed` });
      else if (bb && bb.level === "soon") out.push({ pri: 4, id: l.id, warn: true, text: `${nm}: best before ${daysUntil(l.bestBefore) === 0 ? "today" : `in ${daysUntil(l.bestBefore)}d`}` });
      const f = freshness(l);
      if (l.status === "on" && f && f.level === "check") out.push({ pri: 6, id: l.id, warn: false, text: `${nm}: on for ${daysOn(l)} days, check quality` });
      if (l.status === "vented" && l.dates.vented && dayDiff(l.dates.vented, new Date().toISOString()) >= 2) out.push({ pri: 5, id: l.id, warn: false, text: `${nm}: vented ${dayDiff(l.dates.vented, new Date().toISOString())}d ago, ready to tap` });
      if (servable && !beer.allergensVerified) out.push({ pri: 2, id: l.id, warn: true, text: `${nm}: allergens not verified` });
      else if (servable && beer.allergens.length === 0) out.push({ pri: 3, id: l.id, warn: true, text: `${nm}: verified with no allergens listed, worth double-checking` });
      if (servable && !l.price) out.push({ pri: 2, id: l.id, warn: true, text: `${nm}: no price set` });
      if (servable && veganClaimConflict(beer)) out.push({ pri: 1, id: l.id, warn: true, text: `${nm}: marked vegan but isinglass or milk is listed, these aren't compatible` });
    });
    const dueClean = linesDueClean();
    if (dueClean) out.push({ pri: 6, id: null, lineCare: true, warn: false, text: `${dueClean} line${dueClean === 1 ? "" : "s"} due a clean` });
    const backupAge = prefs.lastBackup ? dayDiff(prefs.lastBackup, new Date().toISOString()) : null;
    if (lines.length > 3 && (backupAge === null || backupAge > 30)) out.push({ pri: 7, id: null, warn: false, backup: true, text: backupAge === null ? "No backup saved yet. Takes ten seconds" : `Last backup ${backupAge} days ago. Worth a fresh one` });
    return out.sort((a, b) => a.pri - b.pri);
  }, [lines, beerById, prefs.lastBackup, lineCare]);

  const [pushState, setPushState] = useState("checking");
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
      try { localStorage.setItem("cc-push-endpoint", sub.endpoint); } catch (e) { }
      setPushState("on");
      showToast("Notifications are on for this phone.");
    } catch (e) {
      showToast("Could not turn notifications on just now. Check your connection and try again.");
    } finally { setPushBusy(false); }
  };
  const disablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try { const c = await _client(); await c.from("push_subs").delete().eq("endpoint", sub.endpoint); } catch (e) { }
        await sub.unsubscribe();
      }
      try { localStorage.removeItem("cc-push-endpoint"); } catch (e) { }
      setPushState("off");
      showToast("Notifications are off for this phone.");
    } catch (e) {
      showToast("Could not turn notifications off just now. Check your connection and try again.");
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
        try { exclude = localStorage.getItem("cc-push-endpoint"); } catch (e) { }
        await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, title, body, tag: "curfew-pump", exclude }) });
      } catch (e) { }
    })();
  };

  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));
  const findSavedBeer = (brewery, name) =>
    library.find((b) => breweryCore(b.brewery) === breweryCore(brewery) && normalizeForMatch(b.name) === normalizeForMatch(name));

  const migrate = (json) => normaliseData(JSON.parse(json));
  const applyData = (data, remote) => {
    if (!data) return;
    if (remote) skipBump.current = true;
    if (Array.isArray(data.library)) setLibrary(data.library);
    if (Array.isArray(data.lines)) { const lib = Array.isArray(data.library) ? data.library : library; setLines(assignPumps(data.lines.map((l) => l.status === "en_route" ? { ...l, status: "in_cellar", dates: { ...l.dates, delivered: l.dates && l.dates.delivered ? l.dates.delivered : (l.dates && l.dates.ordered) || new Date().toISOString() } } : l), catFromLib(lib))); }
    if (Array.isArray(data.distributors)) setDistributors(data.distributors);
    if (data.lineCare && typeof data.lineCare === "object") setLineCare(data.lineCare);
    if (data.prefs && data.prefs.lastBackup) setPrefs((p) => ({ ...p, lastBackup: data.prefs.lastBackup }));
    if (data.lastUpdated) { lastUpdatedRef.current = data.lastUpdated; setLastUpdated(data.lastUpdated); }
  };

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

  useEffect(() => {
    if (!cloudMode) return;
    let cancelled = false;
    (async () => { const s = await store.session(); if (!cancelled) { setAuthed(!!s); setRole(roleFromSession(s)); setAuthChecking(false); } })();
    return () => { cancelled = true; };
  }, []);

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
      } catch (e) { }
      if (attempt < 3) await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
    setCloudLoadError(true);
    return false;
  };
  useEffect(() => {
    if (!cloudMode || !authed) return;
    let cancelled = false;
    let channel = null;
    (async () => {
      const ok = await loadCellar();
      if (!cancelled && ok) channel = await store.subscribe((j) => {
        try {
          const data = migrate(j);
          const remoteAt = data && data.lastUpdated ? Date.parse(data.lastUpdated) : 0;
          const localAt = lastUpdatedRef.current ? Date.parse(lastUpdatedRef.current) : 0;
          if (!remoteAt || (localAt && remoteAt <= localAt)) return;
          applyData(data, true);
        } catch (e) { }
      });
    })();
    return () => {
      cancelled = true;
      if (channel) _client().then((c) => c.removeChannel(channel)).catch(() => {});
    };
  }, [authed]);

  const lastRefetch = useRef(0);
  useEffect(() => {
    if (!cloudMode || !authed || !cloudReady) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (saveTimer.current || saveInFlight.current) return;
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
    if (err) { setAuthBusy(false); setAuthErr(err); return; }
    const s = await store.session();
    setRole(roleFromSession(s));
    setAuthBusy(false);
    setPw(""); setAuthed(true);
  };
  const lock = async () => { try { await store.signOut(); } catch (e) { } setView("cellar"); setOpenId(null); setAuthed(false); };

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
      if (!(e && e.name === "AbortError")) { try { doc.save(fname); } catch (e2) { } }
    }
  };

  const sharePDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ink = [32, 59, 67], accent = [31, 107, 106], accentSoft = [86, 139, 137], gray = [86, 111, 118], graySky = [58, 75, 80], lineCol = [224, 218, 212], paleBg = [249, 246, 243];
      const lerp3 = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
      const skyAt = (t) => {
        const stops = [[0, [138, 207, 206]], [0.4, [233, 233, 230]], [1, [246, 237, 229]]];
        for (let i = 0; i < stops.length - 1; i++) {
          if (t <= stops[i + 1][0]) { const u = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]); return lerp3(stops[i][1], stops[i + 1][1], u); }
        }
        return stops[stops.length - 1][1];
      };
      const paintPageBackground = () => { for (let py = 0; py < H; py += 1) { const c = skyAt(py / H); doc.setFillColor(c[0], c[1], c[2]); doc.rect(0, py, W, 1.05, "F"); } };
      paintPageBackground();
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); paintPageBackground(); y = M; } };
      const fmtD = (d) => { if (!d) return ""; try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return ""; } };
      const cmpBB = (a, b) => { const da = a.bestBefore ? new Date(a.bestBefore).getTime() : Infinity; const db = b.bestBefore ? new Date(b.bestBefore).getTime() : Infinity; return da - db; };
      const money2 = (v) => { const n = parseFloat(v); return isNaN(n) ? "" : `£${n.toFixed(2)}`; };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(243, 239, 230);
      doc.text(PUB_CONFIG.name, M, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(accentSoft[0], accentSoft[1], accentSoft[2]);
      doc.text(`${PUB_CONFIG.typeLabel.toUpperCase()} · STOCK LIST`, M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 14, { align: "right" });
      const counts = `${lines.filter((l) => l.status === "on").length} on  ·  ${lines.filter((l) => ["tapped", "vented", "racked"].includes(l.status)).length} in cellar  ·  ${lines.filter((l) => l.status === "in_cellar").length} in store`;
      doc.text(counts, W - M, 20.5, { align: "right" });
      y = 36;

      const sectionHead = (t, n) => {
        ensure(16);
        y += 4;
        doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(M, y - 4, 2.2, 5.2, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(t, M + 4.5, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(graySky[0], graySky[1], graySky[2]);
        doc.text(String(n), W - M, y, { align: "right" });
        y += 5.5;
      };
      const subHead = (t) => { ensure(11); y += 3.5; doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(accent[0], accent[1], accent[2]); doc.text(t.toUpperCase(), M, y); y += 4.8; };
      const catHead = (t) => { ensure(9); y += 2.4; doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(graySky[0], graySky[1], graySky[2]); doc.text(t, M + 3, y); y += 4.2; };

      const beerLine = (l, opts) => {
        const o = opts || {};
        const b = beerById[l.beerId]; if (!b) return;
        const nameParts = splitTitle(b.brewery, b.name, b.collabBrewery);
        const name = nameParts.lead ? `${nameParts.lead} ${nameParts.rest}` : nameParts.rest;
        const dt = (DRINK_TYPES.find((t) => t.key === l.drinkType) || {}).label || l.drinkType;
        const meta = [dt, b.style, b.abv ? b.abv + "%" : "", locationDisplay(b), (l.caskOwner && l.drinkType !== "cider" && l.drinkType !== "keykeg") ? `Delivered by: ${l.caskOwner}` : ""].filter(Boolean).join("  ·  ");
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
        doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(M, y, 2.1, rowH, "F");
        const ac = hex(CAT_ACCENT[b.category] || CAT_ACCENT.Misc); doc.setFillColor(ac[0], ac[1], ac[2]); doc.rect(M + 0.45, y, 1.55, rowH, "F");

        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(metaLines, M + 4.5, ty); ty += lhMeta * metaLines.length;
        if (hasBB) { doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(178, 58, 44); doc.text(`Best before ${fmtD(l.bestBefore)}`, M + 4.5, ty); }

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
        onL.forEach((l) => beerLine(l, { pill: (l.status === "on" && l.slot) ? PUMP_LABELS[l.slot] : null }));
        y += 1.5;
      }
      if (prep.length) {
        sectionHead("In cellar", prep.length);
        prep.forEach((l) => beerLine(l, { pill: (STATUS_BY_KEY[l.status] && STATUS_BY_KEY[l.status].label) || null }));
        y += 1.5;
      }
      if (storeL.length) {
        sectionHead("In store", storeL.length);
        [["cask", "Cask"], ["keg", "Keg"], ["cider", "Cider"]].forEach(([dt, label]) => {
          const items = dt === "keg" ? storeL.filter((l) => PUMP_DRINK(l.drinkType) === "keg") : storeL.filter((l) => l.drinkType === dt);
          if (!items.length) return;
          subHead(label);
          if (dt === "cask") {
            caskCategoryGroups(items, (l) => (beerById[l.beerId] && beerById[l.beerId].category) || "Misc").forEach(({ cat, items: sub }) => {
              catHead(cat); sub.slice().sort(cmpBB).forEach((l) => beerLine(l, {}));
            });
          } else {
            items.slice().sort(cmpBB).forEach((l) => beerLine(l, {}));
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

      const fname = `${PUB_CONFIG.slug}-stock-list.pdf`;
      const blob = doc.output("blob");
      try {
        const file = new File([blob], fname, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `${PUB_CONFIG.shortName} stock list` });
        } else {
          doc.save(fname);
        }
      } catch (e) {
        if (!(e && e.name === "AbortError")) { try { doc.save(fname); } catch (e2) { } }
      }
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const shareTapListPDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const ink = [32, 59, 67], accent = [31, 107, 106], accentSoft = [86, 139, 137], gray = [86, 111, 118], lineCol = [224, 218, 212], paleBg = [249, 246, 243];
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(243, 239, 230);
      doc.text(PUB_CONFIG.name, M, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(accentSoft[0], accentSoft[1], accentSoft[2]);
      doc.text(`${PUB_CONFIG.typeLabel.toUpperCase()} · WHAT'S ON TODAY`, M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 14, { align: "right" });
      y = 36;

      const sectionHead = (t) => { ensure(16); y += 4; doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(M, y - 4, 2.2, 5.2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(t, M + 4.5, y); y += 5.5; };
      const catHead = (t) => { ensure(9); y += 2.4; doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text(t, M + 3, y); y += 4.2; };

      const beerLine = (l, accentRGB) => {
        const b = beerById[l.beerId]; if (!b) return;
        const nameParts = splitTitle(b.brewery, b.name, b.collabBrewery);
        const name = nameParts.lead ? `${nameParts.lead} ${nameParts.rest}` : nameParts.rest;
        const tlp = priceTriple(l.price);
        const meta = [b.style, b.abv ? b.abv + "%" : "", b.clarity === "Hazy" ? "Hazy" : "", locationDisplay(b)].filter(Boolean).join("  ·  ");
        const diet = [isVegan(b) ? "Vegan" : "", isGlutenFree(b) ? glutenFreeLabel(b) : b.glutenStatus === "Low gluten" ? "Low gluten, <20ppm" : ""].filter(Boolean).join("  ·  ");
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
        doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(M, y, 2.1, rowH, "F");
        doc.setFillColor(accentRGB[0], accentRGB[1], accentRGB[2]); doc.rect(M + 0.45, y, 1.55, rowH, "F");

        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(metaLines, M + 4.5, ty); ty += lhMeta * metaLines.length;
        if (noteLines.length) { doc.setFont("helvetica", "italic"); doc.setFontSize(7.6); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text(noteLines, M + 4.5, ty); ty += lhNote * noteLines.length; }
        if (diet) { doc.setFont("helvetica", "bold"); doc.setFontSize(7.4); doc.setTextColor(accent[0], accent[1], accent[2]); doc.text(diet, M + 4.5, ty); ty += lhDiet; }
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(allergenLines, M + 4.5, ty);

        if (tlp) {
          const rx = W - M - 3;
          doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(accent[0], accent[1], accent[2]);
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
        caskCategoryGroups(cask, (l) => (beerById[l.beerId] && beerById[l.beerId].category) || "Misc").forEach(({ cat, items }) => {
          catHead(cat); items.forEach((l) => beerLine(l, hex(CAT_ACCENT[cat] || "#7C8F96")));
        });
        y += 1;
      }
      if (keg.length) { sectionHead("Keg"); keg.forEach((l) => beerLine(l, hex(TYPE_ACCENT[l.drinkType] || "#1F6B6A"))); y += 1; }
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
      await sharePdfDoc(doc, `${PUB_CONFIG.slug}-tap-list.pdf`, `${PUB_CONFIG.shortName} tap list`);
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const shareGuidePDF = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const JsPDF = await _loadJsPDF();
      if (!JsPDF) throw new Error("no pdf lib");
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14; let y = M;
      const ink = [32, 59, 67], accentSoft = [86, 139, 137], gray = [86, 111, 118];
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(243, 239, 230);
      doc.text("How to Use The Curfew Cellar", M, 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(accentSoft[0], accentSoft[1], accentSoft[2]);
      doc.text(`${PUB_CONFIG.fullName.toUpperCase()} · STAFF GUIDE`, M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 13, { align: "right" });
      y = 36;

      GUIDE_SECTIONS.forEach((sec) => {
        ensure(18);
        doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(sec.title, M, y); y += 2.5;
        doc.setDrawColor(accentSoft[0], accentSoft[1], accentSoft[2]); doc.setLineWidth(0.5);
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

      await sharePdfDoc(doc, "curfew-cellar-guide.pdf", "How to Use The Curfew Cellar");
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
      const ink = [32, 59, 67], accent = [31, 107, 106], accentSoft = [86, 139, 137], gray = [86, 111, 118], lineCol = [224, 218, 212], paleBg = [249, 246, 243];
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(243, 239, 230);
      doc.text("Allergen and Dietary Guide", M, 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(accentSoft[0], accentSoft[1], accentSoft[2]);
      doc.text(`${PUB_CONFIG.fullName.toUpperCase()} · PLEASE CONFIRM WITH STAFF BEFORE ORDERING`, M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 13, { align: "right" });
      y = 36;

      const sectionHead = (t) => { ensure(16); y += 4; doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(M, y - 4, 2.2, 5.2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(t, M + 4.5, y); y += 5.5; };

      const beerLine = (l, accentRGB) => {
        const b = beerById[l.beerId]; if (!b) return;
        const nameParts = splitTitle(b.brewery, b.name, b.collabBrewery);
        const name = nameParts.lead ? `${nameParts.lead} ${nameParts.rest}` : nameParts.rest;
        const diet = [isVegan(b) ? "Vegan" : "", isGlutenFree(b) ? glutenFreeLabel(b) : b.glutenStatus === "Low gluten" ? "Low gluten, <20ppm" : ""].filter(Boolean).join("  ·  ");
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
        doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(M, y, 2.1, rowH, "F");
        doc.setFillColor(accentRGB[0], accentRGB[1], accentRGB[2]); doc.rect(M + 0.45, y, 1.55, rowH, "F");

        let ty = y + topPad;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(nameLines, M + 4.5, ty); ty += lhName * nameLines.length;
        const rx = W - M - 3;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(`${b.abv ? b.abv + "%" : ""}`, rx, y + topPad, { align: "right" });
        if (dietLines.length) { doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(accent[0], accent[1], accent[2]); doc.text(dietLines, M + 4.5, ty); ty += lhDiet * dietLines.length; }
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.4);
        if (b.allergensVerified) doc.setTextColor(gray[0], gray[1], gray[2]); else doc.setTextColor(178, 58, 44);
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
        items.forEach((l) => beerLine(l, hex(TYPE_ACCENT[l.drinkType] || "#1F6B6A")));
      });
      if (!onL.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text("Nothing on right now.", M, y); }

      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(lineCol[0], lineCol[1], lineCol[2]); doc.line(M, H - 10, W - M, H - 10);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text(`Page ${p} of ${pageCount}`, W - M, H - 6, { align: "right" });
      }
      await sharePdfDoc(doc, `${PUB_CONFIG.slug}-allergen-guide.pdf`, `${PUB_CONFIG.shortName} allergen guide`);
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

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
          const r = await store.set(STORE_KEY, JSON.stringify({ library, lines, distributors, lineCare, prefs, lastUpdated }), false);
          if (r && r.conflict) { applyData(migrate(r.remoteValue), true); showToast("Another phone saved changes just before yours. Showing the latest, please redo your last change."); }
        } catch (e) { }
        finally { saveInFlight.current = false; }
      })();
    }, 500);
    return () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } };
  }, [library, lines, distributors, lineCare, prefs, lastUpdated, hydrated, storageOk, authed, cloudReady]);

  const pendingSnapshot = useRef(null);
  useEffect(() => { pendingSnapshot.current = { library, lines, distributors, lineCare, prefs, lastUpdated }; }, [library, lines, distributors, lineCare, prefs, lastUpdated]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const flush = () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current); saveTimer.current = null;
      if (!store || storageOk !== true || (cloudMode && (!authed || !cloudReady))) return;
      try { store.set(STORE_KEY, JSON.stringify(pendingSnapshot.current), false); } catch (e) { }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", flush); };
  }, [store, storageOk, cloudMode, authed, cloudReady]);

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

  useEffect(() => {
    if (!hydrated) return;
    if (skipBump.current) { skipBump.current = false; return; }
    if (!bumpReady.current) { bumpReady.current = true; return; }
    const now = new Date().toISOString();
    lastUpdatedRef.current = now;
    setLastUpdated(now);
  }, [lines, library, lineCare, distributors, hydrated]);

  const topModal = () => {
    if (combineCandidate) return "combine";
    if (editBeerId) return "editBeer";
    if (openId || libraryOpenId) return "cardModal";
    if (swap) return "swap";
    if (showAlerts) return "alerts";
    if (menuOpen) return "menu";
    return null;
  };
  const closeTopModal = () => {
    const top = topModal();
    if (top === "combine") { setCombineCandidate(null); setCombineKeepId(null); }
    else if (top === "editBeer") { setEditBeerId(null); setEditBeerLineId(null); setEditNote(null); }
    else if (top === "cardModal") { setOpenId(null); setLibraryOpenId(null); }
    else if (top === "swap") { setSwap(null); setSwapPreviewId(null); }
    else if (top === "alerts") setShowAlerts(false);
    else if (top === "menu") setMenuOpen(false);
  };
  useEffect(() => {
    if (!topModal() || typeof document === "undefined") return;
    const onKey = (e) => { if (e.key === "Escape") closeTopModal(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [openId, libraryOpenId, editBeerId, swap, showAlerts, menuOpen, combineCandidate]);

  const modalHistoryRef = useRef(false);
  useEffect(() => {
    const isOpen = !!topModal();
    if (isOpen && !modalHistoryRef.current) {
      window.history.pushState({ ccModal: true }, "");
      modalHistoryRef.current = true;
    } else if (!isOpen && modalHistoryRef.current) {
      modalHistoryRef.current = false;
      window.history.back();
    }
  }, [openId, libraryOpenId, editBeerId, swap, showAlerts, menuOpen, combineCandidate]);
  useEffect(() => {
    const onPopState = () => {
      if (modalHistoryRef.current) { modalHistoryRef.current = false; closeTopModal(); }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const carriedPriceAppliedRef = useRef(null);
  useEffect(() => {
    if (view !== "add" || addMode !== "form") { carriedPriceAppliedRef.current = null; return; }
    if (!form.brewery.trim() || !form.name.trim()) { carriedPriceAppliedRef.current = null; return; }
    const known = findSavedBeer(form.brewery, form.name);
    if (!known) { carriedPriceAppliedRef.current = null; return; }
    if (carriedPriceAppliedRef.current === known.id) return;
    carriedPriceAppliedRef.current = known.id;
    if (!form.price.trim()) {
      const carried = latestPrice(known);
      if (carried) setF({ price: carried });
    }
  }, [form.brewery, form.name, view, addMode]);


  useEffect(() => {
    if (typeof document === "undefined") return;
    let m = document.querySelector('meta[name="viewport"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "viewport"); document.head.appendChild(m); }
    m.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  }, []);

  const exportData = () => JSON.stringify({ app: "thecurfewcellar", version: 1, exportedAt: new Date().toISOString(), library, lines, distributors, lineCare, prefs }, null, 2);
  const noteBackupTaken = () => {
    const stamp = new Date().toISOString();
    const nextPrefs = { ...prefs, lastBackup: stamp };
    setPrefs(nextPrefs);
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (store && storageOk === true && (!cloudMode || (authed && cloudReady))) {
      (async () => { try { await store.set(STORE_KEY, JSON.stringify({ library, lines, distributors, lineCare, prefs: nextPrefs, lastUpdated }), false); } catch (e) { } })();
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
      setPendingImport({ library: data.library, lines: data.lines, distributors: data.distributors, lineCare: data.lineCare, prefs: data.prefs });
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
  const applyBackupData = (data) => {
    const cleaned = normaliseData({ library: data.library, lines: data.lines });
    setLibrary(cleaned.library); setLines(assignPumps(cleaned.lines, catFromLib(cleaned.library)));
    if (Array.isArray(data.distributors)) setDistributors(data.distributors);
    if (data.lineCare && typeof data.lineCare === "object") setLineCare(data.lineCare);
    if (data.prefs && typeof data.prefs === "object" && data.prefs.lastBackup) setPrefs((p) => ({ ...p, lastBackup: data.prefs.lastBackup }));
    setOpenId(null); setHistoryOpen({}); setView("cellar");
  };
  const confirmImport = () => {
    if (!pendingImport) return;
    applyBackupData(pendingImport);
    setPendingImport(null); setImportText("");
    setBackupMsg({ type: "ok", text: "Backup imported." });
  };
  const loadHistory = async () => {
    setHistoryLoading(true);
    const rows = await store.fetchHistory(15);
    setHistoryList(rows || []);
    setHistoryLoading(false);
  };
  const restoreSnapshot = (row) => {
    applyBackupData(row.data);
    setConfirmSnapshotId(null);
    setHistoryList(null);
    showToast(`Restored the cellar to how it looked at ${fmtUpdated(row.created_at)}.`);
  };

  const autoFill = async () => {
    if (!form.name.trim()) { setFillNote({ type: "warn", text: "Add a name first." }); return; }
    setLoading(true);
    setFillNote({ type: "loading", text: "Filling in a draft…" });
    const isCider = form.drinkType === "cider";
    const prompt = buildAutofillPrompt(form.brewery, form.name, isCider);
    let stage = "network";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: await authedFetchHeaders(),
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
        const m = text.match(/\{[\s\S]*\}/);
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
        glutenStatus: (form.glutenStatus && form.glutenStatus !== "Standard") ? form.glutenStatus : (GLUTEN_AI_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard"),
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
      const fbStyle = form.style.trim() ? form.style : d.style;
      const fbAbv = form.abv.trim() ? form.abv : d.abv;
      setF({
        style: fbStyle,
        abv: fbAbv,
        clarity: form.clarity ? form.clarity : d.clarity,
        glutenStatus: (form.glutenStatus && form.glutenStatus !== "Standard") ? form.glutenStatus : d.glutenStatus,
        allergens: form.allergens.length ? form.allergens : d.allergens,
        notes: form.notes.trim() ? form.notes : d.notes,
        category: deriveCategory(form.drinkType, fbStyle, fbAbv),
        sweetness: form.sweetness ? form.sweetness : (d.sweetness || form.sweetness),
      });
      const msg = stage === "parse"
        ? "The draft came back in an odd format, so a quick local one was used instead. Try again, or just check the details."
        : "Couldn't reach the lookup service just now. A quick local draft was used, so double-check the details.";
      setFillNote({ type: "warn", text: msg });
    } finally { setLoading(false); }
  };

  const toggleAllergen = (a) => setF({ allergens: form.allergens.includes(a) ? form.allergens.filter((x) => x !== a) : [...form.allergens, a] });

  const addLine = () => {
    if (!form.brewery.trim() || !form.name.trim()) { setFillNote({ type: "warn", text: "Producer/brewery and name are required." }); return; }
    if (form.status === "on") {
      const drinkGroup = PUMP_DRINK(form.drinkType);
      const onCount = lines.filter((l) => l.status === "on" && PUMP_DRINK(l.drinkType) === drinkGroup).length;
      if (onCount >= PUMPS[drinkGroup].length) {
        const label = drinkGroup === "cask" ? "cask" : drinkGroup === "keg" ? "keg" : "cider";
        setFillNote({ type: "warn", text: `All ${label} pumps are full (${onCount}/${PUMPS[drinkGroup].length}). Add it as In Store instead, or finish one first.` });
        return;
      }
    }
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
      brewery: form.brewery.trim(), location: form.location.trim(), collabBrewery: form.collabBrewery.trim(), collabLocation: form.collabLocation.trim(), name: form.name.trim(),
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
    const addedAt = new Date().toISOString();
    dates.delivered = addedAt;
    dates[STATUSES[STATUS_INDEX[form.status]].dateKey] = addedAt;
    const id = uid();
    setLines((ls) => [...ls, { id, beerId, drinkType: form.drinkType, size: form.size, price: form.price.trim(), status: form.status, caskOwner: form.caskOwner.trim() || form.brewery.trim(), collected: false, bestBefore: form.bestBefore, dates }]);
    if (form.caskOwner.trim()) addDistributor(form.caskOwner.trim());
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
      if (nk === "on" && !freePumpFor(lines, before, id)) {
        const drinkGroup = PUMP_DRINK(before.drinkType);
        const label = drinkGroup === "cask" ? "cask" : drinkGroup === "keg" ? "keg" : "cider";
        showToast(`All ${label} pumps are full. Finish one first.`);
        return;
      }
      const b = beerById[before.beerId];
      const nm = b ? `${b.brewery ? b.brewery + " - " : ""}${b.name}` : "A beer";
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
    if (nextKey === "on" && !slot) return ls;
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
  // Only safe while In Store or Finished, see the note in EditBeer for the full reasoning:
  // Racked/Vented/Tapped only exist in the cask flow, and a live pump slot belongs to a
  // specific drink type's pump group. The UI only offers this control in those two states,
  // this check is a backstop, not the only guard.
  const setLineDrinkType = (id, newType) => {
    const line = lines.find((l) => l.id === id);
    if (!line || (line.status !== "in_cellar" && line.status !== "off") || line.drinkType === newType) return;
    const wasCider = line.drinkType === "cider", isCider = newType === "cider";
    setLines((ls) => ls.map((c) => (c.id === id ? { ...c, drinkType: newType, slot: null } : c)));
    // Category only genuinely depends on drink type at the cider boundary: cider always gets
    // its own category regardless of style, cask and keg both derive it from style identically.
    if (wasCider !== isCider) {
      const beer = beerById[line.beerId];
      if (beer) updateBeer(beer.id, { category: deriveCategory(newType, beer.style, beer.abv) });
    }
  };
  const finishAndChoose = (line) => {
    const beer = beerById[line.beerId];
    sendCellarPush("Line finished", beer ? `${beer.brewery ? beer.brewery + " - " : ""}${beer.name}` : "A beer");
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
      const nb = (() => { const l = lines.find((c) => c.id === newId); const b = l && beerById[l.beerId]; return b ? `${b.brewery ? b.brewery + " - " : ""}${b.name}` : "A beer"; })();
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
  const updateBeerPrice = (id, v) => {
    setLibrary((lib) => lib.map((b) => {
      if (b.id !== id) return b;
      const h = b.history || [];
      const history = h.length ? [...h.slice(0, -1), { ...h[h.length - 1], price: v }] : h;
      return { ...b, price: v, history };
    }));
    setLines((ls) => ls.map((c) => (c.beerId === id && c.status !== "off" ? { ...c, price: v } : c)));
  };
  const toggleBeerAllergen = (id, a) => setLibrary((lib) => lib.map((b) => (b.id === id ? { ...b, allergens: b.allergens.includes(a) ? b.allergens.filter((x) => x !== a) : [...b.allergens, a] } : b)));

  const autoFillBeer = async (beer) => {
    if (!beer.name || !beer.name.trim()) { setEditNote({ type: "warn", text: "Add a name first." }); return; }
    setEditBusy(true); setEditNote({ type: "loading", text: "Filling in a draft…" });
    const isCider = /cider|perry/i.test(`${beer.style || ""} ${beer.name || ""}`);
    const prompt = buildAutofillPrompt(beer.brewery, beer.name, isCider);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: await authedFetchHeaders(),
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
        glutenStatus: (beer.glutenStatus && beer.glutenStatus !== "Standard") ? beer.glutenStatus : (GLUTEN_AI_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard"),
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
  const duplicateLine = (id) => {
    const src = lines.find((c) => c.id === id);
    if (!src) return;
    snapshotUndo("Duplicated");
    const dates = { ordered: null, delivered: new Date().toISOString(), racked: null, vented: null, tapped: null, on: null, off: null };
    setLines((ls) => [...ls, { id: uid(), beerId: src.beerId, drinkType: src.drinkType, size: src.size, price: src.price, status: "in_cellar", caskOwner: src.caskOwner, collected: false, bestBefore: src.bestBefore, dates }]);
    setOpenId(null);
    showToast("Duplicated. The copy is In Store.");
  };
  const beerIsDeletable = (beer) => !!beer && (beer.history || []).length === 0 && !lines.some((l) => l.beerId === beer.id);
  const beerArchiveDeletable = (beer) => !!beer && !!beer.archived && !lines.some((l) => l.beerId === beer.id && l.status !== "off");
  const deleteBeer = (id) => {
    const beer = library.find((b) => b.id === id);
    if (beerIsDeletable(beer)) {
      snapshotUndo("Beer deleted");
      setLibrary((lib) => lib.filter((b) => b.id !== id));
      setEditBeerId(null); setEditBeerLineId(null); setEditNote(null);
      showToast("Beer deleted.");
      return;
    }
    if (beerArchiveDeletable(beer)) {
      snapshotUndo("Beer deleted");
      setLibrary((lib) => lib.filter((b) => b.id !== id));
      setLines((ls) => ls.filter((l) => l.beerId !== id));
      setEditBeerId(null); setEditBeerLineId(null); setEditNote(null);
      showToast("Beer and its history deleted.");
      return;
    }
  };
  const combineBeers = (keepId, dropId) => {
    if (!keepId || !dropId || keepId === dropId) return;
    const keep = library.find((b) => b.id === keepId);
    const drop = library.find((b) => b.id === dropId);
    if (!keep || !drop) return;
    snapshotUndo("Beers combined");
    const mergedHistory = [...(keep.history || []), ...(drop.history || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    setLibrary((lib) => lib.map((b) => (b.id === keepId ? { ...b, history: mergedHistory } : b)).filter((b) => b.id !== dropId));
    setLines((ls) => ls.map((l) => (l.beerId === dropId ? { ...l, beerId: keepId } : l)));
    setDuplicateResults(null);
    setCombineCandidate(null);
    setCombineKeepId(null);
    showToast("Combined. Stock history moved across.");
  };
  const resolveLocationClash = (allBeerIds, chosenLocation) => {
    if (!allBeerIds || !allBeerIds.length || !chosenLocation) return;
    snapshotUndo("Location fixed");
    setLibrary((lib) => lib.map((b) => (allBeerIds.includes(b.id) ? { ...b, location: chosenLocation } : b)));
    setClashResults(null);
    showToast(`Updated to ${chosenLocation} across all matching beers.`);
  };
  const addDistributor = (name) => {
    const clean = (name || "").trim();
    if (!clean) return;
    const key = breweryCore(clean);
    setDistributors((ds) => (key && ds.some((d) => breweryCore(d) === key) ? ds : [...ds, clean]));
  };
  const removeDistributor = (name) => setDistributors((ds) => ds.filter((d) => d !== name));
  const latestPrice = (beer) => { const h = beer.history || []; return h.length ? h[h.length - 1].price : ""; };
  const latestSupplier = (beer) => { const h = beer.history || []; for (let i = h.length - 1; i >= 0; i--) { if (h[i].caskOwner) return h[i].caskOwner; } return ""; };
  const loadBeerIntoForm = (beer) => { setConfirmDupe(false); return setForm({ ...emptyForm, drinkType: beer.pendingDrinkType || "cask", brewery: beer.brewery, location: beer.location, collabBrewery: beer.collabBrewery || "", collabLocation: beer.collabLocation || "", name: beer.name, style: beer.style, abv: beer.abv, clarity: beer.clarity, glutenStatus: beer.glutenStatus, vegan: beer.vegan, allergens: beer.allergens, notes: beer.notes, allergensVerified: false, category: beer.category || categorise(beer.style, beer.abv), sweetness: beer.sweetness || "", price: latestPrice(beer) || beer.pendingPrice || "", bestBefore: beer.pendingBestBefore || "", caskOwner: latestSupplier(beer) || beer.pendingCaskOwner || "" }); };
  const pickBeer = (beer) => { loadBeerIntoForm(beer); setFillNote({ type: "ok", text: `Loaded "${beer.name}" from your library. Set the best before, then confirm allergens.` }); setAddMode("form"); };
  const startNewBeer = () => { setForm(emptyForm); setFillNote(null); setAddMode("form"); };
  const addLineOfBeer = (beer) => { loadBeerIntoForm(beer); setFillNote({ type: "ok", text: `Loaded "${beer.name}" from your library.` }); setAddMode("form"); setView("add"); };
  const go = (v) => { if (v === "add") { setAddMode("pick"); setAddPickSearch(""); setForm(emptyForm); setFillNote(null); } if (v === "empties") setUiPrefs((p) => ({ ...p, empties: {} })); setCellarSearch(""); setView(v); if (scrollAreaRef.current) scrollAreaRef.current.scrollTo({ top: 0, behavior: "smooth" }); };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.includes(",") ? s.split(",")[1] : s); };
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
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
  const parseLooseJSON = (text) => { try { return JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim()); } catch { const m = text.match(/[\[{][\s\S]*[\]}]/); if (!m) throw new Error("no json"); return JSON.parse(m[0]); } };
  const visionCall = async (file, promptText, useSearch = false) => {
    const isPdf = file.type === "application/pdf";
    let mediaType = "image/jpeg", b64;
    if (isPdf) { mediaType = "application/pdf"; b64 = await fileToBase64(file); }
    else { try { b64 = await imageToScaledB64(file); mediaType = "image/jpeg"; } catch (e) { b64 = await fileToBase64(file); mediaType = file.type || "image/jpeg"; } }
    const source = { type: "base64", media_type: mediaType, data: b64 };
    const body = { model: MODEL, max_tokens: 2048, messages: [{ role: "user", content: [{ type: isPdf ? "document" : "image", source }, { type: "text", text: promptText }] }] };
    if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: await authedFetchHeaders(),
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
    const brewery = p.brewery ? cleanBrewery(p.brewery) : "";
    const name = p.name ? String(p.name) : "";
    const known = brewery && name ? findSavedBeer(brewery, name) : null;
    const carriedPrice = known ? latestPrice(known) : "";
    const carriedSupplier = known ? latestSupplier(known) : "";
    return { id: "lb" + i + "_" + uid(), include: true, drinkType: dt, brewery, location: p.location ? String(p.location) : "", name, abv, price: carriedPrice, bestBefore: toISO(p.bestBefore), caskOwner: (p.deliveredBy ? String(p.deliveredBy) : "") || carriedSupplier, style, clarity: CLARITY_OPTIONS.includes(p.clarity) ? p.clarity : (p.clarity === "Cloudy" ? "Hazy" : "Clear"), glutenStatus: GLUTEN_AI_OPTIONS.includes(p.glutenStatus) ? p.glutenStatus : "Standard", vegan: !!p.vegan, allergens: Array.isArray(p.allergens) ? p.allergens.filter((a) => ALLERGEN_OPTIONS.includes(a)) : [], notes: p.notes ? String(p.notes) : "", category: deriveCategory(dt, style, abv) };
  };
  const scanLabel = async (file) => {
    setScanning(true); setScanError(null); setFillNote({ type: "loading", text: "Reading the label…" });
    try {
      const p = parseLooseJSON(await visionCall(file, labelPrompt, true));
      const it = labelToItem(p, 0);
      setForm({ ...emptyForm, drinkType: it.drinkType, brewery: it.brewery, location: it.location, name: it.name, style: it.style, abv: it.abv, price: it.price, bestBefore: it.bestBefore, caskOwner: it.caskOwner, clarity: it.clarity, glutenStatus: it.glutenStatus, vegan: it.vegan, allergens: it.allergens, notes: it.notes, allergensVerified: false, category: it.category });
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
        try { arr.push(labelToItem(parseLooseJSON(await visionCall(files[i], labelPrompt, true)), i)); } catch (e) { }
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
        const known = findSavedBeer(brewery, name);
        const carriedPrice = known ? latestPrice(known) : "";
        const carriedSupplier = known ? latestSupplier(known) : "";
        for (let q = 0; q < qty; q++) expanded.push({ id: "inv" + expanded.length, brewery, name, abv: x.abv != null ? String(x.abv) : "", price: carriedPrice, caskOwner: (x.deliveredBy ? String(x.deliveredBy) : "") || carriedSupplier, drinkType: "cask", include: true });
      });
      if (!expanded.length) throw new Error("empty");
      setInvoiceItems(expanded);
      setBatchSource("invoice"); setAddMode("invoice");
    } catch (e) {
      setScanError("Couldn't read that invoice. Try a clearer photo, or add items by hand.");
    } finally { setScanning(false); }
  };
  const updateInvoice = (idx, patch) => setInvoiceItems((items) => items.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
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
      const existing = lib.find((b) => breweryCore(b.brewery) === breweryCore(x.brewery) && normalizeForMatch(b.name) === normalizeForMatch(x.name));
      const entry = { date: nowIso, abv: x.abv, price: x.price, caskOwner: (x.caskOwner || x.brewery || "").trim() };
      let beerId;
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
    chosen.forEach((x) => { if ((x.caskOwner || "").trim()) addDistributor(x.caskOwner.trim()); });
    setInvoiceItems(null); setInvoiceOwner(""); setAddMode("pick"); setFillNote(null); setLibrarySearch(""); setView("cellar");
  };
  const snapshotUndo = (label) => { setUndoState({ lines, library, lineCare, label }); if (undoTimer.current) clearTimeout(undoTimer.current); undoTimer.current = setTimeout(() => setUndoState(null), 7000); };
  const doUndo = () => { if (!undoState) return; setLines(undoState.lines); if (undoState.library) setLibrary(undoState.library); if (undoState.lineCare) setLineCare(undoState.lineCare); setUndoState(null); if (undoTimer.current) clearTimeout(undoTimer.current); };

  const markLineCleaned = (slot) => {
    snapshotUndo("Line cleaned");
    setLineCare((m) => ({ ...m, [slot]: new Date().toISOString() }));
    showToast(`${PUMP_LABELS[slot]} line marked cleaned.`);
  };
  const markAllLinesCleaned = () => {
    snapshotUndo("All lines cleaned");
    const now = new Date().toISOString();
    setLineCare(Object.fromEntries(ALL_PUMPS.map((p) => [p, now])));
    showToast("All lines marked cleaned.");
  };
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
    const placed = new Set(rackedSlots.map((s) => s.line && s.line.id).filter(Boolean));
    const rackedOverflow = rackedCask.filter((l) => !placed.has(l.id)).sort(byBB);

    const store = lines.filter((l) => l.status === "in_cellar");
    const storeCask = store.filter((l) => l.drinkType === "cask");
    const storeGroups = [
      ...caskCategoryGroups(storeCask, (l) => beerById[l.beerId]?.category || "Misc").map(({ cat, items }) => ({ label: cat === "Stout/Porter" ? "Stout & Porter" : cat, items: items.slice().sort(byBB) })),
      { label: "Keg", items: store.filter((l) => PUMP_DRINK(l.drinkType) === "keg").sort(byBB) },
      { label: "Cider", items: store.filter((l) => l.drinkType === "cider").sort(byBB) },
    ].filter((g) => g.items.length);

    const renderSlot = (slot, k, urgent) => (
      <div key={k} className={urgent ? "flex items-start gap-2" : "flex h-full flex-col"}>
        {urgent ? (
          <span className="grid shrink-0 place-items-center rounded-md" style={{ width: 22, height: 22, marginTop: 6, background: "linear-gradient(180deg, #2C5460 0%, #203B43 100%)", color: C.accentSoft, fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 700, border: "1px solid rgba(138,207,206,0.40)", boxShadow: "inset 0 1px 0 rgba(138,207,206,0.22), 0 1px 2px rgba(32, 59, 67,0.35)" }}>{String(PUMP_NUMBER[slot.slot]).padStart(2, "0")}</span>
        ) : (
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{slot.label}</p>
        )}
        <div className={urgent ? "min-w-0 flex-1 self-stretch" : "flex-1"}>
          {slot.line ? <LineRow line={slot.line} context={urgent ? "on" : "racked"} beerById={beerById} onOpen={setOpenId} /> : (
            !canService ? <div className="flex h-full w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-slate-400" style={{ borderColor: C.line, minHeight: 52 }}>Empty · {slot.label}</div>
            : urgent
              ? <button onClick={() => openPump(slot)} className="flex h-full w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium transition hover:bg-amber-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ borderColor: "#8ACFCE", color: "#1F6B6A", minHeight: 52 }}><Plus size={15} /> Empty · {slot.label}</button>
              : <button onClick={() => openRack(slot.label)} className="flex h-full w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line, minHeight: 52 }}><Plus size={15} /> Rack from store</button>
          )}
        </div>
      </div>
    );

    if (!lines.length) {
      return (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
          <Bell className="mx-auto mb-2" style={{ color: C.accent }} />
          <p className="font-semibold" style={{ color: C.ink }}>The cellar's empty</p>
          {canEdit && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <button onClick={() => go("add")} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 active:scale-95" style={{ background: C.ink }}><Plus size={16} /> Add a cask</button>
          </div>
          )}
        </div>
      );
    }
    const q = cellarSearch.trim().toLowerCase();
    const matchLine = (l) => {
      const b = beerById[l.beerId];
      if (!b) return false;
      return [b.name, b.brewery, b.style, b.category, b.location].some((x) => (x || "").toLowerCase().includes(q));
    };
    const searchHits = q ? live.filter(matchLine) : [];
    const bySlot = (a, b) => (PUMP_NUMBER[a.slot] || 99) - (PUMP_NUMBER[b.slot] || 99);
    const searchGroups = [
      { label: "Pouring", context: "on", items: searchHits.filter((l) => l.status === "on").sort(bySlot) },
      { label: "Racked", context: "racked", items: searchHits.filter((l) => l.status === "racked" || l.status === "vented" || l.status === "tapped").sort(byBB) },
      { label: "In Store", context: "store", items: searchHits.filter((l) => l.status === "in_cellar").sort(byBB) },
    ].filter((g) => g.items.length);

    const searchBox = (
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={cellarSearch} onChange={(e) => setCellarSearch(e.target.value)} placeholder="Search the cellar…" className="w-full rounded-lg border py-2 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: "rgba(32,59,67,0.07)", borderColor: "rgba(32,59,67,0.14)", color: C.ink }} />
        {cellarSearch && <button onClick={() => setCellarSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}
      </div>
    );

    if (q) {
      return (
        <div className="space-y-4">
          {searchBox}
          {searchHits.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white p-8 text-center" style={{ borderColor: C.line }}>
              <p className="font-medium" style={{ color: C.ink }}>Nothing in the cellar matches "{cellarSearch}"</p>
              <p className="mt-1 text-sm text-slate-500">This searches what's pouring, racked and in store. Finished lines live in Empties, and everything you've ever stocked is in the Library.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">{searchHits.length} match{searchHits.length === 1 ? "" : "es"}</p>
              {searchGroups.map((g) => (
                <section key={g.label}>
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>{g.label} <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {g.items.length}</span></h2>
                  <div className="mt-2 space-y-1.5">
                    {g.items.map((l) => <LineRow key={l.id} line={l} context={g.context} beerById={beerById} onOpen={setOpenId} />)}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {searchBox}
        <section>
          <button onClick={() => toggleSection("on")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Pouring <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {onFilled}/10</span></h2>
            <ChevronDown size={20} className="text-slate-400" style={{ transform: uiPrefs.on ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {uiPrefs.on && (
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: TYPE_ACCENT.cask, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT.cask }} />Cask<span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(32, 59, 67,0.18), rgba(32, 59, 67,0))" }} /></p>
                <div className="cc-stagger grid grid-cols-1 gap-1.5 sm:grid-cols-2">{onCaskSlots.map((s, i) => renderSlot(s, `oc${i}`, true))}</div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: C.line }}>
                <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: TYPE_ACCENT.keg, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT.keg }} />Keg<span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(32, 59, 67,0.18), rgba(32, 59, 67,0))" }} /></p>
                <div className="cc-stagger grid grid-cols-1 gap-1.5 sm:grid-cols-2">{onKegSlots.map((s, i) => renderSlot(s, `ok${i}`, true))}</div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: C.line }}>
                <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: TYPE_ACCENT.cider, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT.cider }} />Cider<span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(32, 59, 67,0.18), rgba(32, 59, 67,0))" }} /></p>
                <div className="cc-stagger grid grid-cols-1 gap-1.5 sm:grid-cols-2">{onCiderSlots.map((s, i) => renderSlot(s, `od${i}`, true))}</div>
              </div>
            </div>
          )}
        </section>
        <section className="border-t pt-4" style={{ borderColor: C.line }}>
          <button onClick={() => toggleSection("racked")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Racked <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {rackedCask.length}</span></h2>
            <ChevronDown size={20} className="text-slate-400" style={{ transform: uiPrefs.racked ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {uiPrefs.racked && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {rackedSlots.map((s, i) => renderSlot(s, `r${i}`, false))}
              {rackedOverflow.map((l) => (
                <div key={l.id}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{beerById[l.beerId]?.category || "Misc"}</p>
                  <LineRow line={l} context="racked" beerById={beerById} onOpen={setOpenId} />
                </div>
              ))}
            </div>
          )}
        </section>
        {store.length > 0 && (
          <section className="border-t pt-4" style={{ borderColor: C.line }}>
            <button onClick={() => toggleSection("store")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
              <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>In Store <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {store.length}</span></h2>
              <ChevronDown size={20} className="text-slate-400" style={{ transform: uiPrefs.store ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </button>
            {uiPrefs.store && (
              <div className="mt-2 space-y-2">
                {storeGroups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{g.items.map((l) => <LineRow key={l.id} line={l} context="store" beerById={beerById} onOpen={setOpenId} />)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {empties.length > 0 && (
          <button onClick={() => go("empties")} className="flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ borderColor: "#8ACFCE", background: "#EFF6F5" }}>
            <span className="flex items-center gap-2 text-sm font-medium" style={{ color: C.ink }}>
              <Package size={16} style={{ color: "#1F6B6A" }} />
              {empties.length} empt{empties.length === 1 ? "y" : "ies"} waiting for collection
            </span>
            <span className="text-xs font-semibold" style={{ color: "#1F6B6A" }}>View →</span>
          </button>
        )}
      </div>
    );
  };

  const AddForm = () => {
    if (!canEdit) {
      return (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
          <Lock className="mx-auto mb-2" style={{ color: C.accent }} />
          <p className="font-semibold" style={{ color: C.ink }}>Manager access needed</p>
          <p className="mt-1 text-sm text-slate-500">Adding stock isn't available on this login.</p>
        </div>
      );
    }
    if (addMode === "invoice") {
      const items = invoiceItems || [];
      const cellChk = "min-w-0 flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300";
      const count = items.filter((x) => x.include && x.name.trim()).length;
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <button onClick={() => { setAddMode("pick"); setInvoiceItems(null); }} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowRight size={14} className="rotate-180" /> Back</button>
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>{batchSource === "labels" ? "Scanned labels" : "Delivery items"}</p>
            <p className="mt-1 text-sm text-slate-500">Check the details below, then confirm. Each one saves to your library and goes straight into In Store{batchSource === "labels" ? ", best before and supplier included" : ""}.</p>
            <div className="mt-3 space-y-2">
              {items.length === 0 && <p className="py-3 text-center text-sm text-slate-400">Nothing found.</p>}
              {items.map((x, idx) => (
                <div key={x.id} className="relative overflow-hidden rounded-lg border py-2.5 pr-2.5" style={{ borderColor: C.line, paddingLeft: 20 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
                    <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[x.category] || CAT_ACCENT.Misc }} />
                  </span>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={x.include} onChange={(e) => updateInvoice(idx, { include: e.target.checked })} className="h-4 w-4" />
                    <input value={x.name} onChange={(e) => updateInvoice(idx, { name: e.target.value })} placeholder="Name" className={cellChk} style={{ borderColor: C.line }} />
                    <button onClick={() => duplicateInvoice(idx)} title="Duplicate this beer" className="shrink-0 rounded-lg border p-1.5 text-slate-500 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Copy size={14} /></button>
                  </div>
                  {(() => { const warn = checkContradictions(x); return warn.length > 0 && <p className="mt-1.5 flex items-start gap-1 text-xs" style={{ color: C.alert }}><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {warn.join(" ")}</p>; })()}
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input value={x.brewery} onChange={(e) => updateInvoice(idx, { brewery: e.target.value })} placeholder="Brewery" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <input value={x.abv} onChange={(e) => updateInvoice(idx, { abv: e.target.value })} inputMode="decimal" placeholder="ABV %" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <input value={x.price} onChange={(e) => updateInvoice(idx, { price: e.target.value })} inputMode="decimal" placeholder="e.g. 4.40" className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }} />
                    <select value={x.drinkType} onChange={(e) => updateInvoice(idx, { drinkType: e.target.value })} className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" style={{ borderColor: C.line }}>{DRINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                  </div>
                  {(() => {
                    const known = x.brewery.trim() && x.name.trim() ? findSavedBeer(x.brewery, x.name) : null;
                    const carried = known ? latestPrice(known) : "";
                    return !!carried && x.price.trim() === carried.trim() && <p className="mt-1.5 text-xs font-medium" style={{ color: C.accent }}>Previous price. Please confirm.</p>;
                  })()}
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
            <button onClick={importInvoice} disabled={!count} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-50" style={{ background: C.ink }}><Plus size={16} /> Confirm all {count} · add to store</button>
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
        <button key={b.id} onClick={() => pickBeer(b)} className="relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border py-2.5 pr-2.5 text-left transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.paper, borderColor: C.line, paddingLeft: 20 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
            <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[b.category] || CAT_ACCENT.Misc }} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-normal" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{(() => { const t = splitTitle(b.brewery, b.name, b.collabBrewery); return <>{t.lead && <span className="font-semibold" style={{ color: C.ink }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()}</span>
            <span className="block truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[b.style || "", b.abv ? `${b.abv}%` : "", extraSweetness(b)].filter(Boolean).join("  ·  ")}</span>
            <span className="block truncate text-xs text-slate-400">{locationDisplay(b)}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-400">{latestPrice(b) ? `last £${latestPrice(b)} ` : ""}→</span>
        </button>
      );
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <input ref={labelRef} type="file" accept="image/*" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length === 1) scanLabel(fs[0]); else if (fs.length > 1) scanLabelsBatch(fs); }} className="hidden" />
          <input ref={invoiceRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanInvoice(f); }} className="hidden" />
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Scan it in</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => labelRef.current && labelRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-60" style={{ background: C.ink }}><Camera size={16} /> Scan a cask label / pump clip</button>
              <button onClick={() => invoiceRef.current && invoiceRef.current.click()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><FileText size={16} /> Scan an invoice</button>
              <button onClick={startNewBeer} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60" style={{ borderColor: C.line }}><Plus size={16} /> Add manually</button>
            </div>
            {scanning && <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> {scanProgress || "Reading… this can take a few seconds."}</p>}
            {scanError && <p className="mt-2 text-sm text-amber-700">{scanError}</p>}
          </div>
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <p className="text-base font-semibold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Add from your library</p>
            <div className="relative mt-3">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={addPickSearch} onChange={(e) => setAddPickSearch(e.target.value)} placeholder="Search ales, breweries, styles…" className="w-full rounded-lg border py-2 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: "rgba(32,59,67,0.07)", borderColor: "rgba(32,59,67,0.14)", color: C.ink }} />
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
    const handleFieldChange = (patch) => {
      if ("brewery" in patch || "name" in patch) setConfirmDupe(false);
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
              {priceNeedsConfirm && <p className="mt-1 text-xs font-medium" style={{ color: C.accent }}>Previous price. Please confirm.</p>}
            </Field>
            {form.drinkType === "cider" && <Field label="Container"><select className={inputCls} value={form.size} onChange={(e) => setF({ size: e.target.value })}>{SIZE_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>}
          </div>
          {form.drinkType !== "cider" && form.drinkType !== "keykeg" && (
            <Field label="Delivered by">
              <input className={inputCls} value={form.caskOwner} onChange={(e) => setF({ caskOwner: e.target.value })} placeholder={form.brewery ? `Defaults to ${form.brewery}` : "Defaults to the brewery"} />
              {supplierNeedsConfirm && <p className="mt-1 text-xs font-medium" style={{ color: C.accent }}>Previous delivery. Please confirm.</p>}
            </Field>
          )}
          <Field label="Best before">
            <input type="date" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" value={form.bestBefore} onChange={(e) => setF({ bestBefore: e.target.value })} style={{ WebkitAppearance: "none", appearance: "none", fontSize: 14, colorScheme: "light" }} />
          </Field>
          <Field label="Status"><select className={inputCls} value={form.status} onChange={(e) => setF({ status: e.target.value })}>{STATUSES.map((s) => { const full = s.key === "on" && lines.filter((l) => l.status === "on" && PUMP_DRINK(l.drinkType) === PUMP_DRINK(form.drinkType)).length >= PUMPS[PUMP_DRINK(form.drinkType)].length; return <option key={s.key} value={s.key} disabled={full}>{s.label}{full ? " (pumps full)" : ""}</option>; })}</select></Field>
          {form.status === "off" && <p className="text-xs text-slate-500">For stock that's already done, damaged, spoiled, or otherwise never going on. It's logged and finished straight away, not added to what's currently in the cellar.</p>}
        </div>

        <div className="flex gap-2">
          <button onClick={addLine} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Plus size={16} /> Add to cellar</button>
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
    const recentAdded = library.filter((b) => !b.archived).slice(-30).reverse();
    const histChrono = (b) => (b.history || []).slice().sort((x, y) => new Date(x.date) - new Date(y.date));
    const libRow = (b) => {
      const h = histChrono(b);
      const open = !!historyOpen[b.id];
      return (
        <div key={b.id} className="relative overflow-hidden rounded-xl border py-2.5 pr-2.5" style={{ background: C.paper, borderColor: C.line, paddingLeft: 20 }}>
          <span aria-hidden="true" title={b.category || "Misc"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
            <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[b.category] || CAT_ACCENT.Misc }} />
          </span>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <button onClick={() => setLibraryOpenId(b.id)} className="block w-full min-w-0 rounded-lg text-left transition focus:outline-none focus:ring-2 focus:ring-teal-300">
                <p className="truncate text-sm font-normal" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{(() => { const t = splitTitle(b.brewery, b.name, b.collabBrewery); return <>{t.lead && <span className="font-semibold" style={{ color: C.ink }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()} {!b.allergensVerified && <AlertTriangle size={13} className="inline shrink-0" style={{ color: C.alert }} />}</p>
                <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[b.style || "", b.abv ? `${b.abv}%` : "", extraSweetness(b)].filter(Boolean).join("  ·  ")}</p>
                <p className="truncate text-xs text-slate-400">{[locationDisplay(b), latestPrice(b) ? `Last £${latestPrice(b)}` : ""].filter(Boolean).join("  ·  ")}</p>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-1" style={{ minHeight: 22 }}><DietaryMini beer={b} /></div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canEdit && <button onClick={(e) => { e.stopPropagation(); addLineOfBeer(b); }} title="Add to cellar" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Plus size={13} /> Add</button>}
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
          <input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Search ales, breweries, styles…" className="w-full rounded-lg border py-2 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: "rgba(32,59,67,0.07)", borderColor: "rgba(32,59,67,0.14)", color: C.ink }} />
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
            {recentAdded.length > 0 && (
              <section>
                <button onClick={() => toggleSection("libRecent")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Recently added <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {recentAdded.length}</span></h2>
                  <ChevronDown size={20} className="text-slate-400" style={{ transform: uiPrefs.libRecent ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>
                {uiPrefs.libRecent && <div className="mt-2 space-y-2">{recentAdded.map(libRow)}</div>}
              </section>
            )}
            {rest.length > 0 && (
              <section className="border-t pt-4" style={{ borderColor: C.line }}>
                <button onClick={() => toggleSection("libAll")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>All beers <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {rest.length}</span></h2>
                  <ChevronDown size={20} className="text-slate-400" style={{ transform: uiPrefs.libAll ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>
                {uiPrefs.libAll && <div className="mt-2 space-y-2">{rest.map(libRow)}</div>}
              </section>
            )}
            {archived.length > 0 && (
              <section className="border-t pt-4" style={{ borderColor: C.line }}>
                <button onClick={() => toggleSection("libArchived")} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none">
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Archived <span className="text-sm" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>· {archived.length}</span></h2>
                  <ChevronDown size={20} className="text-slate-400" style={{ transform: uiPrefs.libArchived ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>
                {uiPrefs.libArchived && <div className="mt-2 space-y-2" style={{ opacity: 0.75 }}>{archived.map(libRow)}</div>}
              </section>
            )}
          </>
        )}
      </div>
    );
  };

  const LibraryTools = () => {
    if (!canEdit) {
      return (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center" style={{ borderColor: C.line }}>
          <Lock className="mx-auto mb-2" style={{ color: C.accent }} />
          <p className="font-semibold" style={{ color: C.ink }}>Manager access needed</p>
          <p className="mt-1 text-sm text-slate-500">Library tools aren't available on this login.</p>
        </div>
      );
    }
    const incomplete = library.filter((b) => !b.archived && (!(b.abv || "").trim() || !(b.style || "").trim() || !(b.location || "").trim() || !(b.notes || "").trim()));
    return (
      <div className="space-y-3">
        <div className="rounded-xl border p-3.5" style={{ background: C.paper, borderColor: C.line }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Find duplicates</h2>
              <p className="mt-0.5 text-xs text-slate-500">Looks for the same beer entered more than once, like "Weston's" and "Westons Cider" both being Old Rosie.</p>
            </div>
            <button onClick={() => setDuplicateResults(findDuplicateCandidates(library))} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>Scan</button>
          </div>
          {duplicateResults !== null && (
            duplicateResults.length === 0 ? (
              <p className="mt-2.5 text-xs text-slate-400">No likely duplicates found.</p>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                {duplicateResults.map((pair, i) => (
                  <div key={i} className="rounded-lg border p-2" style={{ borderColor: C.line }}>
                    <p className="text-xs text-slate-600"><span className="font-semibold" style={{ color: C.ink }}>{pair[0].brewery || "?"} - {pair[0].name}</span> and <span className="font-semibold" style={{ color: C.ink }}>{pair[1].brewery || "?"} - {pair[1].name}</span></p>
                    <button onClick={() => { setCombineCandidate(pair); setCombineKeepId(pair[0].id); }} className="mt-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90" style={{ background: C.ink }}>Compare &amp; combine</button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <div className="rounded-xl border p-3.5" style={{ background: C.paper, borderColor: C.line }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Brewery details clash</h2>
              <p className="mt-0.5 text-xs text-slate-500">Looks for the same brewery with different locations on file, like Two By Two showing as both Wallsend and Byker.</p>
            </div>
            <button onClick={() => setClashResults(findLocationClashes(library))} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>Scan</button>
          </div>
          {clashResults !== null && (
            clashResults.length === 0 ? (
              <p className="mt-2.5 text-xs text-slate-400">No clashes found.</p>
            ) : (
              <div className="mt-2.5 space-y-2">
                {clashResults.map((c, i) => {
                  const allIds = c.options.flatMap((o) => o.beerIds);
                  return (
                    <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: C.line }}>
                      <p className="text-xs font-semibold" style={{ color: C.ink }}>{c.brewery || "?"}</p>
                      <div className="mt-1.5 space-y-1">
                        {c.options.map((o) => (
                          <button key={o.loc} onClick={() => resolveLocationClash(allIds, o.loc)} className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:bg-slate-50" style={{ borderColor: C.line }}>
                            <span className="text-slate-700">{o.loc}</span>
                            <span className="shrink-0 text-slate-400">{o.beerIds.length} beer{o.beerIds.length === 1 ? "" : "s"} · use for all</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {incomplete.length > 0 && (
          <div className="rounded-xl border p-3.5" style={{ background: C.paper, borderColor: C.line }}>
            <h2 className="text-sm font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Needs more detail ({incomplete.length})</h2>
            <p className="mt-0.5 text-xs text-slate-500">Missing ABV, style, location, or tasting notes.</p>
            <div className="mt-2.5 space-y-1.5">
              {incomplete.map((b) => {
                const missing = [!(b.abv || "").trim() && "ABV", !(b.style || "").trim() && "style", !(b.location || "").trim() && "location", !(b.notes || "").trim() && "tasting notes"].filter(Boolean).join(", ");
                return (
                  <button key={b.id} onClick={() => { setEditBeerId(b.id); setEditBeerLineId(null); }} className="block w-full rounded-lg border p-2 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>
                    <span className="block truncate text-sm font-semibold" style={{ color: C.ink }}>{b.brewery || "?"} - {b.name}</span>
                    <span className="block text-xs text-slate-400">Missing: {missing}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const NotifySettings = () => (
    <div className="space-y-4">
      <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
        <h2 className="text-base font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Pump notifications</h2>
        <div className="mt-1 mb-3 h-0.5 w-8 rounded-full" style={{ background: C.accent }} />
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
            <button onClick={enablePush} disabled={pushBusy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}>{pushBusy ? <Loader2 className="animate-spin" size={15} /> : <Bell size={15} />} Turn on for this phone</button>
          )}
          {pushState === "on" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg p-3 text-sm font-medium" style={{ background: "#EDF3E7", color: DIET_BADGE_STYLE.vegan.color }}><CheckCircle2 size={16} /> Notifications are on for this phone.</div>
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
        <button onClick={shareGuidePDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: C.muted }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
      </div>
      {GUIDE_SECTIONS.map((sec) => (
        <div key={sec.title} className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-base font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>{sec.title}</h2>
          <div className="mt-1 mb-3 h-0.5 w-8 rounded-full" style={{ background: C.accent }} />
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

    const restocked = active.map((b) => ({ b, n: (b.history || []).length })).filter((x) => x.n >= 2).sort((a, z) => z.n - a.n).slice(0, 5);

    const risers = active.map((b) => {
      const h = histOf(b).filter((e) => e.price && !isNaN(parseFloat(e.price)));
      if (h.length < 2) return null;
      const first = parseFloat(h[0].price), last = parseFloat(h[h.length - 1].price);
      if (last <= first) return null;
      return { b, first, last, up: last - first };
    }).filter(Boolean).sort((a, z) => z.up - a.up).slice(0, 5);

    const bySupplier = {};
    active.forEach((b) => (b.history || []).forEach((e) => { const k = e.caskOwner || null; if (k) bySupplier[k] = (bySupplier[k] || 0) + 1; }));
    const suppliers = Object.entries(bySupplier).sort((a, z) => z[1] - a[1]).slice(0, 6);
    const supMax = suppliers.length ? suppliers[0][1] : 0;

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
                  <span className="shrink-0 font-semibold" style={{ color: C.accent, fontFamily: "var(--font-data)" }}>{n}×</span>
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
                    <div className="h-full rounded-full" style={{ width: `${Math.round((n / supMax) * 100)}%`, background: C.accent }} />
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
    } catch (e) { }
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
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Export</h2>
          <p className="mt-0.5 text-xs text-slate-400">{prefs.lastBackup ? `Last backup: ${fmtUpdated(prefs.lastBackup)}` : "No backup taken yet. The cloud keeps no history, so a saved copy is your safety net."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copyBackup} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Copy size={16} /> Copy backup</button>
            <button onClick={downloadBackup} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Download size={16} /> Download .json</button>
          </div>
          <textarea readOnly value={exportData()} className={`mt-3 ${taCls}`} onFocus={(e) => e.target.select()} />
        </div>

        {canEdit && (
        <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Import</h2>
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
        )}

        {cloudMode && canEdit && (
          <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
            <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Recent snapshots</h2>
            <p className="mt-1 text-sm text-slate-500">The cloud keeps the last 30 states the cellar has been in, taken automatically. If something goes wrong on any device, you can put it back here, no manual backup needed.</p>
            {historyList === null ? (
              <button onClick={loadHistory} disabled={historyLoading} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50" style={{ borderColor: C.line }}>
                <History size={16} /> {historyLoading ? "Loading…" : "Load recent snapshots"}
              </button>
            ) : historyList.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No snapshots yet. These build up automatically as changes get saved.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {historyList.map((row) => (
                  <div key={row.id} className="rounded-lg border px-3 py-2" style={{ borderColor: C.line }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm" style={{ color: C.ink, fontFamily: "var(--font-data)" }}>{fmtUpdated(row.created_at)}</span>
                      {confirmSnapshotId !== row.id && <button onClick={() => setConfirmSnapshotId(row.id)} className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" style={{ borderColor: C.line }}>Restore</button>}
                    </div>
                    {confirmSnapshotId === row.id && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                        <p className="text-xs text-amber-800">Replaces everything currently in the app with how the cellar looked at this point. Cannot be undone from here, take a backup first if you're not sure.</p>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => restoreSnapshot(row)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90" style={{ background: C.accent }}>Restore now</button>
                          <button onClick={() => setConfirmSnapshotId(null)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Fix a stuck app</h2>
          <p className="mt-1 text-sm text-slate-500">If the app seems out of date after an update, e.g. it doesn't match what you were told changed, this clears whatever's holding the old version and reloads fresh. Your cellar data is untouched, this only clears cached app files.</p>
          {!confirmCacheReset ? (
            <button onClick={() => setConfirmCacheReset(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><RotateCcw size={16} /> Reset app cache</button>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">This reloads the app immediately. Make sure nothing else needs saving first.</p>
              <div className="mt-2 flex gap-2">
                <button onClick={resetAppCache} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: C.accent }}>Reset now</button>
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
      const ink = [32, 59, 67], accent = [31, 107, 106], accentSoft = [86, 139, 137], gray = [86, 111, 118], lineCol = [224, 218, 212], paleBg = [249, 246, 243];
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const ensure = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };

      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 28, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(243, 239, 230);
      doc.text("Empties to Return", M, 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(accentSoft[0], accentSoft[1], accentSoft[2]);
      doc.text(`${PUB_CONFIG.fullName.toUpperCase()} · COLLECTION LIST`, M, 20.5);
      doc.setFontSize(8.5); doc.setTextColor(200, 196, 186);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, 13, { align: "right" });
      y = 36;

      const sectionHead = (t, n) => { ensure(16); y += 4; doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(M, y - 4, 2.2, 5.2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(t, M + 4.5, y); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(gray[0], gray[1], gray[2]); doc.text(String(n), W - M, y, { align: "right" }); y += 5.5; };

      const beerLine = (l) => {
        const b = beerById[l.beerId]; if (!b) return;
        const nameParts = splitTitle(b.brewery, b.name, b.collabBrewery);
        const name = nameParts.lead ? `${nameParts.lead} ${nameParts.rest}` : nameParts.rest;
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
        doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(M, y, 2.1, rowH, "F");
        const ac = hex(CAT_ACCENT[b.category] || CAT_ACCENT.Misc); doc.setFillColor(ac[0], ac[1], ac[2]); doc.rect(M + 0.45, y, 1.55, rowH, "F");
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
      await sharePdfDoc(doc, `${PUB_CONFIG.slug}-empties.pdf`, `${PUB_CONFIG.shortName} empties to return`);
    } catch (e) {
      showToast("Could not make the PDF just now. Check your connection and try again.");
    } finally { setPdfBusy(false); }
  };

  const LineCare = () => {
    const onBySlot = {};
    lines.filter((l) => l.status === "on" && l.slot).forEach((l) => { onBySlot[l.slot] = l; });
    const groups = [
      { label: "Cask", pumps: PUMPS.cask, accent: TYPE_ACCENT.cask },
      { label: "Keg", pumps: PUMPS.keg, accent: TYPE_ACCENT.keg },
      { label: "Cider", pumps: PUMPS.cider, accent: TYPE_ACCENT.cider },
    ];
    const due = linesDueClean();
    return (
      <div className="space-y-4">
        <div className="cc-elev rounded-xl border p-4" style={{ background: C.paper, borderColor: C.line }}>
          <p className="text-sm" style={{ color: C.inkSoft }}>
            {due === 0 ? "Every line is up to date." : `${due} line${due === 1 ? "" : "s"} due a clean.`}
            {" "}Lines are counted as due every {PUB_CONFIG.lineCleanDays} days.
          </p>
          {canService && (
            <button onClick={markAllLinesCleaned} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}>
              <Check size={15} /> Mark all lines cleaned
            </button>
          )}
        </div>
        {groups.map((g) => (
          <section key={g.label}>
            <p className="mb-1.5 flex items-center gap-2 uppercase" style={{ color: g.accent, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: g.accent }} />{g.label}
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(32, 59, 67,0.18), rgba(32, 59, 67,0))" }} />
            </p>
            <div className="space-y-1.5">
              {g.pumps.map((slot) => {
                const info = lineCleanInfo(slot);
                const line = onBySlot[slot];
                const beer = line ? beerById[line.beerId] : null;
                const status = info.never ? "No clean recorded yet" : info.days === 0 ? "Cleaned today" : `Cleaned ${info.days} day${info.days === 1 ? "" : "s"} ago`;
                return (
                  <div key={slot} className="flex items-center gap-2.5 rounded-xl border p-2.5" style={{ background: C.paper, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: info.overdue ? C.alert : g.accent }}>
                    <span className="grid shrink-0 place-items-center rounded-md" style={{ width: 22, height: 22, background: "linear-gradient(180deg, #2C5460 0%, #203B43 100%)", color: C.accentSoft, fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 700, border: "1px solid rgba(138,207,206,0.40)", boxShadow: "inset 0 1px 0 rgba(138,207,206,0.22), 0 1px 2px rgba(32, 59, 67,0.35)" }}>{String(PUMP_NUMBER[slot]).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{PUMP_LABELS[slot]}</p>
                      <p className="truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{beer ? `${beer.brewery ? beer.brewery + " " : ""}${beer.name}` : "Nothing on"}</p>
                      <p className="truncate text-xs" style={{ color: info.overdue ? C.alert : C.muted, fontFamily: "var(--font-data)", fontWeight: info.overdue ? 600 : 500 }}>{status}</p>
                    </div>
                    {canService && (
                      <button onClick={() => markLineCleaned(slot)} className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>Cleaned</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  const Empties = () => {
    const empties = lines.filter(IS_EMPTY);
    const groups = groupByOwner(empties);
    return (
      <div className="space-y-4">
        {canEdit && (
          <div className="cc-elev rounded-xl border p-3.5" style={{ background: C.paper, borderColor: C.line }}>
            <h2 className="text-sm font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Distributors</h2>
            <p className="mt-0.5 text-xs text-slate-500">Added automatically from deliveries. Add or remove here too.</p>
            {distributors.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {distributors.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: C.line, color: C.inkSoft }}>
                    {d}
                    <button onClick={() => removeDistributor(d)} className="text-slate-400 hover:text-slate-600" aria-label={`Remove ${d}`}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2.5 flex gap-2">
              <input value={newDistributor} onChange={(e) => setNewDistributor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addDistributor(newDistributor); setNewDistributor(""); } }} placeholder="Add a distributor" className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: "rgba(32,59,67,0.07)", borderColor: "rgba(32,59,67,0.14)", color: C.ink }} />
              <button onClick={() => { addDistributor(newDistributor); setNewDistributor(""); }} disabled={!newDistributor.trim()} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}>Add</button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button onClick={shareEmptiesPDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1 py-1 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: C.muted }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
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
          const open = !!uiPrefs.empties[key];
          return (
            <div key={key} className="rounded-xl border" style={{ background: C.paper, borderColor: C.line }}>
              <button onClick={() => setUiPrefs((p) => ({ ...p, empties: { ...p.empties, [key]: !p.empties[key] } }))} className="flex w-full items-center justify-between gap-2 p-3 text-left focus:outline-none">
                <p className="font-semibold" style={{ color: C.ink }}>{label} <span className="text-sm font-normal text-slate-400">· {items.length}</span></p>
                <ChevronDown size={18} className="text-slate-400" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {open && (
                <>
                  {items.length > 1 && canService && (
                    <div className="flex justify-end px-3 pb-1.5">
                      <button onClick={() => markOwnerCollected(key)} className="inline-flex items-center gap-1 px-1 py-1 text-xs font-medium transition hover:opacity-70 active:scale-95 focus:outline-none" style={{ color: C.muted }}><Check size={13} /> All collected ({items.length})</button>
                    </div>
                  )}
                  <ul className="space-y-1.5 px-3 pb-3">
                  {items.map((l) => {
                    const beer = beerById[l.beerId];
                    const dt = (DRINK_TYPES.find((t) => t.key === l.drinkType) || {}).label || l.drinkType;
                    return (
                      <li key={l.id} className="relative flex items-start justify-between gap-2 overflow-hidden rounded-lg border py-2 pr-2.5" style={{ background: C.paper, borderColor: C.line, paddingLeft: 20 }}>
                        <span aria-hidden="true" title={(beer && beer.category) || "Misc"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
                          <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[beer && beer.category] || CAT_ACCENT.Misc }} />
                        </span>
                        <button onClick={() => setOpenId(l.id)} className="min-w-0 flex-1 rounded text-left focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ WebkitTapHighlightColor: "transparent" }}>
                          <span className="block truncate text-sm font-normal" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{beer ? (() => { const t = splitTitle(beer.brewery, beer.name, beer.collabBrewery); return <>{t.lead && <span className="font-semibold" style={{ color: C.ink }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })() : "Unknown"}</span>
                          {beer && <span className="block truncate text-xs" style={{ color: C.inkSoft, fontFamily: "var(--font-data)", fontWeight: 500 }}>{[dt, beer.style || "", beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</span>}
                          {beer && locationDisplay(beer) && <span className="block truncate text-xs text-slate-400" style={{ fontFamily: "var(--font-data)" }}>{locationDisplay(beer)}</span>}
                          <span className="block truncate text-xs text-slate-500" style={{ fontFamily: "var(--font-data)" }}>{l.size ? `${l.size} · ` : ""}finished {l.dates.off ? fmtDate(l.dates.off.slice(0, 10)) : "--"}</span>
                        </button>
                        {canService && <button onClick={() => markCollected(l.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={13} /> Collected</button>}
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
      { title: "Keg", items: on.filter((l) => PUMP_DRINK(l.drinkType) === "keg") },
      { title: "Draught cider", items: on.filter((l) => l.drinkType === "cider") },
    ].filter((g) => g.items.length);
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-end gap-2">
          <button onClick={shareAllergenPDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: C.muted }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Printer size={15} /> Print</button>
        </div>
        <div id="allergen-sheet" className="cc-elev rounded-xl border p-5" style={{ background: C.paper, borderColor: C.line }}>
          <h1 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>What's on: allergen and dietary guide</h1>
          <p className="mt-0.5 text-xs text-slate-500">Please confirm with staff before ordering.</p>
          {fmtUpdated(lastUpdated) && <p className="mt-0.5 text-xs text-slate-400">Last updated: {fmtUpdated(lastUpdated)}</p>}
          {groups.length === 0 && <p className="mt-4 text-sm text-slate-400">Nothing on right now.</p>}
          {groups.map((g) => (
            <div key={g.title} className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.accent }}>{g.title}</h3>
              <div className="mt-1 divide-y" style={{ borderColor: C.line }}>
                {g.items.map((l) => {
                  const beer = beerById[l.beerId];
                  if (!beer) return null;
                  const diet = [isVegan(beer) ? "Vegan" : null, isGlutenFree(beer) ? glutenFreeLabel(beer) : beer.glutenStatus === "Low gluten" ? "Low gluten, <20ppm" : null].filter(Boolean).join(", ");
                  return (
                    <div key={l.id} className="py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-normal" style={{ color: C.ink }}>{beer.name}</span>
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
    const onL = lines.filter((l) => l.status === "on").slice().sort((a, b) => ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(a.slot) - ["cask0","cask1","cask2","cask3","keg0","keg1","keg2","cider0","cider1","cider2"].indexOf(b.slot));
    const prepOrder = { tapped: 0, vented: 1, racked: 2 };
    const prep = lines.filter((l) => ["tapped", "vented", "racked"].includes(l.status)).sort((a, b) => prepOrder[a.status] - prepOrder[b.status]);
    const storeL = lines.filter((l) => l.status === "in_cellar");
    const total = onL.length + prep.length + storeL.length;
    const prepGroups = caskCategoryGroups(prep, (l) => beerById[l.beerId]?.category || "Misc").map(({ cat, items }) => ({
      label: cat === "Stout/Porter" ? "Stout & Porter" : cat,
      items: items.slice().sort((a, b) => prepOrder[a.status] - prepOrder[b.status] || byBB(a, b)),
    }));
    const storeCask = storeL.filter((l) => l.drinkType === "cask");
    const storeGroups = [
      ...caskCategoryGroups(storeCask, (l) => beerById[l.beerId]?.category || "Misc").map(({ cat, items }) => ({ label: cat === "Stout/Porter" ? "Stout & Porter" : cat, items: items.slice().sort(byBB) })),
      { label: "Keg", items: storeL.filter((l) => PUMP_DRINK(l.drinkType) === "keg").sort(byBB) },
      { label: "Cider", items: storeL.filter((l) => l.drinkType === "cider").sort(byBB) },
    ].filter((g) => g.items.length);
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-end gap-2">
          <button onClick={sharePDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40 focus:outline-none" style={{ color: C.muted }}>{pdfBusy ? <Loader2 className="animate-spin" size={13} /> : <Share size={13} />} Share</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Printer size={15} /> Print</button>
        </div>
        <div className="cc-elev rounded-xl border p-5" style={{ background: C.paper, borderColor: C.line }}>
          {fmtUpdated(lastUpdated) && <p className="text-xs text-slate-400">Last updated: {fmtUpdated(lastUpdated)}</p>}
          {total === 0 && <p className="mt-4 text-sm text-slate-400">No stock yet.</p>}
          <Section title="Pouring" items={onL} withStage={false} beerById={beerById} />
          {prep.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.accent }}>Racked · {prep.length}</h3>
              {prepGroups.map((g) => (
                <div key={g.label} className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
                  {g.items.map((l) => <Row key={l.id} l={l} stage={STATUS_BY_KEY[l.status] && STATUS_BY_KEY[l.status].label} beerById={beerById} />)}
                </div>
              ))}
            </div>
          )}
          {storeL.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: C.accent }}>In Store · {storeL.length}</h3>
              {storeGroups.map((g) => (
                <div key={g.label} className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
                  {g.items.map((l) => <Row key={l.id} l={l} stage={null} beerById={beerById} />)}
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
    const cask = on.filter((l) => l.drinkType === "cask");
    const keg = on.filter((l) => PUMP_DRINK(l.drinkType) === "keg").sort(byBB);
    const cider = on.filter((l) => l.drinkType === "cider").sort(byBB);
    const caskByCat = caskCategoryGroups(cask, (l) => beerById[l.beerId]?.category || "Misc").map(({ cat, items }) => ({ cat, items: items.slice().sort(byBB) }));


    return (
      <div className="flex-1 overflow-y-auto" style={{ background: "linear-gradient(180deg, #D3E3E1 0%, #E9E9E6 40%, #F6EDE5 100%)", overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }}>
        <div className="mx-auto max-w-2xl px-5 py-8">
          <div style={{ borderTopLeftRadius: 130, borderTopRightRadius: 130, padding: "28px 22px 20px", background: "linear-gradient(180deg, #6FC4C3 0%, #A9D8D3 40%, #DCE6DF 72%, #F6EDE5 100%)", boxShadow: "0 10px 30px -18px rgba(32, 59, 67,0.5)" }}>
            <div className="flex flex-col items-center text-center">
              <img src={PUB_LOGO_INK} alt="" style={{ width: 104, height: 104 }} />
              <p className="mt-2.5 text-2xl font-semibold leading-tight" style={{ color: C.ink, fontFamily: "var(--font-brand)", letterSpacing: "0.03em" }}>{PUB_CONFIG.name}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink }}>What's on today</p>
              {fmtUpdated(lastUpdated) && <p className="mt-2 text-xs" style={{ color: "rgba(32,59,67,0.6)" }}>Last updated: {fmtUpdated(lastUpdated)}</p>}
              <div className="mt-1 flex items-center gap-4">
                <button onClick={shareTapListPDF} disabled={pdfBusy} className="inline-flex items-center gap-1 px-0 py-1 text-xs font-medium transition hover:opacity-70 active:scale-95 disabled:opacity-40" style={{ color: C.accent }}>{pdfBusy ? <Loader2 className="animate-spin" size={12} /> : <Share size={12} />} Share</button>
                <button onClick={() => go("cellar")} className="inline-flex items-center px-0 py-1 text-xs font-medium transition hover:opacity-70" style={{ color: C.accent }}>Exit preview</button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            {on.length === 0 && <p className="py-12 text-center" style={{ color: C.muted }}>Nothing on right now. Check back soon.</p>}

            {caskByCat.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-widest" style={{ color: C.accent, fontFamily: "var(--font-brand)" }}>Cask ale</h2>
                {caskByCat.map((g) => (
                  <div key={g.cat} className="mb-3">
                    <p className="text-xs uppercase tracking-wide" style={{ color: C.muted, fontFamily: "var(--font-data)" }}>{g.cat}</p>
                    {g.items.map((l) => <Item key={l.id} line={l} beerById={beerById} />)}
                  </div>
                ))}
              </section>
            )}

            {keg.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-widest" style={{ color: C.accent, fontFamily: "var(--font-brand)" }}>Keg</h2>
                {keg.map((l) => <Item key={l.id} line={l} beerById={beerById} />)}
              </section>
            )}

            {cider.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-widest" style={{ color: C.accent, fontFamily: "var(--font-brand)" }}>Draught cider</h2>
                {cider.map((l) => <Item key={l.id} line={l} beerById={beerById} />)}
              </section>
            )}


            <p className="text-center text-xs" style={{ color: C.muted }}>Please confirm allergens with staff before ordering.</p>
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
    const pmeta = previewBeer ? [DRINK_TYPES.find((t) => t.key === previewLine.drinkType)?.label, previewBeer.style, `${previewBeer.abv}%`, previewLine.price ? `£${previewLine.price}` : "no price set", previewLine.size ? previewLine.size.replace("Bag-in-box ", "").replace("Keg ", "") : ""].filter(Boolean).join("  ·  ") : "";
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(32, 59, 67,0.45)" }} onClick={close}>
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
                {previewBeer.notes && <div><Eyebrow>Tasting notes</Eyebrow><ul className="space-y-1">{splitNote(previewBeer.notes).map((line, i) => <li key={i} className="flex gap-1.5 text-sm leading-snug text-slate-600"><span style={{ color: C.accent }}>•</span><span>{line}.</span></li>)}</ul></div>}
                <div>
                  <Eyebrow>Allergens</Eyebrow>
                  {previewBeer.allergens.length ? <div className="flex flex-wrap gap-1.5">{previewBeer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
                  {!previewBeer.allergensVerified ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                      <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not staff verified yet</span>
                      {canService && <button onClick={() => verify(previewBeer.id)} className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90" style={{ background: C.accent }}>Verify</button>}
                    </div>
                  ) : <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: C.accent }}><CheckCircle2 size={15} /> Verified by staff</p>}
                </div>
              </div>
              <div className="sticky bottom-0 border-t bg-white p-4" style={{ borderColor: C.line }}>
                {canService && <button onClick={() => doSwap(previewLine.id, swap.oldId, swap.slot)} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Check size={16} /> {swap.toRack ? "Rack this cask" : "Put on"}</button>}
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-white p-4" style={{ borderColor: C.line }}>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>{swap.toRack ? "Rack from store" : "Choose next"}</h2>
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
                        <button key={l.id} onClick={() => setSwapPreviewId(l.id)} className="relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-xl border py-3 pr-3 text-left transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.paper, borderColor: C.line, paddingLeft: 20 }}>
                          <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
                            <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[beer && beer.category] || CAT_ACCENT.Misc }} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <CatDot category={beer.category} />
                              <span className="font-normal leading-snug" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{(() => { const t = splitTitle(beer.brewery, beer.name, beer.collabBrewery); return <>{t.lead && <span className="font-semibold" style={{ color: C.ink }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()}</span>
                            </span>
                            <span className="block truncate text-sm font-medium text-slate-600">{[beer.style || "", beer.abv ? `${beer.abv}%` : ""].filter(Boolean).join("  ·  ")}</span>
                            <span className="block truncate text-xs text-slate-400">{locationDisplay(beer)}</span>
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

  const CombineModal = () => {
    if (!combineCandidate) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(32, 59, 67,0.45)" }} onClick={() => { setCombineCandidate(null); setCombineKeepId(null); }}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop p-5" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)" }}>Combine these two?</h2>
          <p className="mt-1 text-sm text-slate-500">Pick which one to keep. All stock history from the other moves across to it, then it's deleted.</p>
          <div className="mt-3 space-y-2">
            {combineCandidate.map((b) => (
              <button key={b.id} onClick={() => setCombineKeepId(b.id)} className="w-full rounded-lg border p-3 text-left transition" style={{ borderColor: combineKeepId === b.id ? C.accent : C.line, background: combineKeepId === b.id ? "#EFF6F5" : "white" }}>
                <div className="flex items-center gap-2">
                  <input type="radio" checked={combineKeepId === b.id} readOnly className="h-4 w-4" />
                  <span className="font-semibold" style={{ color: C.ink, fontFamily: "var(--font-display)" }}>{b.brewery || "?"} - {b.name}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-slate-500">{[b.style || "", b.abv ? `${b.abv}%` : "", locationDisplay(b)].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 pl-6 text-xs text-slate-400">{(b.history || []).length} recorded {(b.history || []).length === 1 ? "delivery" : "deliveries"}{b.archived ? " · archived" : ""}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { const drop = combineCandidate.find((b) => b.id !== combineKeepId); if (drop) combineBeers(combineKeepId, drop.id); }} className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-90" style={{ background: C.ink }}>Combine, keep this one</button>
            <button onClick={() => { setCombineCandidate(null); setCombineKeepId(null); }} className="rounded-lg border px-3 py-2 text-sm font-medium text-slate-600" style={{ borderColor: C.line }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const EditBeerScreen = () => (
    <EditBeer
      editBeerId={editBeerId} editBeerLineId={editBeerLineId} beerById={beerById} lines={lines} canEdit={canEdit}
      updateBeer={updateBeer} updateBeerPrice={updateBeerPrice} setCaskOwner={setCaskOwner} setBestBefore={setBestBefore} setLineDrinkType={setLineDrinkType} toggleBeerAllergen={toggleBeerAllergen}
      autoFillBeer={autoFillBeer} editBusy={editBusy} editNote={editNote} latestPrice={latestPrice}
      setEditBeerId={setEditBeerId} setEditBeerLineId={setEditBeerLineId} setEditNote={setEditNote}
      deleteBeer={deleteBeer} beerIsDeletable={beerIsDeletable} beerArchiveDeletable={beerArchiveDeletable}
    />
  );

  const CardModal = () => {
    if (!openLine && !libraryOpenId) return null;
    const beer = openLine ? beerById[openLine.beerId] : beerById[libraryOpenId];
    if (!beer) return null;
    const close = () => { setOpenId(null); setLibraryOpenId(null); };
    const f = openLine ? freshness(openLine) : null;
    const bb = openLine ? bbStatus(openLine) : null;
    const flow = openLine ? flowFor(openLine.drinkType) : [];
    const stageIdx = openLine ? flow.indexOf(openLine.status) : -1;
    const alert = (f && openLine.status === "on" && f.level === "check") ? { Icon: Clock, text: f.text } : null;
    const AlertIcon = alert ? alert.Icon : null;
    const sizeShort = openLine && openLine.size ? openLine.size.replace("Bag-in-box ", "").replace("Keg ", "") : "";
    const meta = openLine
      ? [DRINK_TYPES.find((t) => t.key === openLine.drinkType)?.label, beer.style, extraSweetness(beer) || null, `${beer.abv}%`, sizeShort].filter(Boolean).join("  ·  ")
      : [beer.style, extraSweetness(beer) || null, beer.abv ? `${beer.abv}%` : null].filter(Boolean).join("  ·  ");
    const measures = priceTriple(openLine ? openLine.price : (latestPrice(beer) || beer.price));
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 cc-overlay" style={{ background: "rgba(32, 59, 67,0.45)" }} onClick={close}>
        <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl cc-pop" style={{ maxHeight: "92vh", overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }} onClick={(e) => e.stopPropagation()}>
          <div className="relative sticky top-0 z-10 flex items-start justify-between gap-3 p-4 pl-5" style={{ background: "linear-gradient(180deg, #274852 0%, #203B43 100%)", boxShadow: "0 1px 0 rgba(138, 207, 206,0.28)" }}>
            <span aria-hidden="true" title={beer.category || "Misc"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.ink }}>
              <span style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 11, background: CAT_ACCENT[beer.category] || CAT_ACCENT.Misc }} />
            </span>
            <div className="min-w-0">
              <div>
                <h2 className="text-xl font-normal leading-snug" style={{ color: C.cream, fontFamily: "var(--font-display)", letterSpacing: "0.01em" }}>{(() => { const t = splitTitle(beer.brewery, beer.name, beer.collabBrewery); return <>{t.lead && <span className="font-bold" style={{ color: C.cream }}>{t.lead}</span>}{t.lead ? " " : ""}{t.rest}</>; })()}</h2>
              </div>
              {locationDisplay(beer) ? <p className="mt-1 text-xs font-semibold uppercase" style={{ color: C.accentSoft, letterSpacing: "0.14em", fontFamily: "var(--font-data)" }}>{locationDisplay(beer)}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => copyBeerName(beer)} title="Copy brewery and beer name" className="rounded-lg p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ color: "rgba(243,239,230,0.75)" }}><Copy size={16} /></button>
              <button onClick={close} className="rounded-lg p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ color: "rgba(243,239,230,0.75)" }}><X size={18} /></button>
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

            {beer.notes && <div><Eyebrow>Tasting notes</Eyebrow><ul className="space-y-1">{splitNote(beer.notes).map((line, i) => <li key={i} className="flex gap-1.5 text-sm leading-snug text-slate-600"><span style={{ color: C.accent }}>•</span><span>{line}.</span></li>)}</ul></div>}

            <div>
              <Eyebrow>Allergens</Eyebrow>
              {beer.allergens.length ? <div className="flex flex-wrap gap-1.5">{beer.allergens.map((a) => <Badge key={a} className="bg-slate-100 text-slate-700 border-slate-200">{a}</Badge>)}</div> : <p className="text-sm text-slate-500">None recorded.</p>}
              {!beer.allergensVerified ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                  <span className="flex items-center gap-1.5"><AlertTriangle size={15} /> Not staff verified yet</span>
                  {canService && <button onClick={() => verify(beer.id)} className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90" style={{ background: C.accent }}>Verify</button>}
                </div>
              ) : <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: C.accent }}><CheckCircle2 size={15} /> Verified by staff</p>}
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
                        <div className="h-1 rounded-full" style={{ background: done ? (STAGE_ACCENT[key] || C.accent) : "#E6E2D8" }} />
                        <p className="mt-1 text-xs leading-tight" style={{ color: cur ? C.ink : "#5E7278", fontWeight: cur ? 600 : 400 }}>{s.key === "tapped" ? "Tapped" : s.label}</p>
                      </div>
                    );
                  })}
                </div>
                {alert && <p className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">{AlertIcon && <AlertIcon size={13} />} {alert.text}</p>}
                {canService && (
                <div className="mt-3 flex gap-2">
                  {stageIdx > 0 && <button onClick={() => goBack(openLine.id)} className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><ArrowRight size={15} className="rotate-180" /> Back to {flow[stageIdx - 1] === "tapped" ? "Tapped" : STATUS_BY_KEY[flow[stageIdx - 1]].label}</button>}
                  {openLine.status === "on"
                    ? <button onClick={() => finishAndChoose(openLine)} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}><Check size={16} /> Line finished</button>
                    : stageIdx < flow.length - 1
                      ? <button onClick={() => advance(openLine.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: C.ink }}>Advance to {flow[stageIdx + 1] === "tapped" ? "Tapped" : STATUS_BY_KEY[flow[stageIdx + 1]].label} <ArrowRight size={15} /></button>
                      : null}
                </div>
                )}
                {openLine.status === "off" && openLine.drinkType !== "cider" && openLine.drinkType !== "keykeg" && (openLine.collected
                  ? <p className="mt-2.5 flex items-center gap-1.5 text-sm" style={{ color: C.accent }}><CheckCircle2 size={15} /> Empty collected</p>
                  : canService && <button onClick={() => markCollected(openLine.id)} className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400" style={{ borderColor: C.line }}><Check size={15} /> Mark empty collected</button>)}
              </div>
            )}

            {canEdit && (
            <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: C.line }}>
              <button onClick={() => { setEditBeerId(beer.id); setEditBeerLineId(openLine ? openLine.id : null); close(); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"><Pencil size={15} /> Edit details</button>
              {openLine && <button onClick={() => duplicateLine(openLine.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"><Copy size={15} /> Duplicate</button>}
              {openLine && <button onClick={() => removeLine(openLine.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700"><Trash2 size={15} /> Remove</button>}
            </div>
            )}
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
            <img src={PUB_LOGO} alt="" className="mx-auto mb-2.5" style={{ width: 104, height: 104 }} />
            <p className="text-2xl font-bold" style={{ color: C.cream, fontFamily: "var(--font-brand)", letterSpacing: "0.03em" }}>{PUB_CONFIG.name}</p>
            <p className="mt-1 text-xs uppercase tracking-widest" style={{ color: C.accentSoft }}>Cellar Management</p>
          </div>
          {authChecking ? (
            <p className="text-center text-sm" style={{ color: C.accentSoft }}>Checking…</p>
          ) : !authed ? (
            <div className="space-y-3">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }} placeholder="Pub password" autoFocus className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" style={{ background: "rgba(255,255,255,0.08)", color: C.cream, border: `1px solid ${C.accent}` }} />
              {authErr && <p className="text-xs" style={{ color: "#E4958B" }}>{authErr}</p>}
              <button onClick={doLogin} disabled={authBusy || !pw.trim()} className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50" style={{ background: C.accent, color: C.ink }}>{authBusy ? "Signing in…" : "Unlock"}</button>
            </div>
          ) : (
            <p className="text-center text-sm" style={{ color: C.accentSoft }}>Loading the cellar…</p>
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
          <AlertTriangle className="mx-auto mb-3" size={28} color={C.accentSoft} />
          <p className="text-lg font-semibold" style={{ color: C.cream, fontFamily: "var(--font-display)" }}>Could not load the cellar</p>
          <p className="mt-2 text-sm" style={{ color: "rgba(243,239,230,0.7)" }}>Check your connection and try again. Editing stays paused until this loads, so nothing gets overwritten.</p>
          <button onClick={() => loadCellar()} className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold transition active:scale-95" style={{ background: C.accent, color: C.ink }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col" style={{ background: "linear-gradient(180deg, #D3E3E1 0%, #E9E9E6 40%, #F6EDE5 100%)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", height: "100dvh", overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap');
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
.cc-elev{box-shadow:0 1px 2px rgba(32, 59, 67,0.05), 0 8px 20px -12px rgba(32, 59, 67,0.16);}
.cc-elev-lg{box-shadow:0 1px 3px rgba(32, 59, 67,0.06), 0 16px 34px -18px rgba(32, 59, 67,0.22);}
.cc-tile{box-shadow:0 1px 2px rgba(32, 59, 67,0.06), 0 6px 14px -8px rgba(32, 59, 67,0.18);transition:transform .16s cubic-bezier(.16,1,.3,1), box-shadow .2s ease}
.cc-tile:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(32, 59, 67,0.07), 0 12px 24px -10px rgba(32, 59, 67,0.24)}
.cc-tile:active{transform:scale(.975)}
@media (prefers-reduced-motion: reduce){.cc-fade,.cc-rise,.cc-stagger>*,.cc-overlay,.cc-pop,.cc-sheet{animation:none}.cc-press{transition:none}}
.text-slate-300{color:#99ADB2!important}.text-slate-400{color:#51666C!important}
.text-slate-500{color:#4B5D63!important}.text-slate-600{color:#3B4A4E!important}
.text-slate-700{color:#2E3A3D!important}.border-slate-200{border-color:#E0DAD4!important}
.border-slate-300{border-color:#CFC7BF!important}.bg-slate-50{background-color:#F3EEE9!important}
.bg-slate-100{background-color:#EAE3DC!important}.hover\:bg-slate-50:hover{background-color:#F3EEE9!important}
.hover\:text-slate-600:hover{color:#3B4A4E!important}.hover\:text-slate-700:hover{color:#2E3A3D!important}
.focus\:ring-slate-300:focus{--tw-ring-color:#CFC7BF!important}
.focus\:ring-slate-400:focus{--tw-ring-color:#51666C!important}
.focus\:ring-teal-300:focus{--tw-ring-color:#8ACFCE!important}
input::placeholder,textarea::placeholder{color:#4A5D63!important;opacity:1!important}
.text-slate-800{color:#263236!important}.text-slate-900{color:#1B2528!important}
.text-emerald-700{color:#1F6B6A!important}.bg-emerald-50{background-color:#E7F1F0!important}
.border-emerald-200{border-color:#BFD9D7!important}
.text-red-600{color:#B23A2C!important}.text-red-700{color:#9A3226!important}
.hover\:text-red-700:hover{color:#9A3226!important}
.text-amber-500{color:#B23A2C!important}.text-amber-700{color:#8E3426!important}
.text-amber-800{color:#7A2D21!important}.text-amber-900{color:#66261C!important}
.bg-amber-50{background-color:#FBF0ED!important}.border-amber-200{border-color:#EFD3CC!important}`}</style>
      {view === "taplist" ? TapList() : (<>
      <header className="no-print relative z-40 border-b" style={{ background: "linear-gradient(180deg, #274852 0%, #203B43 100%)", borderColor: "rgba(138, 207, 206,0.35)", boxShadow: "0 1px 0 rgba(138, 207, 206,0.22), 0 10px 26px -18px rgba(0,0,0,0.65)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <button onClick={() => setShowAlerts((v) => !v)} className="relative flex items-center rounded-lg p-0.5 transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-teal-300" aria-label={`Needs attention: ${attentionItems.length}`}>
                <Bell size={19} style={{ color: attentionItems.length ? C.accentSoft : "rgba(138,207,206,0.6)", flexShrink: 0 }} />
                {attentionItems.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid place-items-center rounded-full px-1" style={{ height: 16, minWidth: 16, background: C.alert, color: "#fff", fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{attentionItems.length > 9 ? "9+" : attentionItems.length}</span>
                )}
              </button>
              {showAlerts && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAlerts(false)} />
                  <div className="cc-pop absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border bg-white shadow-xl" style={{ borderColor: C.line }}>
                    <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: C.line }}>
                      <AlertTriangle size={13} style={{ color: C.accent }} />
                      <span className="uppercase" style={{ color: C.accent, fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>Needs attention</span>
                    </div>
                    {attentionItems.length === 0 ? (
                      <div className="px-3 py-6 text-center">
                        <CheckCircle2 size={20} className="mx-auto mb-1.5" style={{ color: C.accent }} />
                        <p className="text-sm text-slate-500">All good. Nothing needs a look right now.</p>
                      </div>
                    ) : (
                      <ul className="max-h-80 overflow-y-auto py-1" style={{ overscrollBehaviorY: "none", WebkitOverflowScrolling: "touch", touchAction: "manipulation" }}>
                        {attentionItems.map((a, i) => (
                          <li key={`${a.id}-${i}`}>
                            <button onClick={() => { setShowAlerts(false); a.backup ? go("backup") : a.lineCare ? go("lines") : (go("cellar"), setOpenId(a.id)); }} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 focus:outline-none" style={{ color: a.warn ? C.alert : C.inkSoft }}>
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.warn ? C.alert : C.accent }} />
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
            <p className="text-base font-semibold leading-none" style={{ color: C.cream, fontFamily: "var(--font-brand)", letterSpacing: "0.025em" }}>{PUB_CONFIG.name}</p>
            <p className="hidden sm:inline" style={{ color: C.accentSoft, fontFamily: "var(--font-data)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", lineHeight: 1 }}>Cellar</p>
          </div>
          <nav className="relative hidden items-center gap-1 sm:flex">
            <NavButton id="cellar" icon={ClipboardList} label="Cellar" view={view} go={go} />
            {canEdit && <NavButton id="add" icon={Plus} label="Add" view={view} go={go} />}
            <NavButton id="empties" icon={Package} label="Empties" view={view} go={go} />
            <button onClick={() => setMenuOpen((v) => !v)} style={{ color: C.cream }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-teal-300"><MoreHorizontal size={16} /><span className="hidden sm:inline">More</span></button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border bg-white shadow-lg" style={{ borderColor: C.line }}>
                  {[["guide", "How to Use", Compass], ["library", "Library", BookOpen], ["stock", "Stock List", Beer], ["allergens", "Allergen Sheet", FileText], ["taplist", "Customer Tap List", QrCode], ["lines", "Line Cleaning", Droplet], ...(canEdit ? [["libtools", "Library Tools", Wrench]] : []), ...(TENANT_FEATURES.cellarStats ? [["stats", "Cellar Stats", BarChart3]] : []), ["notify", "Notifications", Bell], ...(canEdit ? [["backup", "Backup & Restore", Database]] : [])].map(([id, label, Icon]) => (
                    <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Icon size={15} className="text-slate-400" />{label}</button>
                  ))}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>
      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehaviorY: "none", paddingBottom: "env(safe-area-inset-bottom)", ...((openId || libraryOpenId || editBeerId || swap || showAlerts || menuOpen || combineCandidate) ? { overflow: "hidden", overflowY: "hidden", WebkitOverflowScrolling: "auto", touchAction: "none" } : { WebkitOverflowScrolling: "touch" }) }}>
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-28 sm:pb-6">
        {!hydrated ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading your cellar…</div>
        ) : (
          <>
            {VIEW_TITLES[view] && (
              <div className="no-print mb-5">
                <h1 className="text-2xl font-bold" style={{ color: C.ink, fontFamily: "var(--font-brand)", letterSpacing: "0.02em" }}>{VIEW_TITLES[view]}</h1>
                <div className="mt-2 h-1 w-10 rounded-full" style={{ background: C.accent }} />
              </div>
            )}
            <div key={view} className="cc-fade">
            {view === "cellar" && Cellar()}
            {view === "add" && AddForm()}
            {view === "library" && Library()}
            {view === "allergens" && AllergenSheet()}
            {view === "stock" && StockSheet()}
            {view === "empties" && Empties()}
            {view === "lines" && LineCare()}
            {view === "libtools" && LibraryTools()}
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

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-white sm:hidden" style={{ borderColor: C.line, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -6px 22px -14px rgba(32, 59, 67,0.4)" }}>
        <div className="mx-auto flex max-w-md items-end justify-around px-2">
          <BottomTab id="cellar" icon={ClipboardList} label="Cellar" view={view} go={go} />
          <BottomTab id="library" icon={BookOpen} label="Library" view={view} go={go} />
          {canEdit && (
            <button onClick={() => go("add")} className="flex flex-1 flex-col items-center justify-center transition active:scale-95 focus:outline-none">
              <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full" style={{ background: C.accent, color: C.ink, boxShadow: "0 6px 16px -6px rgba(138, 207, 206,0.65)" }}><Plus size={24} /></span>
              <span className="mt-0.5 text-xs font-medium" style={{ color: view === "add" ? C.accent : C.inkSoft }}>Add</span>
            </button>
          )}
          <BottomTab id="empties" icon={Package} label="Empties" view={view} go={go} />
          <BottomTab id="more" icon={MoreHorizontal} label="More" onClick={() => setMenuOpen(true)} view={view} go={go} />
        </div>
      </nav>

      {menuOpen && (
        <div className="no-print fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 cc-overlay" style={{ background: "rgba(32, 59, 67,0.45)" }} onClick={() => setMenuOpen(false)} />
          <div className="cc-sheet absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: C.line }} />
            <div className="grid grid-cols-3 gap-2.5">
              {(() => {
                const menuItems = [["guide", "How to Use", Compass], ["stock", "Stock List", Beer], ["allergens", "Allergen Sheet", FileText], ["taplist", "Customer Tap List", QrCode], ["lines", "Line Cleaning", Droplet], ...(canEdit ? [["libtools", "Library Tools", Wrench]] : []), ...(TENANT_FEATURES.cellarStats ? [["stats", "Cellar Stats", BarChart3]] : []), ["notify", "Notifications", Bell], ...(canEdit ? [["backup", "Backup & Restore", Database]] : [])];
                return menuItems.map(([id, label, Icon], i) => {
                  const lone = i === menuItems.length - 1 && menuItems.length % 3 === 1;
                  return (
                    <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition active:scale-95${lone ? " col-span-3" : ""}`} style={{ borderColor: C.line, color: C.ink, minHeight: 84 }}>
                      <Icon size={20} style={{ color: C.accent }} />
                      <span className="text-center text-xs font-medium leading-tight">{label}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
      </>)}
      {toast && (
        <div className="no-print fixed inset-x-0 bottom-40 flex justify-center px-4 sm:bottom-16" style={{ zIndex: 60 }}>
          <div className="cc-pop flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white shadow-lg" style={{ background: C.ink }}>
            <AlertTriangle size={14} style={{ color: C.accentSoft }} />
            <span>{toast}</span>
          </div>
        </div>
      )}
      {undoState && (
        <div className="no-print fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-4">
          <div className="flex items-center gap-3 rounded-full px-4 py-2 text-sm text-white shadow-lg" style={{ background: C.ink }}>
            <span>{undoState.label}</span>
            <button onClick={doUndo} className="font-semibold" style={{ color: C.accentSoft }}>Undo</button>
          </div>
        </div>
      )}
      {CardModal()}
      {EditBeerScreen()}
      {SwapChooser()}
      {CombineModal()}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, showDetails: false }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.lastInfo = info; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center" style={{ background: "linear-gradient(180deg, #D3E3E1 0%, #E9E9E6 40%, #F6EDE5 100%)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div className="w-full max-w-sm rounded-2xl border bg-white p-6" style={{ borderColor: "#E6E2D8" }}>
          <p className="text-lg font-bold" style={{ color: "#203B43" }}>Something went wrong</p>
          <p className="mt-2 text-sm text-slate-600">The app hit a problem and needs a reload. Your cellar data lives in the cloud, not in this screen, so nothing here is lost, reloading is safe.</p>
          <button onClick={() => window.location.reload()} className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "#203B43" }}>Reload the app</button>
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
