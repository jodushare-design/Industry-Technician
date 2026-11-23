import "server-only";
import type { ItmClient } from "@itm/api";

export interface Option {
  id: string;
  key: string;
  name: string;
}

/**
 * Approved catalogue items for onboarding pickers. Machine types are grouped
 * by equipment category; the generic "I don't know" option comes first.
 */
export async function getCatalogueOptions(client: ItmClient) {
  const { data } = await client
    .from("catalogue_entities")
    .select("id, key, kind, name, scope_id, is_generic, sort_order")
    .in("kind", ["machine_type", "equipment_category", "service_skill", "manufacturer", "model"])
    .order("sort_order")
    .order("name");
  const rows = data ?? [];
  const categories = rows.filter((r) => r.kind === "equipment_category");
  const machines = rows.filter((r) => r.kind === "machine_type");
  const { data: links } = machines.length
    ? await client.from("catalogue_links").select("from_id, to_id").eq("relation", "in_category").in("from_id", machines.map((m) => m.id))
    : { data: [] as { from_id: string; to_id: string }[] };

  const firstCategory = new Map<string, string>();
  for (const l of links ?? []) if (!firstCategory.has(l.from_id)) firstCategory.set(l.from_id, l.to_id);
  const machineGroups = categories
    .map((c) => ({
      label: c.name,
      options: machines.filter((m) => firstCategory.get(m.id) === c.id).sort((a, b) => a.name.localeCompare(b.name)) as Option[],
    }))
    .filter((g) => g.options.length > 0);
  const ungrouped = machines.filter((m) => !firstCategory.has(m.id) && !m.is_generic) as Option[];
  if (ungrouped.length) machineGroups.push({ label: "Other", options: ungrouped });

  const manufacturers = rows.filter((r) => r.kind === "manufacturer") as Option[];
  const makerName = new Map(manufacturers.map((m) => [m.id, m.name]));
  return {
    unknownMachine: machines.find((m) => m.key === "machine.unknown") as Option | undefined,
    machineGroups,
    categories: categories as Option[],
    serviceSkills: rows.filter((r) => r.kind === "service_skill").sort((a, b) => a.name.localeCompare(b.name)) as Option[],
    manufacturers,
    models: rows
      .filter((r) => r.kind === "model")
      .map((r) => ({ ...(r as Option), name: `${makerName.get(r.scope_id ?? "") ?? "?"} — ${r.name}`, scopeId: r.scope_id })),
  };
}
export type CatalogueOptions = Awaited<ReturnType<typeof getCatalogueOptions>>;
