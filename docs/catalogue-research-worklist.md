# Catalogue Research Worklist

**Status:** Open — 2026-11-22

The starter catalogue is generic taxonomy only. This list is the research still needed before manufacturer, model and parts data can be added.

## Rules for every researched record

1. **Use the manufacturer's own website, brochure or a government/industry source.** Record:
   - URL and organisation;
   - research date;
   - confidence.

   A dealer listing counts as a `distributor` source; give it lower confidence.
2. **Copy model names exactly** as the manufacturer prints them. Never construct, guess or "normalise" a model number.
3. **Compatibility** (`part_for`, `controlled_by`) only when a source says so. Otherwise leave the link out, or add it as `unverified` with a note.
4. **Mark a record "verified" only** after a second check (e.g. phone/email confirmation or a second document). Record the verification date.
5. **Respect copyright and terms:** store facts (names, model designations, URLs), not copied brochure text or images.
6. **Import** through the admin portal as JSON or CSV; records arrive as `pending_review`. A second person approves.

## A. Domain review of the starter taxonomy (first)

| # | Task | Who | Status |
|---|---|---|---|
| A1 | Walk through the 15 rice-mill stages and 32 rice-line machine types; correct names, add missing machines (e.g. pre-cleaner variants, paddy intake equipment, husk handling) | Practising rice-mill technician + admin | Open |
| A2 | Check the 21 reported problem types make sense to mill owners; add common ones | Technician + 2 pilot customers | Open |
| A3 | Telugu (and Hindi/Urdu) names used on mill floors in Telangana for each rice-line machine and component | Native-speaker technician | Open |
| A4 | Review regulated-work flags (boiler, electrical, pressure vessel, lifting) against the law in force | Counsel (compliance-checklist §7) | Open |
| A5 | Review the general-industry machine types against what pilot providers actually service | Admin + pilot providers | Open |

## B. Manufacturers and models (after A1)

| # | Task | Sources to use | Status |
|---|---|---|---|
| B1 | Rice-mill machinery manufacturers supplying mills in Telangana / Andhra Pradesh: legal name, website, head office | Manufacturer websites; trade-fair exhibitor lists; ask pilot mills which makes they run | Open |
| B2 | For each manufacturer in B1: product families and model designations for husker, whitener, polisher, separator, grader, colour sorter, dryer | Manufacturer product pages / brochures only | Open |
| B3 | Colour sorter manufacturers and models present in pilot mills | Manufacturer sites; machine name plates photographed at pilot mills (record as `other` source with a note, then verify with the maker's site) | Open |
| B4 | Common motor, VFD, PLC, compressor and pump makes found at pilot sites (manufacturer-level only to start) | Manufacturer websites | Open |
| B5 | Controllers (`controller` kind): specific PLC/VFD product lines that pilot providers service | Manufacturer product pages | Open |

## C. Classifications (optional enrichment)

These go in `attributes` only after checking the official text. Record the official document as a `government` source.

| # | Task | Source to check | Status |
|---|---|---|---|
| C1 | National Industrial Classification (NIC 2008) code for rice milling and for the other seeded industries | MoSPI NIC 2008 publication | Open |
| C2 | HS / ITC-HS heading for rice-milling machinery and other machine types (e.g. the heading covering grain milling machinery) | CBIC / DGFT tariff schedules | Open |
| C3 | Relevant BIS standards for rice-mill machinery or rubber rolls, where they exist | BIS standards catalogue | Open |

## D. Spare parts (later — Prompt 9)

| # | Task | Status |
|---|---|---|
| D1 | Generic consumables per rice-line machine (rubber rolls, whitening stones, screens, belts, ejectors) are seeded as components. Specific part numbers need a manufacturer source and a `part_for` link with verification status. | Open |
