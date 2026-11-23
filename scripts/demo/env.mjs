/**
 * Points the web and admin apps at the LOCAL demo backend by writing their
 * .env.local files. Refuses to overwrite a .env.local that is not a demo one
 * (so a real Supabase configuration is never replaced by accident).
 *
 *   npm run demo:env           write demo settings
 *   npm run demo:env -- --off  remove the demo settings again
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANON_KEY, DEMO_PORT } from './jwt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKER = '# ITM LOCAL DEMO — written by npm run demo:env';
const off = process.argv.includes('--off');

for (const app of ['web', 'admin']) {
  const file = join(ROOT, 'apps', app, '.env.local');
  const isDemo = existsSync(file) && readFileSync(file, 'utf8').startsWith(MARKER);
  if (existsSync(file) && !isDemo) {
    console.log(`Skipped apps/${app}/.env.local: it has real settings. Move it aside to use the demo.`);
    continue;
  }
  if (off) {
    if (isDemo) unlinkSync(file);
    console.log(`Removed demo settings from apps/${app}`);
    continue;
  }
  writeFileSync(
    file,
    [
      MARKER,
      `NEXT_PUBLIC_SUPABASE_URL=http://localhost:${DEMO_PORT}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}`,
      'NEXT_PUBLIC_DEMO_MODE=1',
      'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME=Demo Grievance Officer',
      'NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL=grievance@example.com',
      '',
    ].join('\n'),
  );
  console.log(`Wrote demo settings to apps/${app}/.env.local`);
}
if (!off) console.log('Restart the web and admin dev servers so they pick up the new settings.');
