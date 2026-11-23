import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findCatalogueDuplicates } from "@itm/api";
import {
  CATALOGUE_KIND_LABELS,
  COMPATIBILITY_RELATIONS,
  CONFIDENCE_LEVELS,
  MAKER_SPECIFIC_KINDS,
  REGULATED_WORK_LABELS,
  RELATION_RULES,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
} from "@itm/core";
import { Alert, Card, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../../no-access";
import { addAliasAction, addSourceAction, bulkStatusAction, mergeAction, removeAliasAction, verificationAction } from "../actions";
import { CatalogueNav, Flash, StatusBadge, VerificationBadge, buttonClass, inputClass, secondaryButtonClass } from "../ui";

export const metadata: Metadata = { title: "Catalogue record" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CatalogueRecordPage({ params, searchParams }: PageProps<"/catalogue/[id]">) {
  const session = await requireStaff("/catalogue");
  if (!session) return <NoAccess />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const { client, isPlatformAdmin } = session;

  const { data: e } = await client.from("catalogue_entities").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();

  const [aliases, sources, outgoing, incoming, scope, mergedInto, duplicates] = await Promise.all([
    client.from("catalogue_aliases").select("id, alias, language").eq("entity_id", id).order("alias"),
    client.from("catalogue_sources").select("*").eq("entity_id", id).order("created_at"),
    client.from("catalogue_links").select("id, to_id, relation, verification_status").eq("from_id", id),
    client.from("catalogue_links").select("id, from_id, relation, verification_status").eq("to_id", id),
    e.scope_id ? client.from("catalogue_entities").select("id, name").eq("id", e.scope_id).maybeSingle() : Promise.resolve({ data: null }),
    e.merged_into_id ? client.from("catalogue_entities").select("id, name").eq("id", e.merged_into_id).maybeSingle() : Promise.resolve({ data: null }),
    e.status === "merged" ? Promise.resolve([]) : findCatalogueDuplicates(client, id).catch(() => []),
  ]);

  const otherIds = [...(outgoing.data ?? []).map((l) => l.to_id), ...(incoming.data ?? []).map((l) => l.from_id)];
  const { data: others } = otherIds.length
    ? await client.from("catalogue_entities").select("id, name, kind, status").in("id", otherIds)
    : { data: [] as { id: string; name: string; kind: keyof typeof CATALOGUE_KIND_LABELS; status: string }[] };
  const byId = new Map((others ?? []).map((o) => [o.id, o]));

  const back = `/catalogue/${id}`;
  const needsExternalSource =
    MAKER_SPECIFIC_KINDS.includes(e.kind) &&
    !(sources.data ?? []).some((s) => ["manufacturer", "government", "industry_body", "distributor"].includes(s.source_type) && s.source_url);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/catalogue" className="text-sm underline">← All records</Link>
      </div>
      <PageHeader
        title={e.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {CATALOGUE_KIND_LABELS[e.kind]} · <StatusBadge status={e.status} /> · <VerificationBadge status={e.verification_status} />
            {e.confidence && <span className="text-xs">confidence {e.confidence}</span>}
            <span className="font-mono text-xs">{e.key}</span>
          </span>
        }
      />
      <CatalogueNav current="" />
      <Flash notice={sp.notice} error={sp.error} />

      {e.status === "merged" && mergedInto.data && (
        <Alert tone="info">
          Merged into <Link className="underline" href={`/catalogue/${mergedInto.data.id}`}>{mergedInto.data.name}</Link>.
        </Alert>
      )}
      {needsExternalSource && (
        <Alert tone="warning" title="Needs a source before approval">
          {CATALOGUE_KIND_LABELS[e.kind]} records need a manufacturer, government, industry body or distributor source with a URL.
          Do not approve model numbers or makes that you cannot cite.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Details</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Description</dt>
            <dd>{e.description ?? "—"}</dd>
            {scope.data && (
              <>
                <dt className="text-muted">Manufacturer</dt>
                <dd><Link className="underline" href={`/catalogue/${scope.data.id}`}>{scope.data.name}</Link></dd>
              </>
            )}
            <dt className="text-muted">Generic option</dt>
            <dd>{e.is_generic ? "Yes" : "No"}</dd>
            <dt className="text-muted">Regulated work</dt>
            <dd>{e.regulated_work ? `${REGULATED_WORK_LABELS[e.regulated_work]}${e.regulated_note ? ` — ${e.regulated_note}` : ""}` : "—"}</dd>
            <dt className="text-muted">Attributes</dt>
            <dd className="font-mono text-xs break-all">{JSON.stringify(e.attributes)}</dd>
            <dt className="text-muted">Review note</dt>
            <dd>{e.review_note ?? "—"}</dd>
            <dt className="text-muted">Updated</dt>
            <dd>{new Date(e.updated_at).toLocaleString("en-IN")}</dd>
          </dl>
        </Card>

        {isPlatformAdmin && e.status !== "merged" && (
          <Card>
            <h2 className="mb-3 font-semibold">Review</h2>
            <form action={bulkStatusAction} className="mb-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="ids" value={e.id} />
              <select name="status" className={inputClass} aria-label="New status" defaultValue={e.status === "approved" ? "retired" : "approved"}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
                <option value="pending_review">Back to review</option>
                <option value="draft">Draft</option>
                <option value="retired">Retire</option>
              </select>
              <input name="note" placeholder="Reason" className={`${inputClass} flex-1`} aria-label="Reason" />
              <button className={buttonClass}>Save</button>
            </form>
            <form action={verificationAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={e.id} />
              <label className="flex flex-col text-sm">
                Verification
                <select name="verification_status" defaultValue={e.verification_status} className={inputClass}>
                  {VERIFICATION_STATUSES.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="flex flex-col text-sm">
                Confidence
                <select name="confidence" defaultValue={e.confidence ?? ""} className={inputClass}>
                  <option value="">—</option>
                  {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <button className={secondaryButtonClass}>Update</button>
            </form>
            <p className="mt-2 text-xs text-muted">&quot;Verified&quot; needs a source with a verification date.</p>
          </Card>
        )}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Sources</h2>
        <ul className="space-y-2 text-sm">
          {(sources.data ?? []).map((s) => (
            <li key={s.id} className="rounded border border-line p-2">
              <span className="font-medium">{s.source_type.replace("_", " ")}</span>
              {s.source_org && <> · {s.source_org}</>}
              {s.source_url && (
                <> · <a className="break-all underline" href={s.source_url} target="_blank" rel="noopener noreferrer nofollow">{s.source_url}</a></>
              )}
              <div className="text-xs text-muted">
                researched {s.research_date}
                {s.verification_date ? ` · verified ${s.verification_date}` : ""} · confidence {s.confidence}
                {s.notes ? ` · ${s.notes}` : ""}
              </div>
            </li>
          ))}
        </ul>
        {isPlatformAdmin && (
          <form action={addSourceAction} className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <input type="hidden" name="id" value={e.id} />
            <label className="flex flex-col">Type
              <select name="source_type" className={inputClass} defaultValue="manufacturer">
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </label>
            <label className="flex flex-col">Organisation<input name="source_org" className={inputClass} /></label>
            <label className="flex flex-col sm:col-span-2">URL<input name="source_url" type="url" placeholder="https://" className={inputClass} /></label>
            <label className="flex flex-col">Research date<input name="research_date" type="date" className={inputClass} /></label>
            <label className="flex flex-col">Verification date<input name="verification_date" type="date" className={inputClass} /></label>
            <label className="flex flex-col">Confidence
              <select name="confidence" className={inputClass} defaultValue="medium">
                {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col">Notes<input name="notes" className={inputClass} /></label>
            <div className="sm:col-span-2"><button className={secondaryButtonClass}>Add source</button></div>
          </form>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Aliases</h2>
          <ul className="mb-3 flex flex-wrap gap-2 text-sm">
            {(aliases.data ?? []).map((a) => (
              <li key={a.id} className="flex items-center gap-1 rounded border border-line px-2 py-1">
                {a.alias} <span className="text-xs text-muted">{a.language}</span>
                {isPlatformAdmin && (
                  <form action={removeAliasAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="aliasId" value={a.id} />
                    <button className="px-1 text-danger" aria-label={`Remove alias ${a.alias}`}>×</button>
                  </form>
                )}
              </li>
            ))}
            {aliases.data?.length === 0 && <li className="text-muted">No aliases.</li>}
          </ul>
          {isPlatformAdmin && (
            <form action={addAliasAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={e.id} />
              <input name="alias" placeholder="New alias" className={`${inputClass} flex-1`} aria-label="New alias" required minLength={2} />
              <select name="language" className={inputClass} aria-label="Language" defaultValue="en">
                <option value="en">English</option>
                <option value="te">Telugu</option>
                <option value="hi">Hindi</option>
                <option value="ur">Urdu</option>
              </select>
              <button className={secondaryButtonClass}>Add</button>
            </form>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Links</h2>
          <ul className="space-y-1 text-sm">
            {(outgoing.data ?? []).map((l) => {
              const o = byId.get(l.to_id);
              return (
                <li key={l.id}>
                  {RELATION_RULES[l.relation].label}{" "}
                  <Link className="underline" href={`/catalogue/${l.to_id}`}>{o?.name ?? l.to_id}</Link>
                  {COMPATIBILITY_RELATIONS.includes(l.relation) && <> · <VerificationBadge status={l.verification_status} /></>}
                </li>
              );
            })}
            {(incoming.data ?? []).map((l) => {
              const o = byId.get(l.from_id);
              return (
                <li key={l.id} className="text-muted">
                  <Link className="underline" href={`/catalogue/${l.from_id}`}>{o?.name ?? l.from_id}</Link> {RELATION_RULES[l.relation].label} this
                </li>
              );
            })}
            {!outgoing.data?.length && !incoming.data?.length && <li className="text-muted">No links.</li>}
          </ul>
        </Card>
      </div>

      {e.status !== "merged" && (
        <Card>
          <h2 className="mb-1 font-semibold">Possible duplicates</h2>
          <p className="mb-3 text-sm text-muted">Merging moves this record&apos;s aliases, links and sources to the record you choose. This record is kept as &quot;merged&quot; for history.</p>
          {duplicates.length === 0 ? (
            <p className="text-sm text-muted">None found.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {duplicates.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <Link className="underline" href={`/catalogue/${d.id}`}>{d.name}</Link>
                  <StatusBadge status={d.status} />
                  <span className="text-xs text-muted">{Math.round(d.similarity * 100)}% · {d.matched_on}</span>
                  {isPlatformAdmin && (
                    <form action={mergeAction} className="flex gap-2">
                      <input type="hidden" name="from" value={e.id} />
                      <input type="hidden" name="into" value={d.id} />
                      <input name="note" required placeholder="Reason" className={inputClass} aria-label={`Reason for merging into ${d.name}`} />
                      <button className={secondaryButtonClass}>Merge this into &quot;{d.name}&quot;</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
