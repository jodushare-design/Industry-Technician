# Backups and Restore

The platform keeps records that must survive mistakes and incidents:
- approvals with content fingerprints, estimates and revisions;
- complaints;
- the audit log;
- provider documents.

These records are never deleted when an account is suspended or closed (CLAUDE.md), so backups must cover them too.

## What to back up

| Data | Where it lives | Backup method |
|---|---|---|
| Database: all tables, including audit log, approvals and complaints | Supabase Postgres | Supabase managed backups, plus our own logical dump |
| Files: identity documents, request media, chat media, part photos, job photos, complaint files | Supabase Storage (six private buckets) | Scheduled copy to separate, access-controlled storage |
| Schema and seeds | This repository (`supabase/migrations`, `supabase/seed*`) | Git (GitHub) |
| Configuration | Supabase dashboard (Auth, Cron), hosting env vars | Written record in the team's password manager / runbook |
| Android signing keystore | EAS | Download once from EAS and store it offline, encrypted |

## 1. Supabase managed backups

- **Daily backups** are included on paid Supabase plans. Check the retention period for the plan chosen. The free plan has no downloadable backups, so the pilot needs a paid plan.
- **Point-in-time recovery (PITR)** is a paid add-on. It restores to any second within the retention window. It is recommended from the pilot onward, because chats, approvals and complaints change all day.
- Check under Dashboard → Database → Backups that backups are listed and recent.

## 2. Our own logical dump (weekly, and before every migration)

Keep a copy outside Supabase, so a single account problem cannot lose everything. Run from a trusted machine. The connection string is the **direct** database URL from Dashboard → Connect; keep it in the password manager.

```powershell
npx supabase@latest db dump --linked -f backup-roles.sql --role-only
```

```powershell
npx supabase@latest db dump --linked -f backup-schema.sql
```

```powershell
npx supabase@latest db dump --linked -f backup-data.sql --use-copy --data-only
```

- Store the three files encrypted, for example in a 7-Zip archive with AES-256 and a strong password, on storage that only the founder and one deputy can open. Keep 8 weekly copies and 12 monthly copies.
- The dumps contain personal data (phone numbers, addresses, chat). Treat them like the production database: never in email or chat, never on personal laptops long-term.
- **Before every `db push`:** take a dump and note the migration list (`npx supabase@latest migration list`).

## 3. Storage files

Database backups do **not** include Storage file contents. Copy the six private buckets on a schedule, weekly for the pilot:
- use the Supabase Storage S3-compatible endpoint (Dashboard → Storage → S3 connection) with an S3 tool such as `rclone sync`;
- the destination is a separate private bucket in another account.

Use dedicated S3 access keys for this job only. They are server-side secrets: never put them in an app or in this repository.

## 4. Restore drill (before the pilot, then quarterly)

A backup that has never been restored is not a backup. At least once before the pilot:

1. Create a **new, empty** Supabase project, called e.g. `itm-restore-test`.
2. Restore the dumps in order: roles, then schema, then data. Use `psql` with the restore project's connection string. Or restore a managed backup into the new project from the dashboard.
3. Copy a sample of the Storage files back into the matching buckets.
4. Point a local website at the restore project (`apps/web/.env.local`) and check:
   - an old request opens with its chat, estimate revisions and approval fingerprint;
   - an identity document opens for staff only;
   - the audit log still refuses updates.
5. Record the date, the time taken and any problems in [test-results.md](test-results.md#manual-results). Then delete the restore project, because it holds personal data.

## 5. Who and when

| Task | Frequency | Owner |
|---|---|---|
| Check managed backups exist | Weekly | Founder or deputy |
| Logical dump | Weekly and before each migration | Engineering |
| Storage copy | Weekly | Engineering |
| Restore drill | Before the pilot, then quarterly | Engineering, witnessed by the founder |

Retention and deletion periods for backups must follow counsel's DPDP retention schedule ([compliance-checklist §3.5](../compliance-checklist.md)). Until that schedule exists, keep the periods above and do not keep backups longer.
