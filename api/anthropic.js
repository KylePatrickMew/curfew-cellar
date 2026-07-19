// Serverless proxy. Keeps your Anthropic API key secret on the server.
// The app calls /api/anthropic with the signed-in staff member's Supabase session
// token attached; this verifies that token against Supabase before forwarding to
// Anthropic with your key. Without this check, anyone who found this URL (visible
// in any browser's network tab while using the app) could relay arbitrary requests
// through it on your Anthropic bill, with no limit. Mirrors the same check notify.js
// already does before sending a push.
const SB_URL = "https://fnqhrckxmzioinbokicb.supabase.co";
// The anon/publishable key is public by design (it ships in the app bundle already).
const SB_ANON = "sb_publishable_RyO06sDdZg3bH7Mt6hwHEQ_EA9RNkJ8";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Missing ANTHROPIC_API_KEY environment variable" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  try {
    const who = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, authorization: `Bearer ${token}` },
    });
    if (!who.ok) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
  } catch (e) {
    res.status(401).json({ error: "Auth check failed" });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
