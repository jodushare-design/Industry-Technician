import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documentViewUrl, getProviderPublic } from "@itm/api";
import { AVAILABILITY_LABELS, LANGUAGE_OPTIONS, SKILL_LEVEL_LABELS, badgeText } from "@itm/core";
import { isSupabaseConfigured } from "@itm/next/env";
import { createServerSupabase } from "@itm/next/server";
import { Alert, Card, PageHeader } from "@itm/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Service provider" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANG = new Map<string, string>(LANGUAGE_OPTIONS);

/** What customers see. Built only from get_provider_public — no documents, phone numbers or exact location. */
export default async function ProviderPublicPage({ params }: PageProps<"/providers/[id]">) {
  const { id } = await params;
  if (!UUID.test(id) || !isSupabaseConfigured()) notFound();
  const client = await createServerSupabase();
  const p = await getProviderPublic(client, id).catch(() => null);
  if (!p) notFound();
  const photos = await Promise.all(p.work_photos.slice(0, 12).map(async (w) => ({ ...w, url: await documentViewUrl(client, w.path, 300) })));
  const kindLabel = p.kind === "company" ? "Service company" : "Independent service provider";

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.display_name ?? "Service provider"}
        description={`${kindLabel}${p.company_name ? ` · works for ${p.company_name}` : ""}${p.base_locality ? ` · based in ${p.base_locality}` : ""}`}
      />
      <Alert tone="info">
        {p.display_name} is an independent {p.kind === "company" ? "business" : "service provider"} and is responsible for the work they do.
        You agree the work, price, site safety arrangements and payment directly with them.
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          {p.bio && <p className="mb-3">{p.bio}</p>}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {p.years_experience != null && (<><dt className="text-muted">Experience</dt><dd>{p.years_experience} years (stated by provider)</dd></>)}
            <dt className="text-muted">Languages</dt>
            <dd>{p.languages.map((l) => LANG.get(l) ?? l).join(", ") || "—"}</dd>
            <dt className="text-muted">Availability</dt>
            <dd>{AVAILABILITY_LABELS[p.availability]}{p.availability_note ? ` — ${p.availability_note}` : ""}</dd>
            <dt className="text-muted">Travels</dt>
            <dd>up to {p.service_radius_km} km{p.service_districts.length ? `; also covers ${p.service_districts.join(", ")}` : ""}</dd>
            {p.team_size != null && (<><dt className="text-muted">Team</dt><dd>{p.team_size} approved technician{p.team_size === 1 ? "" : "s"}</dd></>)}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Checks by the platform</h2>
          <ul className="space-y-1 text-sm">
            {p.mobile_verified && <li>Mobile number verified</li>}
            {p.badges.map((b, i) => <li key={i}>{badgeText(b)}</li>)}
            {!p.mobile_verified && p.badges.length === 0 && <li className="text-muted">No checks recorded yet.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">A check means the platform reviewed that item on that date. It does not tell you how good the work will be.</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Machines and skills (stated by provider)</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {p.skills.map((s) => (
            <li key={s.key} className="rounded-md border border-line p-3 text-sm">
              <Link href={`/machines/${s.key}`} className="font-medium hover:underline">{s.name}</Link>
              <span className="text-muted"> · {s.years_experience} yrs · {SKILL_LEVEL_LABELS[s.level]}</span>
              {s.makes.length > 0 && (
                <p className="mt-1 text-muted">Makes/models: {s.makes.map((m) => [m.manufacturer, m.model].filter(Boolean).join(" ")).join("; ")}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {photos.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Work photos</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.filter((w) => w.url).map((w) => (
              <li key={w.path}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={w.url!} alt={w.title} className="aspect-square w-full rounded-md object-cover" loading="lazy" />
                <p className="mt-1 text-xs text-muted">{w.title}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
