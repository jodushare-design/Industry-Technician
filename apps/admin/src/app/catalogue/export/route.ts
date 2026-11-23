import { NextResponse, type NextRequest } from "next/server";
import { CSV_COLUMNS, CATALOGUE_STATUSES, toCsv, type CatalogueImportRow } from "@itm/core";
import { getSession } from "@itm/next/server";
import { isStaff } from "@itm/core";

export const dynamic = "force-dynamic";

/**
 * Export the catalogue in the same format the importer accepts, so an
 * export can be edited and re-imported. Staff only (RLS also applies).
 *   /catalogue/export?format=csv|json&status=approved|all
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isStaff(session.roles) || session.context.profile.account_status !== "active") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const status = request.nextUrl.searchParams.get("status") ?? "approved";
  const { client } = session;

  const pageSize = 1000;
  const entities: Array<{
    id: string; key: string; kind: CatalogueImportRow["kind"]; name: string; description: string | null; scope_id: string | null;
    attributes: unknown; regulated_work: CatalogueImportRow["regulated_work"] | null; regulated_note: string | null;
    is_generic: boolean; sort_order: number; verification_status: CatalogueImportRow["verification_status"];
    confidence: CatalogueImportRow["confidence"] | null; status: string;
  }> = [];
  for (let from = 0; ; from += pageSize) {
    let q = client
      .from("catalogue_entities")
      .select("id, key, kind, name, description, scope_id, attributes, regulated_work, regulated_note, is_generic, sort_order, verification_status, confidence, status")
      .neq("status", "merged")
      .order("kind")
      .order("sort_order")
      .order("key")
      .range(from, from + pageSize - 1);
    if (status !== "all" && (CATALOGUE_STATUSES as readonly string[]).includes(status)) q = q.eq("status", status as never);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: "export failed" }, { status: 500 });
    entities.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const ids = entities.map((e) => e.id);
  const keyById = new Map(entities.map((e) => [e.id, e.key]));
  const fetchAll = async <T,>(table: "catalogue_aliases" | "catalogue_links" | "catalogue_sources", cols: string, column: string) => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await client.from(table).select(cols).in(column, ids.slice(i, i + 200));
      out.push(...((data ?? []) as T[]));
    }
    return out;
  };
  const [aliases, links, sources] = await Promise.all([
    fetchAll<{ entity_id: string; alias: string; language: string }>("catalogue_aliases", "entity_id, alias, language", "entity_id"),
    fetchAll<{ from_id: string; to_id: string; relation: string; verification_status: string; confidence: string | null }>(
      "catalogue_links", "from_id, to_id, relation, verification_status, confidence", "from_id"),
    fetchAll<{ entity_id: string; source_type: string; source_url: string | null; source_org: string | null; research_date: string; verification_date: string | null; confidence: string; notes: string | null }>(
      "catalogue_sources", "entity_id, source_type, source_url, source_org, research_date, verification_date, confidence, notes", "entity_id"),
  ]);

  const rows = entities.map((e) => {
    const row: Record<string, unknown> = { key: e.key, kind: e.kind, name: e.name };
    if (e.description) row.description = e.description;
    if (e.scope_id && keyById.get(e.scope_id)) row.scope_key = keyById.get(e.scope_id);
    if (e.attributes && Object.keys(e.attributes as object).length) row.attributes = e.attributes;
    if (e.regulated_work) row.regulated_work = e.regulated_work;
    if (e.regulated_note) row.regulated_note = e.regulated_note;
    if (e.is_generic) row.is_generic = true;
    row.sort_order = e.sort_order;
    row.verification_status = e.verification_status;
    if (e.confidence) row.confidence = e.confidence;
    const a = aliases.filter((x) => x.entity_id === e.id).map((x) => (x.language === "en" ? x.alias : { alias: x.alias, language: x.language }));
    if (a.length) row.aliases = a;
    const l = links
      .filter((x) => x.from_id === e.id && keyById.has(x.to_id))
      .map((x) => ({ relation: x.relation, to: keyById.get(x.to_id), verification_status: x.verification_status, ...(x.confidence && { confidence: x.confidence }) }));
    if (l.length) row.links = l;
    const s = sources
      .filter((x) => x.entity_id === e.id)
      .map(({ entity_id: _e, ...rest }) => Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null)));
    if (s.length) row.sources = s;
    return row;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="catalogue-${status}-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csvRows = rows.map((r) => {
    const src = (r.sources as Record<string, string>[] | undefined)?.[0];
    const values: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      key: r.key, kind: r.kind, name: r.name, description: r.description, scope_key: r.scope_key,
      aliases: (r.aliases as (string | { alias: string; language: string })[] | undefined)
        ?.map((a) => (typeof a === "string" ? a : `${a.language}:${a.alias}`)).join("|"),
      links: (r.links as { relation: string; to: string }[] | undefined)?.map((l) => `${l.relation}:${l.to}`).join(";"),
      regulated_work: r.regulated_work, regulated_note: r.regulated_note, is_generic: r.is_generic ? "true" : "",
      sort_order: r.sort_order, source_type: src?.source_type, source_url: src?.source_url, source_org: src?.source_org,
      research_date: src?.research_date, verification_date: src?.verification_date, confidence: r.confidence,
      verification_status: r.verification_status, attributes_json: r.attributes ? JSON.stringify(r.attributes) : "",
    };
    return CSV_COLUMNS.map((c) => values[c] as string | number | undefined);
  });
  const body = "﻿" + toCsv([[...CSV_COLUMNS], ...csvRows]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="catalogue-${status}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
