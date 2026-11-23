# Industrial Machine Catalogue

**Status:** Prompt 4 — 2026-11-22
**Code:**
- `supabase/migrations/20261122000200_catalogue.sql`
- `packages/core/src/catalogue.ts`
- `packages/api/src/catalogue.ts`
- admin: `apps/admin/src/app/catalogue/`
- web: `apps/web/src/app/machines/`

One database-driven catalogue is shared by the website, the Android app, matching (Prompt 6) and provider skills (Prompt 5). No screen hard-codes a machine list.

## 1. Model

Every catalogue item is a row in `catalogue_entities` with a `kind`. Items are joined by typed `catalogue_links`.

| Kind | Example | Notes |
|---|---|---|
| `industry` | Rice milling | |
| `process_stage` | Husking and dehusking | `stage_of` → industry; ordered by `sort_order` |
| `discipline` | Electrical | |
| `equipment_category` | Motors and drives | `in_discipline` → discipline |
| `machine_type` | Rubber roll husker | Generic. Customers and providers pick these. |
| `manufacturer` | (none seeded) | needs an external source to approve |
| `product_family` | (none seeded) | belongs to a manufacturer (`scope`) |
| `model` | (none seeded) | belongs to a manufacturer; `is_type` → machine type |
| `controller` | (none seeded) | a specific controller product |
| `component` | Rubber roll, Bearing | generic parts of a machine |
| `spare_part` | (none seeded) | a specific part (number); compatibility via `part_for` |
| `fault` | High broken rice percentage | **a problem the customer reports — not a diagnosis** |
| `service_skill` | PLC programming and troubleshooting | `skill_for` → machine type / category / component |
| alias | sheller → Rubber roll husker | `catalogue_aliases`, with language (en / te / hi / ur) |

Allowed links:

| Relation | From | To |
|---|---|---|
| `stage_of` | process_stage | industry |
| `used_in` | machine_type | industry, process_stage |
| `in_category` | machine_type | equipment_category |
| `in_discipline` | equipment_category, service_skill | discipline |
| `in_family` | model | product_family |
| `is_type` | model, product_family | machine_type |
| `has_component` | machine_type, model | component |
| `controlled_by` ⚠ | machine_type, model | controller |
| `part_for` ⚠ | spare_part | component, model, machine_type |
| `fault_of` | fault | machine_type, component, equipment_category |
| `skill_for` | service_skill | machine_type, equipment_category, component |

⚠ = a compatibility claim. These links carry their own `verification_status` and are always shown with it.

The same rules exist in SQL (`private.catalogue_relation_allowed`, enforced by trigger) and TypeScript (`RELATION_RULES`). A test checks they match.

**Generic choice.** `machine.unknown` ("I don't know the machine name") is a generic machine type. Every customer and provider form must offer it, along with "make/model unknown".

**Regulated work.** `regulated_work` (electrical_installation, boiler, pressure_vessel, lifting_equipment) drives the warnings in [risk-control-design.md §7](risk-control-design.md). It is not legal advice; the wording is pending legal review.

## 2. Data-quality rules (enforced in the database)

1. **Nothing is public until approved.** Users and anonymous visitors can read only `approved` records, and links between approved records. Staff see everything.
2. **Imports never approve.** Every imported or suggested record starts as `pending_review`.
3. **No invented makes or model numbers.** A manufacturer, product family, model, controller or spare part cannot be approved without a source of type manufacturer / government / industry_body / distributor with a URL. A model cannot be approved before its manufacturer.
4. **Provenance on every record.** `catalogue_sources` holds:
   - source URL and organisation;
   - research date and verification date;
   - confidence.

   External sources must have a URL and organisation.
5. **"Verified" needs a verification date** on at least one source.
6. **Workflow.**
   - draft → pending_review → approved / rejected
   - approved → retired
   - retired → approved
   - rejected → pending_review

   Rejecting or retiring needs a reason. Every change goes to the audit log.
7. **No direct writes.** All changes go through admin-only SQL functions.

## 3. Starter data

`scripts/catalogue/starter-data.mjs` generates two files:

- `supabase/seed/catalogue/starter-catalogue.json`, which you can import through the admin portal;
- `supabase/seed/catalogue.sql`, loaded by the seed step.

**Contents:** 239 generic records, all pending review.

| What | Count |
|---|---|
| Industries | 9 |
| Rice-mill process stages | 15 |
| Disciplines | 7 |
| Equipment categories | 21 + rice/grain |
| Machine types (32 in the rice-mill line, including all 22 from the brief) | 93 |
| Components | 37 |
| Reported problem types | 21 |
| Service skills | 35 |

There are 532 English aliases.

**Source.** Every row has a `platform_taxonomy` source, confidence "medium", marked *"Needs review by a practising industrial / rice-mill technician."*

**Not included:**
- manufacturers, models, controllers or part numbers (see [catalogue-research-worklist.md](catalogue-research-worklist.md));
- Telugu, Hindi or Urdu aliases (they need a native speaker who knows mill terminology).

**To change starter data:** edit `starter-data.mjs`, then run `npm run catalogue:build`. A test fails if the generated files are out of date.

## 4. Admin workflow (admin portal → Catalogue)

| Task | Where |
|---|---|
| Review and approve | **Records**: defaults to *pending review*. Select all on the page, choose Approve, then Apply. |
| Inspect a record | Record page: details, sources (add more), aliases (add or remove), links, possible duplicates |
| Merge duplicates | Record page → *Possible duplicates* → reason → **Merge this into …**. Aliases, links and sources move to the surviving record. The old one stays as `merged` and points to it (`catalogue_resolve()`). |
| Import | **Import**: choose a file → **Check file** (dry run, nothing saved) → choose the file again → **Import** |
| Export | **Export CSV / JSON** (approved records). The output is in the import format, so it can be edited and re-imported. |
| User suggestions | **Suggestions**: create a record for review, mark it as already existing, or reject it with a reason |
| Search analytics | **Search analytics**: top searches, zero-result searches (add aliases for these), most chosen records |

The first approval of the starter data should be done together with a rice-mill technician. Remove or fix anything they don't recognise.

## 5. Import format

**CSV:** see [catalogue-import-template.csv](catalogue-import-template.csv), one source per row.

| Column | Notes |
|---|---|
| `key` | Stable ID, lower-case: `machine.rubber_roll_husker`. Re-importing an existing key never overwrites it. Only new aliases, links and sources are added. |
| `kind` | One of the kinds above |
| `name` | Display name |
| `scope_key` | Manufacturer key; required for product_family and model |
| `aliases` | `sheller\|dehusker\|te:<Telugu>` |
| `links` | `used_in:stage.rice_mill.husking;in_category:category.grain_processing` |
| `source_type` … `confidence` | One source per row |
| `attributes_json` | JSON object, e.g. `{"capacity_tph": "2"}` (only values taken from the source) |

**JSON:** a list of rows, or `{ "rows": [...] }`, in the shape of `CatalogueImportRow` (`packages/core/src/catalogue.ts`). `sources` and `links` are arrays and may carry `verification_status`.

**Duplicate detection.**
- Same kind, same manufacturer and same normalised name under a different key: the row is **skipped** and reported as a duplicate.
- Trigram similarity ≥ 0.6: the row is imported and **flagged** "similar to …" for review.

**Limits:** 5,000 rows and 5 MB per file.

## 6. Search

`search_catalogue(query, kinds?, limit?)`:
- searches approved records only;
- matches names and aliases by substring and trigram similarity, so it tolerates misspellings ("destonr");
- searches Telugu or Hindi aliases as typed;
- returns the matched alias, so the UI can say "also called …".

Each search is logged as normalised query text, result count, user id (or anonymous) and channel. Choosing a result is recorded through `log_catalogue_selection`. No other personal data is kept. A retention job, to be decided with counsel, should delete events older than 12 months (Prompt 11).

## 7. Tests

`supabase/tests/catalogue.test.ts` (PGlite) covers:
- the starter content: 15 stages, the required rice-mill machines, 21 categories, no makes or models, a source on every record;
- TypeScript/SQL parity for normalisation and the relation matrix;
- RLS before and after approval, admin-only writes, status transitions;
- import: dry run, duplicates, error rows, idempotent re-import;
- source-required approval;
- aliases, including Telugu, and search;
- analytics, merge, invalid links, suggestions (rate limit, privacy, accept flow).

`packages/core/test/catalogue.test.ts` covers the CSV parser and conversion, export formula-injection protection, and row validation.
