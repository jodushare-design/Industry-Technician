import type { Metadata } from "next";
import Link from "next/link";
import { CATALOGUE_KIND_LABELS } from "@itm/core";
import { Alert, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../../no-access";
import { resolveSuggestionAction } from "../actions";
import { CatalogueNav, Flash, inputClass, secondaryButtonClass } from "../ui";

export const metadata: Metadata = { title: "Catalogue suggestions" };
export const dynamic = "force-dynamic";

export default async function SuggestionsPage({ searchParams }: PageProps<"/catalogue/suggestions">) {
  const session = await requireStaff("/catalogue/suggestions");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const showAll = sp.show === "all";

  let q = session.client
    .from("catalogue_suggestions")
    .select("id, kind, name, details, manufacturer_name, model_name, source_url, status, review_note, resolved_entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!showAll) q = q.eq("status", "pending");
  const { data, error } = await q;

  return (
    <div>
      <PageHeader title="Suggestions from users" description="Customers and providers can suggest machines, makes, models, parts, problems and skills that are missing." />
      <CatalogueNav current="/catalogue/suggestions" />
      <Flash notice={sp.notice} error={sp.error} />
      <p className="mb-3 text-sm">
        {showAll ? <Link className="underline" href="/catalogue/suggestions">Show pending only</Link> : <Link className="underline" href="/catalogue/suggestions?show=all">Show all</Link>}
      </p>
      {error && <Alert tone="error">Could not load suggestions.</Alert>}
      {data?.length === 0 && <p className="text-muted">No suggestions to review.</p>}
      <ul className="space-y-3">
        {(data ?? []).map((s) => (
          <li key={s.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <span className="font-semibold">{s.name}</span> <span className="text-muted">· {CATALOGUE_KIND_LABELS[s.kind]}</span>
              </p>
              <span className="text-xs text-muted">{new Date(s.created_at).toLocaleString("en-IN")} · {s.status}</span>
            </div>
            {s.details && <p className="mt-1">{s.details}</p>}
            <p className="mt-1 text-muted">
              {s.manufacturer_name && <>Make (as typed by the user): {s.manufacturer_name} · </>}
              {s.model_name && <>Model (as typed by the user): {s.model_name} · </>}
              {s.source_url && <a className="underline" href={s.source_url} target="_blank" rel="noopener noreferrer nofollow">user link</a>}
            </p>
            {s.review_note && <p className="mt-1 text-muted">Note: {s.review_note}</p>}
            {s.resolved_entity_id && <p className="mt-1"><Link className="underline" href={`/catalogue/${s.resolved_entity_id}`}>Open record</Link></p>}
            {s.status === "pending" && session.isPlatformAdmin && (
              <div className="mt-3 flex flex-wrap gap-3">
                <form action={resolveSuggestionAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="action" value="create" />
                  <button className={secondaryButtonClass}>Create record for review</button>
                </form>
                <form action={resolveSuggestionAction} className="flex gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="action" value="link" />
                  <input name="entity" placeholder="Existing record ID" className={inputClass} aria-label="Existing record ID" required />
                  <button className={secondaryButtonClass}>Already exists</button>
                </form>
                <form action={resolveSuggestionAction} className="flex gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="action" value="reject" />
                  <input name="note" placeholder="Reason" className={inputClass} aria-label="Reason for rejecting" required />
                  <button className={secondaryButtonClass}>Reject</button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted">
        A make or model typed by a user is not a source. Before approving a record created from a suggestion, add a manufacturer or
        other external source.
      </p>
    </div>
  );
}
