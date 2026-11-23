# Connections: alpha app

The working alpha: sign in, set up a profile, hold up to 3 conversations, press "+" to
be paired, chat live, end or report a conversation, take it off the app. Product rules
are in [`docs/product-decisions.md`](../docs/product-decisions.md).

**Stack:** Next.js (React) on Vercel, with Supabase for the database, sign-in, live
chat and photo storage. The database schema is in
[`supabase/migrations/`](../supabase/migrations/).

## How it fits together

| Piece | Where |
| --- | --- |
| Screens | `src/app/`: `login`, `onboarding`, `/` (home: cards + "+" bar), `c/[id]` (chat), `settings` |
| Rules (matching, slots, age rule, endings, who can see what) | The database: functions and row level security in the migration |
| Tunable numbers (slots, overflow cap and wait, ghosting wait, age rule, message retention) | The `app_settings` table, one row. Change them in the Supabase dashboard |
| Pairing and ending emails | Database trigger → `src/app/api/notify/route.ts` → Resend |
| Waiting-list retries and overflow | A database schedule (`match_waiting`, every 10 minutes) |
| Old messages deleted after 30 days | A database schedule (`purge_old_messages`, nightly) |
| Reports | `reports` table, visible only in the Supabase dashboard |
| Waitlist | The marketing site's form (`index.html` at the repo root) calls `join_waitlist()` and saves to the `waitlist` table, visible only in the dashboard. Add `?ref=<name>` to a link to see where sign-ups came from (`source` column) |

The app talks to Supabase straight from the browser. That's safe because every rule
is enforced by the database itself: a user can only read their own conversations, can
only see profiles of people they've been paired with, and can only change things
through the functions above.

## Run it locally

Needs Node and Docker.

```bash
# from the repo root: start a local Supabase (ports 563xx)
npx supabase start
npx supabase db reset          # applies the schema

# from web/
cp .env.example .env.local     # fill in from `npx supabase status`
npm install
npm run dev -- --port 3100
node scripts/seed-demo.mjs     # demo people waiting to be paired
```

Sign-ups are closed (pre-alpha is invite-only), so let yourself in first:

```bash
node scripts/invite.mjs you@example.com
```

Open http://localhost:3100. Sign-in emails go to the local mail viewer at
http://127.0.0.1:56324.

## Pre-alpha: who gets in

- `node scripts/invite.mjs --list` shows the waitlist and who's been invited.
- `node scripts/invite.mjs ana@x.com ben@y.com` lets people in. Then tell them to sign in at the app's `/login`.
- `node scripts/invite.mjs --remove ana@x.com` takes someone out. This deletes their account, photos and conversations.
- For the hosted project, add `--env <file>`, where the file holds the hosted `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep that file out of git.
- Anyone can be paired with anyone while `app_settings.match_everyone` is true, which is the default. Set it to false to bring back the alpha rules (city, gender preferences, age rule).

- `node scripts/test-backend.mjs` checks the backend rules (42 checks) against the local database.
- `node scripts/seed-demo.mjs --clear` removes the demo people.

## Put it online

1. **Supabase:** create a project at supabase.com. Link and push the schema from the repo root:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   Then in the dashboard:
   - **Auth → Sign In / Providers: turn off "Allow new users to sign up".** This is what makes it invite-only online.
   - Auth → URL configuration: set the site URL to your Vercel address, and add `https://<your-app>/auth/callback` as a redirect URL.
   - Set up custom SMTP for sign-in emails, because Supabase's built-in sender is heavily rate-limited.
   - In the SQL editor, connect emails:
     ```sql
     update app_settings set notify_url = 'https://<your-app>/api/notify', notify_secret = '<a long random string>';
     ```
2. **Vercel:** import the GitHub repo as a new project, with **Root Directory: `web`**.
   Add the variables from `.env.example`. `NOTIFY_SECRET` must match the database's.
   The existing marketing prototype at the repo root keeps its own Vercel project.
3. **Waitlist:** in `index.html` at the repo root, fill in the hosted project's URL and
   anon key (search for `TODO`). Until then, the live form says the waitlist isn't open yet.
4. **Resend** (for pairing emails): create an API key, verify your sending domain, and set `RESEND_API_KEY` and `EMAIL_FROM`.
