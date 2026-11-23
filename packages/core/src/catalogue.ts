/**
 * Catalogue model shared by the import tools, admin portal and apps.
 * Mirrors supabase/migrations/20261122000200_catalogue.sql — keep in sync
 * (supabase/tests/catalogue.test.ts checks the parity).
 */
import { z } from 'zod';

export const CATALOGUE_KINDS = [
  'industry',
  'process_stage',
  'discipline',
  'equipment_category',
  'machine_type',
  'manufacturer',
  'product_family',
  'model',
  'controller',
  'component',
  'spare_part',
  'fault',
  'service_skill',
] as const;
export type CatalogueKind = (typeof CATALOGUE_KINDS)[number];

export const CATALOGUE_KIND_LABELS: Record<CatalogueKind, string> = {
  industry: 'Industry',
  process_stage: 'Process stage',
  discipline: 'Discipline',
  equipment_category: 'Equipment category',
  machine_type: 'Machine type',
  manufacturer: 'Manufacturer',
  product_family: 'Product family',
  model: 'Model',
  controller: 'Controller',
  component: 'Component',
  spare_part: 'Spare part',
  fault: 'Problem type',
  service_skill: 'Service skill',
};

/** Records about a specific maker's products — need an external source before approval. */
export const MAKER_SPECIFIC_KINDS: readonly CatalogueKind[] = ['manufacturer', 'product_family', 'model', 'controller', 'spare_part'];

export const CATALOGUE_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'merged', 'retired'] as const;
export type CatalogueStatus = (typeof CATALOGUE_STATUSES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'source_recorded', 'verified', 'disputed'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const SOURCE_TYPES = ['platform_taxonomy', 'manufacturer', 'government', 'industry_body', 'distributor', 'user_suggestion', 'other'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const REGULATED_WORK_KINDS = ['electrical_installation', 'boiler', 'pressure_vessel', 'lifting_equipment'] as const;
export type RegulatedWorkKind = (typeof REGULATED_WORK_KINDS)[number];

export const REGULATED_WORK_LABELS: Record<RegulatedWorkKind, string> = {
  electrical_installation: 'Electrical installation work — may need a licensed electrical contractor or supervisor',
  boiler: 'Boiler work — may need an approved boiler repairer and statutory inspection',
  pressure_vessel: 'Pressure vessel — statutory testing and inspection may apply',
  lifting_equipment: 'Lifting equipment — statutory examination by a competent person may apply',
};

export const CATALOGUE_RELATIONS = [
  'stage_of',
  'used_in',
  'in_category',
  'in_discipline',
  'in_family',
  'is_type',
  'has_component',
  'controlled_by',
  'part_for',
  'fault_of',
  'skill_for',
] as const;
export type CatalogueRelation = (typeof CATALOGUE_RELATIONS)[number];

/** Allowed (from kind → to kinds) per relation. Same matrix as private.catalogue_relation_allowed. */
export const RELATION_RULES: Record<CatalogueRelation, { from: readonly CatalogueKind[]; to: readonly CatalogueKind[]; label: string }> = {
  stage_of: { from: ['process_stage'], to: ['industry'], label: 'is a stage of' },
  used_in: { from: ['machine_type'], to: ['industry', 'process_stage'], label: 'is used in' },
  in_category: { from: ['machine_type'], to: ['equipment_category'], label: 'is in category' },
  in_discipline: { from: ['equipment_category', 'service_skill'], to: ['discipline'], label: 'belongs to discipline' },
  in_family: { from: ['model'], to: ['product_family'], label: 'is in product family' },
  is_type: { from: ['model', 'product_family'], to: ['machine_type'], label: 'is a type of' },
  has_component: { from: ['machine_type', 'model'], to: ['component'], label: 'has component' },
  controlled_by: { from: ['machine_type', 'model'], to: ['controller'], label: 'is controlled by' },
  part_for: { from: ['spare_part'], to: ['component', 'model', 'machine_type'], label: 'is a part for' },
  fault_of: { from: ['fault'], to: ['machine_type', 'component', 'equipment_category'], label: 'can affect' },
  skill_for: { from: ['service_skill'], to: ['machine_type', 'equipment_category', 'component'], label: 'applies to' },
};

/** Relations that claim compatibility — always shown with their verification status. */
export const COMPATIBILITY_RELATIONS: readonly CatalogueRelation[] = ['part_for', 'controlled_by'];

export function relationAllowed(relation: CatalogueRelation, from: CatalogueKind, to: CatalogueKind): boolean {
  const rule = RELATION_RULES[relation];
  return rule.from.includes(from) && rule.to.includes(to);
}

/**
 * Same as private.normalize_catalogue_text: lower-case, ASCII punctuation and
 * ASCII whitespace collapsed to one space, trimmed. Non-ASCII letters kept.
 */
export function normalizeCatalogueText(text: string): string {
  return text
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[!-/:-@[-`{-~ \t\n\r\f\v]+/g, ' ')
    .trim();
}

/** Build a stable import key from parts, e.g. ("machine", "Rubber roll husker") → "machine.rubber_roll_husker". */
export function catalogueKey(...parts: string[]): string {
  return parts
    .map((p) => normalizeCatalogueText(p).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
    .filter(Boolean)
    .join('.');
}

// ---------------------------------------------------------------- import rows

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const importSourceSchema = z
  .object({
    source_type: z.enum(SOURCE_TYPES),
    source_url: z.url({ protocol: /^https?$/ }).optional(),
    source_org: z.string().trim().min(2).max(200).optional(),
    research_date: isoDate.optional(),
    verification_date: isoDate.optional(),
    confidence: z.enum(CONFIDENCE_LEVELS).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((s) => ['platform_taxonomy', 'user_suggestion'].includes(s.source_type) || (s.source_url && s.source_org), {
    message: 'External sources need source_url and source_org',
  });

export const importRowSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,120}$/, 'key: lower-case letters, digits, . _ - (3–121 chars)'),
  kind: z.enum(CATALOGUE_KINDS),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional(),
  scope_key: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  regulated_work: z.enum(REGULATED_WORK_KINDS).optional(),
  regulated_note: z.string().max(500).optional(),
  is_generic: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  verification_status: z.enum(VERIFICATION_STATUSES).optional(),
  confidence: z.enum(CONFIDENCE_LEVELS).optional(),
  aliases: z
    .array(z.union([z.string().trim().min(2).max(200), z.object({ alias: z.string().trim().min(2).max(200), language: z.enum(['en', 'te', 'hi', 'ur']) })]))
    .optional(),
  links: z
    .array(
      z.object({
        relation: z.enum(CATALOGUE_RELATIONS),
        to: z.string().min(3),
        verification_status: z.enum(VERIFICATION_STATUSES).optional(),
        confidence: z.enum(CONFIDENCE_LEVELS).optional(),
      }),
    )
    .optional(),
  sources: z.array(importSourceSchema).optional(),
});
export type CatalogueImportRow = z.infer<typeof importRowSchema>;

export interface RowProblem {
  row: number; // 1-based
  key?: string;
  message: string;
}

/** Validate rows locally (shape, kinds, link rules for keys in the same file). The database re-checks everything. */
export function validateImportRows(input: unknown[]): { rows: CatalogueImportRow[]; problems: RowProblem[] } {
  const rows: CatalogueImportRow[] = [];
  const problems: RowProblem[] = [];
  const kindByKey = new Map<string, CatalogueKind>();
  const seen = new Set<string>();

  input.forEach((raw, i) => {
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      const key = typeof raw === 'object' && raw && 'key' in raw ? String((raw as { key: unknown }).key) : undefined;
      for (const issue of parsed.error.issues) {
        problems.push({ row: i + 1, key, message: `${issue.path.join('.') || 'row'}: ${issue.message}` });
      }
      return;
    }
    if (seen.has(parsed.data.key)) {
      problems.push({ row: i + 1, key: parsed.data.key, message: 'key appears more than once in this file' });
      return;
    }
    seen.add(parsed.data.key);
    kindByKey.set(parsed.data.key, parsed.data.kind);
    rows.push(parsed.data);
  });

  rows.forEach((r) => {
    const rowNo = input.findIndex((x) => (x as { key?: string })?.key === r.key) + 1;
    for (const l of r.links ?? []) {
      const toKind = kindByKey.get(l.to);
      if (toKind && !relationAllowed(l.relation, r.kind, toKind)) {
        problems.push({ row: rowNo, key: r.key, message: `a ${r.kind} cannot be linked to a ${toKind} with "${l.relation}"` });
      }
    }
    if ((r.kind === 'model' || r.kind === 'product_family') && !r.scope_key) {
      problems.push({ row: rowNo, key: r.key, message: `${r.kind} needs scope_key (its manufacturer)` });
    }
  });

  return { rows, problems };
}

// ---------------------------------------------------------------- CSV

/** RFC 4180 CSV parser: quoted fields, escaped quotes, commas/newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (inQuotes) throw new Error('CSV has an unclosed quote');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function toCsv(rows: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? '' : String(v);
    // Prevent spreadsheet formula injection on export.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Columns of the CSV import template (docs/catalogue-import-template.csv). */
export const CSV_COLUMNS = [
  'key',
  'kind',
  'name',
  'description',
  'scope_key',
  'aliases',
  'links',
  'regulated_work',
  'regulated_note',
  'is_generic',
  'sort_order',
  'source_type',
  'source_url',
  'source_org',
  'research_date',
  'verification_date',
  'confidence',
  'verification_status',
  'attributes_json',
] as const;

/**
 * Convert CSV text to raw import rows.
 *   aliases: "sheller|dehusker|te:<telugu name>"   (optional language prefix)
 *   links:   "used_in:industry.rice_mill;in_category:category.food_processing"
 *   one source per row (source_* columns); use JSON for several.
 */
export function csvToImportRows(text: string): { rows: unknown[]; problems: RowProblem[] } {
  const table = parseCsv(text);
  const problems: RowProblem[] = [];
  if (table.length === 0) return { rows: [], problems: [{ row: 0, message: 'The file is empty' }] };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  for (const required of ['key', 'kind', 'name']) {
    if (!header.includes(required)) problems.push({ row: 0, message: `Missing column "${required}"` });
  }
  const unknown = header.filter((h) => h && !(CSV_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) problems.push({ row: 0, message: `Unknown column(s): ${unknown.join(', ')}` });
  if (problems.length) return { rows: [], problems };

  const rows: unknown[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (col: string) => {
      const idx = header.indexOf(col);
      const v = idx >= 0 ? (cells[idx] ?? '').trim() : '';
      return v === '' ? undefined : v;
    };
    const rowNo = i + 1;
    const out: Record<string, unknown> = { key: get('key'), kind: get('kind'), name: get('name') };
    for (const col of ['description', 'scope_key', 'regulated_work', 'regulated_note', 'verification_status', 'confidence'] as const) {
      const v = get(col);
      if (v !== undefined) out[col] = v;
    }
    const generic = get('is_generic');
    if (generic !== undefined) out.is_generic = /^(true|yes|1)$/i.test(generic);
    const sort = get('sort_order');
    if (sort !== undefined) out.sort_order = Number(sort);

    const aliases = get('aliases');
    if (aliases) {
      out.aliases = aliases
        .split('|')
        .map((a) => a.trim())
        .filter(Boolean)
        .map((a) => {
          const m = /^(en|te|hi|ur):(.+)$/.exec(a);
          return m ? { alias: m[2]!.trim(), language: m[1] } : a;
        });
    }
    const links = get('links');
    if (links) {
      out.links = links
        .split(';')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const idx = l.indexOf(':');
          return { relation: l.slice(0, idx).trim(), to: l.slice(idx + 1).trim() };
        });
    }
    const sourceType = get('source_type');
    if (sourceType) {
      const s: Record<string, string> = { source_type: sourceType };
      for (const col of ['source_url', 'source_org', 'research_date', 'verification_date'] as const) {
        const v = get(col);
        if (v) s[col] = v;
      }
      const conf = get('confidence');
      if (conf) s.confidence = conf;
      out.sources = [s];
    }
    const attrs = get('attributes_json');
    if (attrs) {
      try {
        out.attributes = JSON.parse(attrs);
      } catch {
        problems.push({ row: rowNo, key: get('key'), message: 'attributes_json is not valid JSON' });
      }
    }
    rows.push(out);
  });
  return { rows, problems };
}

/** Parse an uploaded file (by extension) into validated import rows. */
export function parseCatalogueFile(fileName: string, text: string): { format: 'csv' | 'json'; rows: CatalogueImportRow[]; problems: RowProblem[] } {
  if (/\.json$/i.test(fileName)) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { format: 'json', rows: [], problems: [{ row: 0, message: 'The file is not valid JSON' }] };
    }
    const list = Array.isArray(data) ? data : (data as { rows?: unknown })?.rows;
    if (!Array.isArray(list)) return { format: 'json', rows: [], problems: [{ row: 0, message: 'JSON must be a list of rows or { "rows": [...] }' }] };
    return { format: 'json', ...validateImportRows(list) };
  }
  if (/\.csv$/i.test(fileName)) {
    let converted: { rows: unknown[]; problems: RowProblem[] };
    try {
      converted = csvToImportRows(text);
    } catch (e) {
      return { format: 'csv', rows: [], problems: [{ row: 0, message: (e as Error).message }] };
    }
    const validated = validateImportRows(converted.rows);
    return { format: 'csv', rows: validated.rows, problems: [...converted.problems, ...validated.problems] };
  }
  return { format: 'csv', rows: [], problems: [{ row: 0, message: 'Upload a .csv or .json file' }] };
}
