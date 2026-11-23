import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogueKey, csvToImportRows, parseCatalogueFile, parseCsv, toCsv, validateImportRows } from '../src';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines in fields, CRLF and BOM', () => {
    const text = '﻿key,name,notes\r\nmachine.a,"Husker, rubber roll","He said ""ok""\nsecond line"\r\nmachine.b,Plain,\r\n';
    expect(parseCsv(text)).toEqual([
      ['key', 'name', 'notes'],
      ['machine.a', 'Husker, rubber roll', 'He said "ok"\nsecond line'],
      ['machine.b', 'Plain', ''],
    ]);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/unclosed quote/);
  });

  it('round-trips through toCsv and neutralises spreadsheet formulas', () => {
    const rows = [['x', 'a,b', 'say "hi"', '=SUM(A1)']];
    const csv = toCsv(rows);
    expect(csv).toContain(`'=SUM(A1)`);
    expect(parseCsv(csv)).toEqual([['x', 'a,b', 'say "hi"', `'=SUM(A1)`]]);
  });
});

describe('CSV import conversion', () => {
  it('converts the documented template into valid rows', () => {
    const template = readFileSync('docs/catalogue-import-template.csv', 'utf8');
    const { rows, problems } = csvToImportRows(template);
    expect(problems).toEqual([]);
    const validated = validateImportRows(rows);
    expect(validated.problems).toEqual([]);
    const husker = validated.rows.find((r) => r.key === 'machine.example_husker');
    expect(husker?.aliases).toEqual(['example sheller', { alias: 'ఉదాహరణ', language: 'te' }]);
    expect(husker?.links).toEqual([
      { relation: 'used_in', to: 'stage.rice_mill.husking' },
      { relation: 'in_category', to: 'category.grain_processing' },
    ]);
  });

  it('reports missing and unknown columns', () => {
    expect(csvToImportRows('key,name\nx.y,Z').problems[0]?.message).toMatch(/Missing column "kind"/);
    expect(csvToImportRows('key,kind,name,colour\n').problems[0]?.message).toMatch(/Unknown column/);
  });

  it('validates rows: bad kind, bad key, model without manufacturer, invalid link inside the file, repeated key', () => {
    const { problems } = validateImportRows([
      { key: 'x.one', kind: 'gadget', name: 'One' },
      { key: 'Bad Key', kind: 'component', name: 'Two' },
      { key: 'model.three', kind: 'model', name: 'M-3' },
      { key: 'stage.four', kind: 'process_stage', name: 'Four', links: [{ relation: 'stage_of', to: 'component.five' }] },
      { key: 'component.five', kind: 'component', name: 'Five' },
      { key: 'component.five', kind: 'component', name: 'Five again' },
    ]);
    const msgs = problems.map((p) => `${p.row}:${p.message}`).join('\n');
    expect(msgs).toMatch(/^1:kind/m);
    expect(msgs).toMatch(/^2:key/m);
    expect(msgs).toMatch(/model needs scope_key/);
    expect(msgs).toMatch(/process_stage cannot be linked to a component/);
    expect(msgs).toMatch(/^6:key appears more than once/m);
  });

  it('requires URL and organisation for external sources', () => {
    const { problems } = validateImportRows([
      { key: 'manufacturer.x', kind: 'manufacturer', name: 'X Ltd', sources: [{ source_type: 'manufacturer' }] },
    ]);
    expect(problems[0]?.message).toMatch(/source_url and source_org/);
  });

  it('parseCatalogueFile picks the format from the extension', () => {
    expect(parseCatalogueFile('a.json', '[{"key":"component.x","kind":"component","name":"X part"}]')).toMatchObject({ format: 'json', problems: [] });
    expect(parseCatalogueFile('a.json', '{oops').problems[0]?.message).toMatch(/not valid JSON/);
    expect(parseCatalogueFile('a.xlsx', '').problems[0]?.message).toMatch(/\.csv or \.json/);
  });

  it('catalogueKey builds stable keys', () => {
    expect(catalogueKey('machine', 'Rubber-roll Husker (RR)')).toBe('machine.rubber_roll_husker_rr');
  });
});
