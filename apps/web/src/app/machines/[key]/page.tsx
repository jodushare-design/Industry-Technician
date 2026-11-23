import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { logCatalogueSelection } from "@itm/api";
import { CATALOGUE_KIND_LABELS, REGULATED_WORK_LABELS, type RegulatedWorkKind } from "@itm/core";
import { isSupabaseConfigured } from "@itm/next/env";
import { createServerSupabase } from "@itm/next/server";
import { Alert, Card, PageHeader } from "@itm/ui";
import { getRecord, type Node } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

const KEY = /^[a-z0-9][a-z0-9_.-]{2,120}$/;

export async function generateMetadata({ params }: PageProps<"/machines/[key]">): Promise<Metadata> {
  const { key } = await params;
  if (!isSupabaseConfigured() || !KEY.test(key)) return { title: "Machine" };
  const r = await getRecord(await createServerSupabase(), key);
  return { title: r?.node.name ?? "Machine" };
}

export default async function MachinePage({ params, searchParams }: PageProps<"/machines/[key]">) {
  const { key } = await params;
  if (!isSupabaseConfigured() || !KEY.test(key)) notFound();
  const client = await createServerSupabase();
  const record = await getRecord(client, key);
  if (!record) notFound();
  const { node, aliases, sources, pick } = record;

  const e = Number((await searchParams).e);
  if (Number.isInteger(e) && e > 0) await logCatalogueSelection(client, e, node.id).catch(() => undefined);

  const sections: Array<{ title: string; items: { node: Node; verification?: string }[] }> = [
    { title: "Used in", items: pick("out", "used_in") },
    { title: "Industry", items: pick("out", "stage_of") },
    { title: "Category", items: pick("out", "in_category") },
    { title: "Discipline", items: pick("out", "in_discipline") },
    { title: "Machines at this stage", items: pick("in", "used_in") },
    { title: "Stages", items: pick("in", "stage_of") },
    { title: "Machines in this category", items: pick("in", "in_category") },
    { title: "Common components", items: pick("out", "has_component") },
    { title: "Found in", items: pick("in", "has_component") },
    { title: "Problems customers report", items: pick("in", "fault_of") },
    { title: "Can affect", items: pick("out", "fault_of") },
    { title: "Related service skills", items: pick("in", "skill_for") },
    { title: "Applies to", items: pick("out", "skill_for") },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6">
      <Link href="/machines" className="text-sm underline">← Find your machine</Link>
      <PageHeader title={node.name} description={CATALOGUE_KIND_LABELS[node.kind]} />
      {node.description && <p className="max-w-2xl">{node.description}</p>}
      {aliases.length > 0 && (
        <p className="text-sm text-muted">Also called: {aliases.map((a) => a.alias).join(", ")}</p>
      )}

      {node.regulated_work && (
        <Alert tone="warning" title="Licensed or approved work may be required">
          {REGULATED_WORK_LABELS[node.regulated_work as RegulatedWorkKind]}. {node.regulated_note} Check that the provider you choose holds
          the licence or approval the law requires for this work.
        </Alert>
      )}

      {node.kind === "machine_type" && (
        <Card>
          <p className="text-sm">
            Need help with this machine? You will soon be able to describe the problem and contact independent service providers who
            list this machine among their skills.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title}>
            <h2 className="mb-2 font-semibold">{s.title}</h2>
            <ul className="space-y-1 text-sm">
              {s.items
                .sort((a, b) => a.node.sort_order - b.node.sort_order || a.node.name.localeCompare(b.node.name))
                .map(({ node: n }) => (
                  <li key={n.id}><Link className="hover:underline" href={`/machines/${n.key}`}>{n.name}</Link></li>
                ))}
            </ul>
          </Card>
        ))}
      </div>

      <section className="text-xs text-muted">
        <h2 className="font-semibold">About this information</h2>
        <p className="mt-1">
          Catalogue entries are reference information to help you describe your machine. They are not technical advice and do not
          confirm that any part is compatible with your machine — confirm that with your provider or the supplier.
        </p>
        <ul className="mt-1">
          {sources.map((s, i) => (
            <li key={i}>
              Source: {s.source_org ?? s.source_type.replace("_", " ")}
              {s.source_url && <> — <a className="underline" href={s.source_url} target="_blank" rel="noopener noreferrer nofollow">{s.source_url}</a></>}
              {` (researched ${s.research_date}${s.verification_date ? `, verified ${s.verification_date}` : ", not yet independently verified"})`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
