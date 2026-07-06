The Curfew Cellar — Handoff Notes
Read this first, then read the attached TheCurfewCellar.jsx. This is a continuing project, not a new one. Kyle owns The Curfew Micropub (46a Bridge St, Berwick-upon-Tweed) and has been building this cellar management app entirely through Claude, with no development background himself. Match his communication preference: tight, scannable, British English, no em dashes, honest trade-offs, no filler.
How to start
	1.	Kyle will upload TheCurfewCellar.jsx (the current master file, attached alongside this doc) as his first message, or it’ll already be in context.
	2.	Treat it as the source of truth for “what’s built.” The last few changes in it may not be pushed to his live site yet — ask if unsure, don’t assume.
	3.	Skim the file structure before making changes: search for the constant/function names mentioned below rather than reading linearly, it’s ~3000 lines.
What this is
A React cellar-management web app, live on Vercel (curfew-cellar-ou5c.vercel.app), backed by Supabase for cloud sync across devices, private GitHub repo github.com/KylePatrickMew/curfew-cellar. Kyle runs it on his phone behind the bar.
File setup (critical, don’t skip)
	•	Master file: TheCurfewCellar.jsx — this is what you edit. Uses window.storage in the chat preview sandbox (which shows blank seed data — that’s expected, not data loss, it’s disconnected from Kyle’s real Supabase cloud).
	•	Deploy file: App.jsx — regenerated from the master file after EVERY change via one transform only: