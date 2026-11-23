/**
 * Catalogue services. Reads use RLS (approved records for users; everything
 * for staff). Admin writes go through SQL functions that re-check the role.
 */
import {
  AppError,
  normalizeCatalogueText,
  parseCatalogueFile,
  toAppError,
  type CatalogueImportRow,
  type CatalogueKind,
  type RowProblem,
} from '@itm/core';
import type { CatalogueStatus, ConfidenceLevel, Json, SourceType, VerificationStatus } from '@itm/types';
import type { ItmClient } from './client';

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

/** For RPCs that always return a value: a null means something unexpected happened. */
function unwrapValue<T>(res: { data: T | null; error: unknown }): T {
  const v = unwrap(res);
  if (v === null || v === undefined) throw new AppError('unknown', { message: 'RPC returned no value' });
  return v;
}

// ---------------------------------------------------------------- search (users)

export interface CatalogueSearchResult {
  id: string;
  key: string;
  kind: CatalogueKind;
  name: string;
  matched_alias: string | null;
  score: number;
  is_generic: boolean;
  regulated_work: string | null;
  description: string | null;
}

export async function searchCatalogue(
  client: ItmClient,
  query: string,
  opts: { kinds?: CatalogueKind[]; limit?: number; channel?: 'web' | 'android' | 'admin' } = {},
): Promise<{ eventId: number | null; results: CatalogueSearchResult[] }> {
  if (normalizeCatalogueText(query).length < 2) return { eventId: null, results: [] };
  const data = unwrap(
    await client.rpc('search_catalogue', {
      p_query: query.slice(0, 200),
      p_kinds: opts.kinds ?? null,
      p_limit: opts.limit ?? 20,
      p_channel: opts.channel ?? 'web',
    }),
  ) as unknown as { event_id: number | null; results: CatalogueSearchResult[] };
  return { eventId: data.event_id, results: data.results };
}

/** Record which result the user picked (improves search analytics). Never throws. */
export async function logCatalogueSelection(client: ItmClient, eventId: number | null, entityId: string): Promise<void> {
  if (!eventId) return;
  await client.rpc('log_catalogue_selection', { p_event_id: eventId, p_entity_id: entityId });
}

export async function suggestCatalogueEntry(
  client: ItmClient,
  input: { kind: CatalogueKind; name: string; details?: string; manufacturerName?: string; modelName?: string; sourceUrl?: string },
): Promise<string> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 200) {
    throw new AppError('validation', { fieldErrors: { name: ['Enter a name (2–200 characters)'] } });
  }
  if (input.sourceUrl && !/^https?:\/\/\S+$/.test(input.sourceUrl.trim())) {
    throw new AppError('validation', { fieldErrors: { sourceUrl: ['Enter a full web address starting with http:// or https://'] } });
  }
  return unwrapValue(
    await client.rpc('suggest_catalogue_entry', {
      p_kind: input.kind,
      p_name: name,
      p_details: input.details?.trim() || null,
      p_manufacturer_name: input.manufacturerName?.trim() || null,
      p_model_name: input.modelName?.trim() || null,
      p_source_url: input.sourceUrl?.trim() || null,
    }),
  );
}

// ---------------------------------------------------------------- admin

export interface ImportReportRow {
  row: number;
  key?: string;
  result: 'created' | 'exists' | 'duplicate' | 'error';
  duplicate_of?: string;
  message?: string;
  possible_duplicates?: { key: string; name: string; similarity: number }[];
}

export interface ImportResult {
  batch_id: string | null;
  dry_run: boolean;
  rows: number;
  created: number;
  existing: number;
  duplicates: number;
  errors: number;
  report: ImportReportRow[];
}

/** Parse + validate a CSV/JSON file locally; returns problems without contacting the database. */
export function prepareCatalogueImport(fileName: string, text: string): { format: 'csv' | 'json'; rows: CatalogueImportRow[]; problems: RowProblem[] } {
  if (text.length > 5_000_000) {
    return { format: 'csv', rows: [], problems: [{ row: 0, message: 'File is larger than 5 MB. Split it into smaller files.' }] };
  }
  return parseCatalogueFile(fileName, text);
}

export async function importCatalogueRows(
  client: ItmClient,
  rows: CatalogueImportRow[],
  fileName: string,
  format: 'csv' | 'json' | 'manual',
  dryRun: boolean,
): Promise<ImportResult> {
  return unwrap(
    await client.rpc('catalogue_import', { p_rows: rows as unknown as Json, p_file_name: fileName, p_format: format, p_dry_run: dryRun }),
  ) as unknown as ImportResult;
}

export async function setCatalogueStatus(client: ItmClient, ids: string[], status: CatalogueStatus, note?: string): Promise<number> {
  if (ids.length === 0) return 0;
  return unwrapValue(await client.rpc('catalogue_set_status', { p_ids: ids, p_status: status, p_note: note?.trim() || null }));
}

export async function setCatalogueVerification(client: ItmClient, id: string, status: VerificationStatus, confidence: ConfidenceLevel | null) {
  unwrap(await client.rpc('catalogue_set_verification', { p_id: id, p_status: status, p_confidence: confidence }));
}

export async function addCatalogueAlias(client: ItmClient, entityId: string, alias: string, language = 'en'): Promise<string> {
  if (alias.trim().length < 2) throw new AppError('validation', { fieldErrors: { alias: ['Enter at least 2 characters'] } });
  return unwrapValue(await client.rpc('catalogue_add_alias', { p_entity: entityId, p_alias: alias.trim(), p_language: language }));
}

export async function removeCatalogueAlias(client: ItmClient, aliasId: string): Promise<void> {
  unwrap(await client.rpc('catalogue_remove_alias', { p_alias_id: aliasId }));
}

export async function addCatalogueSource(
  client: ItmClient,
  entityId: string,
  s: {
    sourceType: SourceType;
    sourceUrl?: string;
    sourceOrg?: string;
    researchDate?: string;
    verificationDate?: string;
    confidence?: ConfidenceLevel;
    notes?: string;
  },
): Promise<string> {
  return unwrapValue(
    await client.rpc('catalogue_add_source', {
      p_entity: entityId,
      p_source_type: s.sourceType,
      p_source_url: s.sourceUrl?.trim() || null,
      p_source_org: s.sourceOrg?.trim() || null,
      p_research_date: s.researchDate || null,
      p_verification_date: s.verificationDate || null,
      p_confidence: s.confidence ?? null,
      p_notes: s.notes?.trim() || null,
    }),
  );
}

export async function findCatalogueDuplicates(client: ItmClient, entityId: string) {
  return unwrap(await client.rpc('catalogue_find_duplicates', { p_entity: entityId })) ?? [];
}

export async function mergeCatalogueEntities(client: ItmClient, fromId: string, intoId: string, note: string): Promise<void> {
  unwrap(await client.rpc('catalogue_merge', { p_from: fromId, p_into: intoId, p_note: note }));
}

export interface SearchReport {
  since: string;
  total_searches: number;
  with_selection: number;
  top_queries: { query: string; searches: number; avg_results: number; selections: number }[];
  zero_result_queries: { query: string; searches: number; last_seen: string }[];
  top_selected: { key: string; name: string; selections: number }[];
}

export async function getCatalogueSearchReport(client: ItmClient, days = 30): Promise<SearchReport> {
  return unwrap(await client.rpc('catalogue_search_report', { p_days: days })) as unknown as SearchReport;
}

export async function resolveCatalogueSuggestion(
  client: ItmClient,
  id: string,
  action: 'create' | 'link' | 'reject',
  entityId?: string,
  note?: string,
): Promise<string | null> {
  return unwrap(
    await client.rpc('catalogue_resolve_suggestion', { p_id: id, p_action: action, p_entity: entityId ?? null, p_note: note?.trim() || null }),
  );
}
