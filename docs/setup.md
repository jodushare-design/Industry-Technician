# Setup

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22 LTS or newer (CI uses 22) | everything |
| npm | 10+ | workspaces |
| Supabase CLI | 2.x | migrations, type generation |
| Supabase account | — | a **dev** project (Mumbai region recommended) |
| Expo account | — | Android builds (EAS) — later |
| Docker Desktop | optional | only for `supabase start` (fully local stack) |

## 2. Install and run the tests

```powershell
npm install
npm run check
```

`npm run check` runs the guards, typechecks every workspace, and runs all tests. The database/RLS tests use PGlite (in-process Postgres), so no database or Docker is needed.

## 3. Create the Supabase dev project

1. Create a project at supabase.com (region: **Mumbai, ap-south-1**). Name it e.g. `itm-dev`. Never use the production project for development.
2. Link it and push the migrations:

   ```powershell
   supabase login
   ```
   ```powershell
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```powershell
   supabase db push
   ```
3. Load the seed data (registers the 12 legal documents as drafts). In the Supabase dashboard → SQL editor, run the contents of `supabase/seed.sql`.
4. Generate types from the real schema:

   ```powershell
   npm run db:types
   ```
   Then change `packages/types/src/index.ts` to export from `database.generated.ts` and fix any differences.

### Phone OTP (Auth → Sign In / Providers → Phone)

- Enable the **Phone** provider.
- Choose an SMS provider supported by Supabase (e.g. Twilio, MessageBird, Vonage, Textlocal). For India, sender ID and message template must be **DLT-registered** with the provider before production use (compliance-checklist §5.6).
- For development without SMS cost, add test numbers under **Phone → Test phone numbers and OTPs**: for example `919000000001 = 123456`. The same mapping is in `supabase/config.toml` for the local stack.
- Auth → Rate limits: keep SMS low (config uses 10/hour per project for local). Turn on CAPTCHA (Turnstile) before public launch.
- Disable email sign-up (phone only).

## 4. Configure the apps

Copy each example file and fill in the **public** values from Supabase → Project Settings → API (Project URL and the **publishable** key).

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```
```powershell
Copy-Item apps/admin/.env.example apps/admin/.env.local
```
```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
```

**Never** put the service-role / secret key in any app. The apps refuse to start with one (`assertPublicKey`) and CI fails if one is referenced.

## 5. Run locally

```powershell
npm run dev:web
```
Website at http://localhost:3000.

```powershell
npm run dev:admin
```
Admin portal at http://localhost:3001.

```powershell
npm run dev:mobile
```
Scan the QR code with **Expo Go** on an Android phone (same Wi-Fi). No Android SDK is needed for this.

## 6. Bootstrap the first platform admin

1. Sign in once on the admin portal with your mobile number. This creates your auth user and profile.
2. In the Supabase SQL editor, run (replace the number):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'platform_admin' from public.profiles where phone = '+919XXXXXXXXX';
   ```
3. Reload the admin portal. Further staff are granted from the database function `grant_staff_role` (admin UI in Prompt 11).

## 7. RLS tests against Supabase (before each release)

The PGlite suite proves the SQL logic. Before a release, repeat the key isolation scenarios against the hosted dev project with real Auth:
- customer A vs B;
- company A vs B;
- anon;
- suspended user;
- audit log append-only.

A scripted version arrives with Prompt 11 security testing.

## 8. Android builds (later phase)

```powershell
npx eas-cli@latest build --platform android --profile preview
```

The Android package name is a placeholder (`com.example.itm.marketplace` in `apps/mobile/app.json`). Change it to your registered domain before the first store build; it cannot be changed after publishing.
