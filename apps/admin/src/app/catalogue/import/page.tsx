import type { Metadata } from "next";
import { PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../../no-access";
import { CatalogueNav } from "../ui";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import catalogue" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await requireStaff("/catalogue/import");
  if (!session) return <NoAccess />;
  return (
    <div>
      <PageHeader
        title="Import catalogue records"
        description="CSV or JSON. Check the file first; nothing is saved until you import. Imported records wait for approval."
      />
      <CatalogueNav current="/catalogue/import" />
      {session.isPlatformAdmin ? (
        <ImportForm />
      ) : (
        <p className="text-muted">Only platform administrators can import.</p>
      )}
      <section className="mt-8 max-w-3xl space-y-2 text-sm text-muted">
        <h2 className="font-semibold text-foreground">File format</h2>
        <p>
          Use the template at <code>docs/catalogue-import-template.csv</code> (one source per row) or JSON for several sources per
          record. Columns: key, kind, name, description, scope_key, aliases (separated by |, optional <code>te:</code> prefix),
          links (<code>relation:key</code> separated by ;), regulated_work, source_type, source_url, source_org, research_date,
          verification_date, confidence, verification_status, attributes_json.
        </p>
        <p>
          Records with an existing key are not overwritten — only new aliases, links and sources are added. Records with the same
          name as an existing one are skipped as duplicates.
        </p>
      </section>
    </div>
  );
}
