// Serverless push sender. The app calls /api/notify when a beer goes on or off;
// this verifies the caller is a signed-in staff member, reads every device
// subscription from Supabase, and sends the push to each one.
// Lives at api/notify.js. Requires env vars (set in Vercel dashboard):
//   SUPABASE_SERVICE_ROLE_KEY  - Supabase > Settings > API > service_role key
//   VAPID_PRIVATE_KEY          - provided in SETUP-NOTIFICATIONS.md
import webpush from "web-push";

const SB_URL = "https://fnqhrckxmzioinbokicb.supabase.co";
// The anon key is public by design (it ships in the app bundle already).
const SB_ANON = "sb_publishable_RyO06sDdZg3bH7Mt6hwHEQ_EA9RNkJ8";
const VAPID_PUBLIC = "BN-lqhCSKqtRWwfwxJMnnsj_e9BZ5kXzaIya9Zi7P8eNYgQZHrBiT5xkhc0AyVixtzolnxD6fesELFarqisdwIE";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!service || !vapidPrivate) { res.status(500).json({ error: "Server not configured" }); return; }

  const { token, title, body, tag, exclude } = req.body || {};
  if (!token || !title) { res.status(400).json({ error: "Missing token or title" }); return; }

  // Verify the caller: the token must belong to a live staff session.
  try {
    const who = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, authorization: `Bearer ${token}` },
    });
    if (!who.ok) { res.status(401).json({ error: "Not signed in" }); return; }
  } catch (e) { res.status(401).json({ error: "Auth check failed" }); return; }

  webpush.setVapidDetails("mailto:hello@thecurfew.bar", VAPID_PUBLIC, vapidPrivate);

  // Fetch every subscribed device.
  let subs = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/push_subs?select=endpoint,sub`, {
      headers: { apikey: service, authorization: `Bearer ${service}` },
    });
    subs = await r.json();
    if (!Array.isArray(subs)) subs = [];
  } catch (e) { res.status(500).json({ error: "Could not read subscriptions" }); return; }

  const payload = JSON.stringify({ title, body: body || "", tag: tag || "curfew-cellar" });
  const gone = [];
  await Promise.all(subs.map(async (row) => {
    if (exclude && row.endpoint === exclude) return; // don't ping the phone that made the change
    try {
      await webpush.sendNotification(row.sub, payload);
    } catch (e) {
      // 404/410 mean the device unsubscribed or the subscription expired; clean it up.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(row.endpoint);
    }
  }));

  if (gone.length) {
    await Promise.all(gone.map((endpoint) =>
      fetch(`${SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        headers: { apikey: service, authorization: `Bearer ${service}` },
      }).catch(() => {}) // best effort
    ));
  }

  res.status(200).json({ sent: true });
}
