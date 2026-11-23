import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@itm/next/server";
import { Alert, PageHeader } from "@itm/ui";
import { getCatalogueOptions } from "@/lib/options";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "Ask for help" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/requests/new");
  if (!session.roles.includes("customer")) redirect("/account");
  const { client } = session;

  const [{ data: factories }, { data: machines }, { data: industries }, options] = await Promise.all([
    client.from("factories").select("id, name, locality").eq("is_active", true).order("created_at"),
    client.from("customer_machines").select("id, factory_id, label, machine_type_id, manufacturer_text, model_text").eq("is_active", true),
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
      <PageHeader title="Ask for help with a machine" description="Describe what you are seeing. Independent providers who work on this machine near you can then be contacted." />
      <NewRequestForm
        factories={factories}
        myMachines={(machines ?? []).map((m) => ({
          id: m.id,
          factoryId: m.factory_id,
          label: [m.label, nameOf.get(m.machine_type_id), m.manufacturer_text].filter(Boolean).join(" — "),
        }))}
        industries={(industries ?? []).filter((i) => !i.is_generic)}
        unknownMachine={options.unknownMachine}
        machineGroups={options.machineGroups}
      />
    </div>
  );
}
