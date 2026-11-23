import "server-only";
import type { ItmClient } from "@itm/api";
import type { CatalogueKind, CatalogueRelation } from "@itm/types";

export interface Node {
  id: string;
  key: string;
  kind: CatalogueKind;
  name: string;
  description: string | null;
  is_generic: boolean;
  regulated_work: string | null;
  regulated_note: string | null;
  sort_order: number;
}

const NODE_COLUMNS = "id, key, kind, name, description, is_generic, regulated_work, regulated_note, sort_order";

/** Rice-mill line: stages in order, each with the approved machine types used in it. */
export async function getRiceMillLine(client: ItmClient) {
  const { data: industry } = await client.from("catalogue_entities").select("id").eq("key", "industry.rice_mill").maybeSingle();
  if (!industry) return [];
  const { data: stageLinks } = await client.from("catalogue_links").select("from_id").eq("to_id", industry.id).eq("relation", "stage_of");
  const stageIds = (stageLinks ?? []).map((l) => l.from_id);
  if (!stageIds.length) return [];
  const [{ data: stages }, { data: used }] = await Promise.all([
    client.from("catalogue_entities").select(NODE_COLUMNS).in("id", stageIds).order("sort_order"),
    client.from("catalogue_links").select("from_id, to_id").in("to_id", stageIds).eq("relation", "used_in"),
  ]);
  const machineIds = [...new Set((used ?? []).map((u) => u.from_id))];
  const { data: machines } = machineIds.length
    ? await client.from("catalogue_entities").select(NODE_COLUMNS).in("id", machineIds).order("sort_order")
    : { data: [] as Node[] };
  const byId = new Map((machines ?? []).map((m) => [m.id, m as Node]));
  return (stages ?? []).map((s) => ({
    stage: s as Node,
    machines: (used ?? [])
      .filter((u) => u.to_id === s.id)
      .map((u) => byId.get(u.from_id))
      .filter((m): m is Node => Boolean(m))
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/** Equipment categories with their approved machine types (excluding the rice-mill-only category). */
export async function getCategories(client: ItmClient) {
  const { data: cats } = await client.from("catalogue_entities").select(NODE_COLUMNS).eq("kind", "equipment_category").order("sort_order");
  const ids = (cats ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const { data: inCat } = await client.from("catalogue_links").select("from_id, to_id").in("to_id", ids).eq("relation", "in_category");
  const machineIds = [...new Set((inCat ?? []).map((l) => l.from_id))];
  const { data: machines } = machineIds.length
    ? await client.from("catalogue_entities").select(NODE_COLUMNS).in("id", machineIds)
    : { data: [] as Node[] };
  const byId = new Map((machines ?? []).map((m) => [m.id, m as Node]));
  return (cats ?? []).map((c) => ({
    category: c as Node,
    machines: (inCat ?? []).filter((l) => l.to_id === c.id).map((l) => byId.get(l.from_id)).filter((m): m is Node => Boolean(m))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** One approved record with its aliases, sources and links in both directions. */
export async function getRecord(client: ItmClient, key: string) {
  const { data: node } = await client.from("catalogue_entities").select(NODE_COLUMNS).eq("key", key).maybeSingle();
  if (!node) return null;
  const [{ data: aliases }, { data: sources }, { data: out }, { data: inc }] = await Promise.all([
    client.from("catalogue_aliases").select("alias, language").eq("entity_id", node.id).order("alias"),
    client.from("catalogue_sources").select("source_type, source_org, source_url, research_date, verification_date").eq("entity_id", node.id),
    client.from("catalogue_links").select("to_id, relation, verification_status").eq("from_id", node.id),
    client.from("catalogue_links").select("from_id, relation, verification_status").eq("to_id", node.id),
  ]);
  const ids = [...(out ?? []).map((l) => l.to_id), ...(inc ?? []).map((l) => l.from_id)];
  const { data: others } = ids.length ? await client.from("catalogue_entities").select(NODE_COLUMNS).in("id", ids) : { data: [] as Node[] };
  const byId = new Map((others ?? []).map((o) => [o.id, o as Node]));
  const pick = (dir: "out" | "in", relation: CatalogueRelation) =>
    (dir === "out"
      ? (out ?? []).filter((l) => l.relation === relation).map((l) => ({ node: byId.get(l.to_id), verification: l.verification_status }))
      : (inc ?? []).filter((l) => l.relation === relation).map((l) => ({ node: byId.get(l.from_id), verification: l.verification_status }))
    ).filter((x): x is { node: Node; verification: typeof x.verification } => Boolean(x.node));
  return { node: node as Node, aliases: aliases ?? [], sources: sources ?? [], pick };
}
