# Campflow

Multi-institution campus complaint management system. Students report facility
issues (plumbing, electricity, cleanliness, internet) with AI-assisted intake;
departments receive routed work queues; administrators manage users,
departments, routing, and analytics — all inside strict per-institution
data isolation.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite, Tailwind CSS v4, React Router 7, Recharts |
| Database | Supabase Postgres (RLS everywhere, `pg_trgm` for duplicate detection) |
| Auth | Supabase Auth (email verification, invites, password recovery) |
| Storage | Supabase Storage — private `complaint-attachments` bucket, signed URLs |
| Backend | Supabase Edge Functions (Deno) for every privileged write |
| AI | Google Gemini — complaint interpretation, categorization, follow-ups |
| Email | Supabase Auth templates (verify/invite/reset) + Resend for notifications |

## Repository layout

```
src/                    React app
  components/           UI kit, AppShell, complaint widgets, AuthLayout
  context/              AuthContext (session+profile), ToastContext
  lib/                  supabase client, types, edge-function caller, utils
  pages/                landing, auth/*, student/*, staff/*, admin/*, shared/*
supabase/
  migrations/           0001_schema.sql (tables+RLS), 0002_storage.sql (bucket)
  functions/            edge functions + _shared helpers
  seed.sql              optional demo institution (dev only)
  config.toml           local `supabase start` configuration
```

## Prerequisites

- Node 20+
- A Supabase project (or Docker + Supabase CLI for a fully local stack)
- Optional: Google Gemini API key, Resend API key

## Setup — cloud Supabase

1. **Install & configure env**

   ```bash
   npm install
   cp .env.example .env
   ```

   Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
   *Supabase → Project Settings → API*.

2. **Apply migrations** — already applied to this project via psql. To
   re-apply or run them yourself (direct host is IPv6-only; the pooler works
   everywhere):

   ```bash
   PGPASSWORD='<db password>' psql \
     -h aws-0-ap-south-1.pooler.supabase.com -p 5432 \
     -U postgres.ddnccmwppfegkaeszckz -d postgres \
     -f supabase/migrations/0001_schema.sql \
     -f supabase/migrations/0002_storage.sql \
     -f supabase/migrations/0003_hardening.sql
   ```

3. **Deploy edge functions** — requires a personal access token from
   https://supabase.com/dashboard/account/tokens (the project API keys are
   data-plane keys and can't deploy functions):

   ```bash
   npx supabase login                    # or: export SUPABASE_ACCESS_TOKEN=sbp_...
   npx supabase link --project-ref ddnccmwppfegkaeszckz
   npx supabase functions deploy register-institution invite-users accept-invitation \
     join-institution review-join-request admin-manage-users activate-institution \
     ai-intake submit-complaint update-complaint retry-email-deliveries
   ```

4. **Set function secrets** (never in the browser / `.env` used by Vite)

   ```bash
   npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash \
     GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" \
     EMAIL_FROM="Campflow <you@gmail.com>" SITE_URL=http://localhost:5173
   ```

   Email providers tried in order: **Resend** (`RESEND_API_KEY`) → **Gmail SMTP**
   (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, port 465 TLS app password) → delivery
   logged `skipped` if neither is set. App passwords live at
   myaccount.google.com/apppasswords (requires 2FA).

   For **Supabase Auth emails** (verification, invites, password reset) also set
   the same Gmail in Dashboard → Authentication → SMTP Settings:
   host `smtp.gmail.com`, port `465`, SSL on, user/pass = same credentials.

   Without `GEMINI_API_KEY` the AI step shows a manual fallback; without an email
   provider deliveries are logged `skipped` in `email_deliveries`
   (Admin → Settings shows the log + a retry button).

5. **Auth URLs** — in *Supabase → Authentication → URL Configuration* set:
   - Site URL: `http://localhost:5173` (or your deployed origin)
   - Redirect URLs: `http://localhost:5173/**`

6. **Run**

   ```bash
   npm run dev
   ```

## Setup — fully local (`supabase start`)

```bash
supabase start        # prints local URL + anon key
supabase db reset     # applies migrations + seed.sql (demo institution)
supabase functions serve --env-file .env.local
```

Put local keys in `.env` (`http://localhost:54321` + printed anon key) and the
secrets in `.env.local` for the functions runtime.

## How the pieces fit

### Registration → activation
`register-institution` (unauthenticated edge function) validates the form,
guards against duplicate institution names/emails, creates an **unconfirmed**
admin auth user, a `pending` institution, and the admin profile — rolling back
on any failure. Verification email goes via Resend when configured, otherwise
the client triggers Supabase's own signup-resend email. On first sign-in the
`activate-institution` function flips the institution to `active` once
`email_confirmed_at` is set.

### Membership
- **Invitations**: `invite-users` (admin only) creates `invitations` rows and
  calls `auth.admin.inviteUserByEmail`. Accepting (`/auth/accept-invite` →
  `accept-invitation`) creates the profile inside the inviting institution and
  optionally a department membership. Invites expire in 14 days; resend via
  `admin-manage-users`.
- **Institution code join**: a verified account submits a `join_request`;
  `review-join-request` (admin) approves → profile created. The code alone
  never grants access.

### Complaints
All writes flow through edge functions (RLS denies direct updates):

- `ai-intake` → Gemini extraction, category suggestion, follow-up questions,
  and department suggestion **from the institution's routing rules** (never
  invented by the model). Falls back to manual entry if Gemini is down.
- `submit-complaint` → idempotent (`idempotency_key` unique per user), ticket
  number `CC-<CODE>-00001` from a locked counter, attachment metadata,
  `created` event, pg_trgm duplicate candidates into `complaint_links`
  (staff review only — nothing auto-merges), department routing, and
  notifications + email.
- `update-complaint` → status machine `new → assigned → in_progress →
  resolved → closed/reopened`, assignment (admin or dept head, validated
  against active staff/membership), public + internal notes, info requests,
  link review. Every change writes a `complaint_events` row and notifies the
  reporter.

### Security model
- RLS on every table; institution scoping via `my_institution()`.
- Students: own complaints/events only, no internal notes, no other profiles.
- Teachers: complaints assigned to them or to departments where they hold
  `head`/`teacher` membership.
- Admins: full access inside their own institution only.
- Guard triggers block privilege escalation (role/status/institution changes),
  note-only event inserts, and link-structure edits.
- Storage: private bucket, path = `<institution_id>/…`, 5 MB image cap,
  read via signed URLs.
- No service-role/Gemini/Resend keys in the frontend — all privileged work
  runs in edge functions that re-check the caller's role.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `.env` (frontend) | Supabase project access |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | function secrets | AI complaint intake |
| `RESEND_API_KEY` / `EMAIL_FROM` | function secrets | Notification emails |
| `SITE_URL` | function secrets | Links inside emails |

## Test procedure

1. Register institution A → verify admin email → sign in → create departments
   → set heads → add routing rules → invite a teacher and a student.
2. Teacher accepts invite (email link → set password). Student accepts invite.
3. Student submits a complaint with a photo → AI review → ticket number shown;
   routed department staff get a notification + email (if Resend configured).
4. Teacher opens the queue, assigns the ticket, moves it to in progress,
   resolves with notes. Student confirms resolved / reopens.
5. Submit a second similar complaint → duplicate suggestion appears on the
   staff detail page → mark related or dismiss.
6. Register institution B and confirm zero cross-visibility (users,
   complaints, attachments all isolated by RLS).
7. Negative checks: expired invite, wrong institution code, deactivated
   account sign-in, oversized photo, missing `GEMINI_API_KEY` (manual
   fallback), missing `RESEND_API_KEY` (deliveries logged `skipped`).

## Scripts

```bash
npm run dev       # dev server
npm run build     # typecheck + production build
npm run lint      # oxlint
npm run preview   # serve the production build
```

## Public website and onboarding

The public homepage uses a white canvas with lavender, yellow, and pink feature
panels, campus photography, and animated product illustrations. Category controls
change the example report, audience controls explain each role, and a keyboard
accessible tour walks through reporting, routing, and resolution with optional
automatic playback. Its examples are illustrative; account and complaint
operations still use Supabase. The homepage stays available when signed in,
with a link back to the user's workspace.

`src/pages/Landing.tsx` and `src/pages/landing.css` contain the public design.
`src/components/AuthLayout.tsx` applies the same identity to authentication and
institution onboarding. Motion can be paused from the hero and automatically
respects the system's reduced-motion preference.

Manrope is served locally from `public/fonts`, with its SIL license included.
Campus imagery in `public/images` comes from Unsplash:
[campus](https://images.unsplash.com/photo-1562774053-701939374585),
[community](https://images.unsplash.com/photo-1523240795612-9a054b0db644),
[study](https://images.unsplash.com/photo-1434030216411-0b793f4b4173), and
[library](https://images.unsplash.com/photo-1507842217343-583bb7270b66).
The reporting illustration uses a [student portrait](https://images.unsplash.com/photo-1544717305-2782549b5136).
These images are illustrative and do not represent customer endorsements.
