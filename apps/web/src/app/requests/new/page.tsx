import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@itm/next/server";
import { Alert, PageHeader } from "@itm/ui";
import { getCatalogueOptions } from "@/lib/options";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "Ask for help" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(sp.post === "1" ? "/requests/new?post=1" : "/requests/new")}`);
  if (!session.roles.includes("customer")) redirect("/account");
  const { client } = session;
  const initialMachineId = typeof sp.machine === "string" ? sp.machine : undefined;
  const postFirst = sp.post === "1";

  const [{ data: factories }, { data: machines }, { data: industries }, options] = await Promise.all([
    client.from("factories").select("id, name, locality, latitude").eq("is_active", true).order("created_at"),
    client.from("customer_machines").select("id, factory_id, label, machine_type_id, manufacturer_text, model_text").eq("is_active", true).order("created_at"),
    client.from("catalogue_entities").select("id, name, is_generic").eq("kind", "industry").order("sort_order"),
    getCatalogueOptions(client),
  ]);
  if (!factories?.length) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader title="Ask for help" />
        <Alert tone="info" title="Add your factory first">
          Tell us where your factory is so we can find providers who travel there.{" "}
          <Link className="underline" href="/account/factories">Add your factory</Link>
        </Alert>
      </div>
    );
  }
  const typeIds = [...new Set((machines ?? []).map((m) => m.machine_type_id))];
  const { data: typeNames } = typeIds.length ? await client.from("catalogue_entities").select("id, name").in("id", typeIds) : { data: [] };
  const nameOf = new Map((typeNames ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={postFirst ? "Post your machine problem" : "Report a machine problem"}
        description={postFirst
          ? "Pick the machine and say what is happening. Technicians and companies who work on it are told, and can offer to help."
          : "Pick the machine, say what is happening, and see technicians who work on it near you."}
      />
      <NewRequestForm
        factories={factories.map((f) => ({ id: f.id, name: f.name, locality: f.locality, hasLocation: f.latitude != null }))}
        myMachines={(machines ?? []).map((m) => ({
          id: m.id,
          factoryId: m.factory_id,
          label: m.label || nameOf.get(m.machine_type_id) || "Machine",
          detail: [m.label ? nameOf.get(m.machine_type_id) : null, m.manufacturer_text, m.model_text].filter(Boolean).join(" · "),
        }))}
        industries={(industries ?? []).filter((i) => !i.is_generic)}
        unknownMachine={options.unknownMachine}
        machineGroups={options.machineGroups}
        initialMachineId={initialMachineId}
        postFirst={postFirst}
      />
    </div>
  );
}
