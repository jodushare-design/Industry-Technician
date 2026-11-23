import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getRequestForProvider } from "@itm/api";
import { getSession } from "@itm/next/server";
import { PartsBoard } from "../../../_parts/parts-board";

export const metadata: Metadata = { title: "Spare parts" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProviderPartsPage({ params, searchParams }: PageProps<"/work/[id]/parts">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/work/${id}/parts`);
  const sp = await searchParams;
  const r = await getRequestForProvider(session.client, id);
  if (!r) notFound();
  const engaged = (r.invitations ?? []).find((i) => i.status === "accepted");
  return (
    <PartsBoard client={session.client} side="provider" requestId={id} providerId={engaged?.provider_id ?? null} reference={r.reference} jobStatus={r.status}
      backHref={`/work/${id}`} machines={[]} notice={sp.notice} error={sp.error} />
  );
}
