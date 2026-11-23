# Deployment

Covers the database, the website, the admin portal and the Android build. Use a **separate Supabase project for production**: never the dev project, and never the local demo.

## 1. Supabase project and database migrations

1. Create the project at supabase.com. The region is **Mumbai (ap-south-1)**; confirm it with counsel under DPDP ([compliance-checklist §3.7](../compliance-checklist.md)). Use a strong database password and keep it in a password manager.
2. Link the repository and push the migrations from the repository root:

   ```powershell
   npx supabase@latest login
   ```

   ```powershell
   npx supabase@latest link --project-ref YOUR_PROJECT_REF
   ```

   ```powershell
   npx supabase@latest db push
   ```

   Migrations are applied in order. The production database must end up with all nine:

   | File | Adds |
   |---|---|
   | `20261122000100_foundation` | Profiles, organisations, roles, legal documents, audit log |
   | `000200_catalogue` | Machine catalogue, search, suggestions, imports |
   | `000300_onboarding` | Factories, machines, provider profiles, skills, documents, verification |
   | `000400_requests` | Service requests, matching, invitations, request media |
   | `000500_chat` | Conversations, messages, notifications, contact sharing |
   | `000600_estimates` | Estimates and revisions, customer approval |
   | `000700_parts` | Spare-parts coordination |
   | `000800_completion_complaints` | Job progress, completion reports, complaints |
   | `000900_admin_security` | Platform settings, rate limits, staff reports |

   Later migrations, for example the request-flow changes in progress, are applied the same way. Check with `npx supabase@latest migration list` that local and remote match.

3. Load the seed data **once**, in the SQL editor or with `psql`:
   - `supabase/seed.sql` registers the legal documents as drafts.
   - `supabase/seed/catalogue.sql` loads the starter catalogue as `pending_review`. A platform admin approves records in **Admin → Catalogue** after the technician review ([catalogue.md](../catalogue.md)).
4. **Auth (Dashboard → Authentication):**
   - Phone sign-in on, using the SMS provider with an approved DLT sender ID and template.
   - Email and anonymous sign-in off.
   - Code resend interval 60 s; SMS limit 10 per hour.
   - Match the table in [security.md → Authentication](../security.md#authentication).
   - **Never** configure fixed test codes in a hosted project.
5. **Storage:** the buckets are created by the migrations, all private, with size and type limits. Do not change them in the dashboard.
6. **Scheduled job:** schedule `select public.expire_estimates();` daily with pg_cron (Dashboard → Integrations → Cron), for example at 01:00 IST. Without it, expired estimates are still refused when someone tries to accept them, but their status is not updated.
7. **Realtime:** the chat migration adds `messages` and `notifications` to the `supabase_realtime` publication. Check that they appear under Database → Publications, so chat updates arrive instantly instead of by polling.

## 2. Environment configuration

Only **public** values go into the apps. The service-role / secret key is never used by the website, the admin portal or the Android app. The apps refuse to start with one (`assertPublicKey`), and `npm run guard` fails if one is referenced. Privileged work belongs in Supabase Edge Functions, which hold their own secrets in Supabase.

| Variable | Website | Admin | Android | Value |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | — | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✓ | ✓ | — | **Publishable** key (`sb_publishable_…`) |
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` | ✓ | — | — | Name of the appointed Grievance Officer |
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL` | ✓ | — | — | Their contact email |
| `EXPO_PUBLIC_SUPABASE_URL` | — | — | ✓ | Project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | — | — | ✓ | Publishable key |
| `NEXT_PUBLIC_DEMO_MODE` | **never** | **never** | — | Local demo only. Shows one-tap demo sign-in. |
| `NEXT_PUBLIC_AUTH_COOKIE` | — | set in code | — | The admin portal sets `sb-itm-admin-auth` in `apps/admin/next.config.ts`, so staff and website sessions never share a cookie. Do not override it. |

The templates are `apps/*/.env.example`. Never commit `.env.local` or `.env.production`; they are gitignored.

## 3. Website and admin portal

Both are Next.js 16 apps in an npm-workspaces monorepo. The steps below use Vercel; any Node 22 host that runs `next build` / `next start` works the same way. Create **two projects** from the same repository:

| Setting | Website | Admin portal |
|---|---|---|
| Root directory | `apps/web` | `apps/admin` |
| Framework | Next.js | Next.js |
| Install command | `npm ci` (run from the repository root; Vercel detects the workspaces) | same |
| Build command | `npm run build` | `npm run build` |
| Node version | 22 | 22 |
| Domain (example) | `www.<your-domain>` | `admin.<your-domain>` |
| Environment variables | §2, Website column | §2, Admin column |

Notes:
- The admin portal is marked `noindex`. Keep it on its own subdomain.
- The shared packages (`@itm/*`) are compiled by each app (`transpilePackages`), so no separate package build is needed.
- Both apps send `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a permissions policy. A Content-Security-Policy is still to be added ([security.md](../security.md#known-gaps-before-public-launch)).
- After the first deploy, sign in on both domains and run the pilot test plan's script A.
- Run CI (`.github/workflows/ci.yml`) on every push: guards, typecheck, tests, both builds and the Android bundle.

To check the builds locally:

```powershell
npm run build:web
```

```powershell
npm run build:admin
```

## 4. Admin access setup

1. Sign in once on the admin portal with the founder's mobile number. This creates the auth user and profile.
2. In the Supabase SQL editor, grant the first platform administrator, replacing the number:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'platform_admin' from public.profiles where phone = '+919XXXXXXXXX';
   ```

3. Reload the admin portal.
4. **Further staff.** There is no staff-role screen in the admin portal yet ([known-limitations.md](known-limitations.md)). The audited function `grant_staff_role` checks the caller's own role, and the SQL editor has no signed-in user, so it cannot be used from there. Until a screen exists, a platform administrator grants roles in the SQL editor in the same way as step 2:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'support_agent' from public.profiles where phone = '+919XXXXXXXXX';
   ```

   Revoke a role on the day someone leaves (the row is kept for the record):

   ```sql
   update public.user_roles set revoked_at = now()
   where role in ('support_agent', 'platform_admin') and revoked_at is null
     and user_id = (select id from public.profiles where phone = '+919XXXXXXXXX');
   ```

   Record each grant and revocation in the team's access log. Direct SQL changes are not written to the platform audit log.
5. Give support staff the **support agent** role, not platform admin. Support handles complaints and verification but cannot change settings or the catalogue.
6. Keep at least two platform administrators, so the platform is never locked out.

See also [setup.md §6](../setup.md).

## 5. Android build (not feature-complete)

The Android app (`apps/mobile`, Expo SDK 58) has **sign-in and account screens only**. Requests, chat, estimates, parts and completion are not built in the app yet. Pilot users use the website in their phone browser. Do not publish to the Play Store until the app reaches parity ([known-limitations.md](known-limitations.md)).

When a test build is needed:

1. Create an Expo account. Then, in `apps/mobile`, set the real Android package name in `app.json`, replacing the placeholder `com.example.itm.marketplace`. **It cannot be changed after publishing.**
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as EAS environment variables (public values only).
3. Build an internal test APK:

   ```powershell
   npx eas-cli@latest build --platform android --profile preview
   ```

   The first run creates `eas.json` and the signing keystore. Let EAS manage the keystore and back it up; losing it blocks updates.
4. Check package compatibility before each build:

   ```powershell
   npx expo-doctor
   ```

   Install Expo packages only with `npx expo install <package>`.
