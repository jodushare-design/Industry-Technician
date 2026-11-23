import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documentViewUrl, getProviderGaps } from "@itm/api";
import { DOCUMENT_TYPES, LANGUAGE_OPTIONS, SKILL_LEVEL_LABELS } from "@itm/core";
import { Alert, Card, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../../no-access";
import { recordCheckAction, reviewDocumentAction, revokeCheckAction, setStatusAction } from "../actions";
import { Flash, StatusBadge } from "../status";

export const metadata: Metadata = { title: "Provider review" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANG = new Map<string, string>(LANGUAGE_OPTIONS);
const input = "min-h-10 rounded-md border border-line bg-surface px-2 text-sm";
const btn = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm hover:bg-subtle";
const ist = (d: string) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

export default async function ProviderReviewPage({ params, searchParams }: PageProps<"/providers/[id]">) {
  const session = await requireStaff("/providers");
  if (!session) return <NoAccess />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const { client, isPlatformAdmin } = session;

  const { data: p } = await client.from("provider_profiles").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  const [{ data: skills }, { data: docs }, { data: checks }, { data: owner }, { data: org }, { data: members }, gaps] = await Promise.all([
    client.from("provider_skills").select("id, catalogue_entity_id, years_experience, level, copied_from_skill_id").eq("provider_profile_id", id),
    client.from("provider_documents").select("*").eq("provider_profile_id", id).order("created_at"),
    client.from("verification_checks").select("*").eq("provider_profile_id", id).order("reviewed_at", { ascending: false }),
    p.user_id ? client.from("profiles").select("full_name, phone, account_status").eq("id", p.user_id).maybeSingle() : Promise.resolve({ data: null }),
    p.organization_id ? client.from("organizations").select("id, name").eq("id", p.organization_id).maybeSingle() : Promise.resolve({ data: null }),
    p.kind === "company" && p.organization_id
      ? client.from("provider_profiles").select("id, display_name, status").eq("organization_id", p.organization_id).eq("kind", "company_member").is("archived_at", null)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; status: "draft" }[] }),
    getProviderGaps(client, id).catch(() => [] as string[]),
  ]);
  const { data: names } = skills?.length
    ? await client.from("catalogue_entities").select("id, name, kind").in("id", skills.map((s) => s.catalogue_entity_id))
    : { data: [] as { id: string; name: string; kind: string }[] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n]));
  const docLinks = await Promise.all((docs ?? []).map(async (d) => [d.id, await documentViewUrl(client, d.storage_path, 120)] as const));
  const linkOf = new Map(docLinks);
  const checkKinds = p.kind === "company" ? ["business", "certificate", "licence", "insurance"] : ["identity", "certificate", "licence", "insurance"];

  return (
    <div className="space-y-6">
      <Link href="/providers" className="text-sm underline">← Providers</Link>
      <PageHeader
        title={p.display_name ?? "(no name yet)"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {p.kind === "company" ? "Service company" : p.kind === "company_member" ? `Employee of ${org?.name ?? "?"}` : "Independent technician"}
            <StatusBadge status={p.status} />
            {p.archived_at && <span className="text-danger">left the company</span>}
          </span>
        }
      />
      <Flash notice={sp.notice} error={sp.error} />
      {p.status_reason && <Alert tone="info" title="Last status note">{p.status_reason}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Profile</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {owner && (<><dt className="text-muted">Account</dt><dd>{owner.full_name} · {owner.phone} · {owner.account_status}</dd></>)}
            <dt className="text-muted">Bio</dt><dd>{p.bio ?? "—"}</dd>
            <dt className="text-muted">Experience</dt><dd>{p.years_experience ?? "—"} yrs</dd>
            <dt className="text-muted">Languages</dt><dd>{p.languages.map((l) => LANG.get(l) ?? l).join(", ") || "—"}</dd>
            <dt className="text-muted">Base</dt><dd>{[p.base_locality, p.base_district].filter(Boolean).join(", ") || "—"}{p.base_latitude != null && " (location saved)"}</dd>
            <dt className="text-muted">Radius</dt><dd>{p.service_radius_km} km; districts: {p.service_districts.join(", ") || "—"}</dd>
            {p.kind === "company" && (
              <>
                <dt className="text-muted">Business phone</dt><dd>{p.business_phone ?? "—"}</dd>
                <dt className="text-muted">Email</dt><dd>{p.business_email ?? "—"}</dd>
                <dt className="text-muted">Address</dt><dd>{[p.business_address, p.business_pincode].filter(Boolean).join(" ") || "—"}</dd>
                <dt className="text-muted">GSTIN</dt><dd>{p.gstin ?? "—"}</dd>
                <dt className="text-muted">Registration</dt><dd>{p.registration_number ?? "—"}</dd>
              </>
            )}
            <dt className="text-muted">Submitted</dt><dd>{p.submitted_at ? ist(p.submitted_at) : "—"}</dd>
          </dl>
          {gaps.length > 0 && <p className="mt-3 text-sm text-warning">Still missing: {gaps.join("; ")}</p>}
          {members && members.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-medium">Employees</p>
              <ul>{members.map((m) => <li key={m.id}><Link className="underline" href={`/providers/${m.id}`}>{m.display_name ?? "(no name)"}</Link> · {m.status}</li>)}</ul>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Skills (stated by provider)</h2>
          <ul className="space-y-1 text-sm">
            {(skills ?? []).map((s) => (
              <li key={s.id}>
                {nameOf.get(s.catalogue_entity_id)?.name} · {s.years_experience} yrs · {SKILL_LEVEL_LABELS[s.level]}
                {s.copied_from_skill_id && <span className="text-muted"> (copied from company)</span>}
              </li>
            ))}
            {skills?.length === 0 && <li className="text-muted">None.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 font-semibold">Documents</h2>
        <p className="mb-3 text-sm text-muted">Links open for 2 minutes. Never download identity documents to personal devices.</p>
        <ul className="space-y-2 text-sm">
          {(docs ?? []).map((d) => (
            <li key={d.id} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{d.title}</span> · {DOCUMENT_TYPES[d.doc_type].label}
                  {d.issuer && ` · ${d.issuer}`}{d.valid_until && ` · valid until ${d.valid_until}`} · <span className="text-muted">{d.review_status}</span>
                </span>
                {linkOf.get(d.id) ? (
                  <a className="underline" href={linkOf.get(d.id)!} target="_blank" rel="noopener noreferrer">Open</a>
                ) : (
                  <span className="text-muted">file unavailable</span>
                )}
              </div>
              {isPlatformAdmin && d.doc_type === "work_photo" && d.review_status === "pending" && (
                <div className="mt-2 flex gap-2">
                  {[["true", "Accept photo"], ["false", "Reject photo"]].map(([v, l]) => (
                    <form key={v} action={reviewDocumentAction}>
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="documentId" value={d.id} />
                      <input type="hidden" name="accept" value={v} />
                      <button className={btn}>{l}</button>
                    </form>
                  ))}
                </div>
              )}
            </li>
          ))}
          {docs?.length === 0 && <li className="text-muted">No documents uploaded.</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Verification checks</h2>
        <ul className="mb-4 space-y-1 text-sm">
          {(checks ?? []).map((c) => (
            <li key={c.id} className={c.revoked_at ? "text-muted line-through" : ""}>
              {c.kind}{c.label ? `: ${c.label}` : ""} — <span className={c.passed ? "text-success" : "text-danger"}>{c.passed ? "passed" : "failed"}</span>
              {c.valid_until && `, valid until ${c.valid_until}`} · {ist(c.reviewed_at)}{c.note && ` · ${c.note}`}
              {c.revoked_at && ` · revoked: ${c.revoke_reason}`}
              {isPlatformAdmin && !c.revoked_at && (
                <form action={revokeCheckAction} className="ml-2 inline-flex gap-1 no-underline">
                  <input type="hidden" name="profileId" value={id} />
                  <input type="hidden" name="checkId" value={c.id} />
                  <input name="reason" required placeholder="Reason" aria-label="Reason for revoking" className={input} />
                  <button className="underline">Revoke</button>
                </form>
              )}
            </li>
          ))}
          {checks?.length === 0 && <li className="text-muted">No checks yet.</li>}
        </ul>
        {isPlatformAdmin && (
          <form action={recordCheckAction} className="grid gap-2 rounded-md border border-line p-3 text-sm sm:grid-cols-3">
            <input type="hidden" name="profileId" value={id} />
            <label className="flex flex-col">What was checked
              <select name="kind" className={input}>{checkKinds.map((k) => <option key={k} value={k}>{k}</option>)}</select>
            </label>
            <label className="flex flex-col">Result
              <select name="result" className={input}><option value="passed">Passed</option><option value="failed">Failed</option></select>
            </label>
            <label className="flex flex-col">Document reviewed
              <select name="documentId" className={input} defaultValue="">
                <option value="">— none —</option>
                {(docs ?? []).filter((d) => d.doc_type !== "work_photo").map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            <label className="flex flex-col">Label (certificate / licence / policy name)
              <input name="label" className={input} />
            </label>
            <label className="flex flex-col">Valid until
              <input name="validUntil" type="date" className={input} />
            </label>
            <label className="flex flex-col">Note
              <input name="note" className={input} placeholder="How it was checked" />
            </label>
            <div className="sm:col-span-3">
              <button className={btn}>Record check</button>
              <span className="ml-2 text-muted">A passed check shows customers a dated badge that states only what was reviewed and when.</span>
            </div>
          </form>
        )}
      </Card>

      {isPlatformAdmin && (
        <Card>
          <h2 className="mb-3 font-semibold">Decision</h2>
          <form action={setStatusAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="profileId" value={id} />
            <label className="flex flex-col">Set status
              <select name="status" className={input} defaultValue={p.status === "approved" ? "suspended" : "approved"}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
                <option value="suspended">Suspend</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col">Reason (required to reject or suspend; shown to the provider)
              <input name="reason" className={input} />
            </label>
            <button className="min-h-10 rounded-md bg-accent px-4 font-semibold text-on-accent">Save decision</button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Approval needs: individuals — a passed identity check; companies — a passed business check; employees — an approved company.
          </p>
        </Card>
      )}
    </div>
  );
}
