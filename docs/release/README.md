# Release

Everything needed to put the marketplace in front of the first pilot users, and what still blocks that.

> **Verdict (2026-11-23): not production-ready, and not yet ready for the pilot.**
> - **Automated tests:** all critical tests pass ([test-results.md](test-results.md)). They show the database rules, access isolation and the full customer and provider journeys work.
> - **Website and admin portal:** close to pilot-ready, but the hosted Supabase project, SMS provider and DLT registration do not exist yet, the manual phone tests have not been run, and the legal drafts are unreviewed.
> - **Android app:** has sign-in and account screens only. Pilot users use the website on their phones.
> - See [known-limitations.md](known-limitations.md) for the full list and what must close before the pilot.

| Document | Covers |
|---|---|
| [deployment.md](deployment.md) | Website and admin deployment, environment configuration, database migrations, admin access setup, Android build |
| [backups.md](backups.md) | Database and file backups, restore drill |
| [test-results.md](test-results.md) | Latest automated run and the manual results table |
| [security-review.md](security-review.md) | Security review summary and open findings |
| [known-limitations.md](known-limitations.md) | What is not built or not decided, and what blocks the pilot |
| [pilot-onboarding.md](pilot-onboarding.md) | Onboarding the pilot rice mill and technicians |
| [../pilot-test-plan.md](../pilot-test-plan.md) | Test categories, coverage and manual test scripts |

## Release order

1. Close every "Before the pilot" item in [known-limitations.md](known-limitations.md) that the team owns.
2. Create the production Supabase project, apply the migrations and seeds, and set up the admin ([deployment.md](deployment.md)).
3. Deploy the website and admin portal. Set the environment variables per app.
4. Turn on backups and do one restore drill ([backups.md](backups.md)).
5. Run `npm run check` on the release commit. Run the manual scripts A–F against the hosted project. Record the results in [test-results.md](test-results.md).
6. Re-run the isolation scenarios against the hosted project ([../setup.md §7](../setup.md)).
7. Onboard the pilot customer and technicians ([pilot-onboarding.md](pilot-onboarding.md)).
