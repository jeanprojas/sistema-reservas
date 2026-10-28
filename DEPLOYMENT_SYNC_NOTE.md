# VIP Norte — deployment sync

Production runtime is now designed for:

- Frontend: GitHub Pages.
- Backend/API: Supabase Edge Functions.
- Primary data: Supabase PostgreSQL.
- Google Sheets: asynchronous Supabase worker + Google Apps Script.

Vercel and Render are legacy infrastructure only and are not part of the new runtime path.

The Google Sheets webhook credentials must be stored only as Supabase Function secrets. They must never be committed to GitHub or exposed to the browser.
