# The Curfew Cellar

Micropub cellar management for cask, keg and cider. React + Vite, hosted on Vercel.

## What you need
- A GitHub account (stores the code)
- A Vercel account (hosts the site, free)
- An Anthropic API key (powers the label and invoice scanning, pay as you go)

## One-time setup
1. Put this folder in a GitHub repository.
2. Import the repo into Vercel (it auto-detects Vite).
3. In Vercel, add an Environment Variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
4. Deploy. Vercel gives you a URL.

The API key lives only in Vercel (server side), never in the app or in GitHub.

## How the AI calls work
The app calls `/api/anthropic`. That serverless function (`api/anthropic.js`)
adds your secret key and forwards the request to Anthropic. The scanner uses
Claude Sonnet with vision and web search to read labels and look up details.

## Updating later
Edit `src/App.jsx` in GitHub, commit, and Vercel redeploys in about a minute.
Your saved cellar data lives in each device's browser, so updates don't wipe it.

## Notes
- Data is stored per device (browser localStorage). Different phones see
  different data. Shared cloud data + logins is a future step.
- AI allergen readings are always flagged unverified. Staff must confirm.
