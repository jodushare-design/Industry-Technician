import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@itm/next/server";
import { PartsBoard } from "../../../_parts/parts-board";

export const metadata: Metadata = { title: "Spare parts" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerPartsPage({ params, searchParams }: PageProps<"/requests/[id]/parts">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/requests/${id}/parts`);
  const sp = await searchParams;
  const { data: r } = await session.client.from("service_requests").select("reference, status, customer_id, selected_provider_id, factory_id").eq("id", id).maybeSingle();
  if (!r || r.customer_id !== session.context.profile.id) notFound();
  const { data: engaged } = await session.client.from("request_invitations").select("provider_profile_id").eq("request_id", id).eq("status", "accepted");
  const providerId = r.selected_provider_id ?? engaged?.[0]?.provider_profile_id ?? null;
  const { data: machines } = await session.client.from("customer_machines").select("id, label, machine_type_id").eq("factory_id", r.factory_id);
  return (
    <PartsBoard client={session.client} side="customer" requestId={id} providerId={providerId} reference={r.reference} jobStatus={r.status}
      backHref={`/requests/${id}`} machines={(machines ?? []).map((m) => ({ id: m.id, label: m.label ?? "Machine" }))} notice={sp.notice} error={sp.error} />
  );
}
