import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, DraftLegalBanner, PageHeader } from "@itm/ui";

/**
 * Public legal pages. Until each document is approved in legal review
 * (docs/legal-review/README.md) only a draft notice is published here —
 * the draft text itself is not shown to the public.
 */
const DOCUMENTS: Record<string, string> = {
  customer_terms: "Customer Terms of Use",
  technician_terms: "Technician Terms of Use",
  company_terms: "Service Company Terms of Use",
  marketplace_description: "Marketplace Service Description",
  privacy_policy: "Privacy Policy",
  acceptable_use: "Acceptable Use Policy",
  prohibited_activities: "Prohibited Activities Policy",
  grievance_policy: "Grievance and Complaint Policy",
  estimate_terms: "Service Estimate and Approval Terms",
  parts_terms: "Spare-Parts Coordination Terms",
  provider_relationship: "Independent Provider Relationship Statement",
  platform_disclaimer: "Platform Disclaimer",
};

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((code) => ({ code }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: DOCUMENTS[code] ?? "Legal" };
}

export default async function LegalPage({ params }: PageProps<"/legal/[code]">) {
  const { code } = await params;
  const title = DOCUMENTS[code];
  if (!title) notFound();

  const officerName = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME;
  const officerEmail = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={title} />
      <DraftLegalBanner />
      <Card>
        <p>The final text of this document will be published here after legal review.</p>
        {code === "grievance_policy" && (
          <p className="mt-3">
            Grievance Officer: {officerName || "[to be appointed]"}
            {officerEmail ? ` — ${officerEmail}` : ""}
          </p>
        )}
      </Card>
    </div>
  );
}
