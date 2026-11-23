import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TELANGANA_DISTRICTS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, SelectField, TextField, fieldClass, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { LocationFields } from "@/components/location-fields";
import { getCatalogueOptions, type CatalogueOptions } from "@/lib/options";
import { removeMachineAction, saveFactoryAction, saveMachineAction, setFactoryActiveAction } from "./actions";

export const metadata: Metadata = { title: "My factories and machines" };
export const dynamic = "force-dynamic";

export default async function FactoriesPage({ searchParams }: PageProps<"/account/factories">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account/factories");
  if (!session.roles.includes("customer")) redirect("/account");
  const sp = await searchParams;
  const { client } = session;

  const [{ data: factories }, { data: machines }, options] = await Promise.all([
    client.from("factories").select("*").order("created_at"),
    client.from("customer_machines").select("*").order("created_at"),
    getCatalogueOptions(client),
  ]);
  const typeIds = [...new Set((machines ?? []).flatMap((m) => [m.machine_type_id, m.manufacturer_id, m.model_id]).filter(Boolean))] as string[];
  const { data: names } = typeIds.length
    ? await client.from("catalogue_entities").select("id, name").in("id", typeIds)
    : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));
  const active = (factories ?? []).filter((f) => f.is_active);
  const hidden = (factories ?? []).filter((f) => !f.is_active);

  return (
    <div className="space-y-6">
      <Link href="/account" className="text-sm underline">← My account</Link>
      <PageHeader title="My factories and machines" description="Add each site and the machines there. When you ask for help, you pick from this list." />
      <Flash notice={sp.notice} error={sp.error} />

      {active.map((f) => (
        <Card key={f.id} className="space-y-4">
          <div id={`factory-${f.id}`} className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{f.name}</h2>
              <p className="text-sm text-muted">
                {[f.address_line, f.locality, f.district, f.pincode].filter(Boolean).join(", ")}
                {f.latitude != null && " · location saved"}
              </p>
            </div>
            <form action={setFactoryActiveAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="active" value="false" />
              <button className={smallButtonClass}>Hide this factory</button>
            </form>
          </div>

          <ul className="divide-y divide-line rounded-md border border-line">
            {(machines ?? []).filter((m) => m.factory_id === f.id).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <span className="font-medium">{m.label ? `${m.label} — ` : ""}{nameOf.get(m.machine_type_id)}</span>
                  <span className="text-muted">
                    {" "}
                    {[nameOf.get(m.manufacturer_id ?? "") ?? m.manufacturer_text, nameOf.get(m.model_id ?? "") ?? m.model_text, m.year_installed]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {m.is_active && (
                    <Link href={`/requests/new?machine=${m.id}`} className={smallButtonClass} aria-label={`Report a problem with ${m.label ?? nameOf.get(m.machine_type_id)}`}>
                      Report a problem
                    </Link>
                  )}
                  <form action={removeMachineAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="text-danger underline" aria-label={`Remove ${m.label ?? nameOf.get(m.machine_type_id)}`}>Remove</button>
                  </form>
                </span>
              </li>
            ))}
            {(machines ?? []).filter((m) => m.factory_id === f.id).length === 0 && (
              <li className="p-3 text-sm text-muted">No machines yet.</li>
            )}
          </ul>

          <details className="rounded-md border border-line p-3">
            <summary className="cursor-pointer font-medium">Add a machine</summary>
            <MachineForm factoryId={f.id} options={options} />
          </details>
        </Card>
      ))}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">{active.length ? "Add another factory" : "Add your factory"}</h2>
        <FactoryForm />
      </Card>

      {hidden.length > 0 && (
        <section className="text-sm">
          <h2 className="font-semibold">Hidden factories</h2>
          <ul className="mt-2 space-y-1">
            {hidden.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                {f.name}
                <form action={setFactoryActiveAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="active" value="true" />
                  <button className="underline">Restore</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FactoryForm() {
  return (
    <form action={saveFactoryAction} className="grid gap-3 sm:grid-cols-2">
      <TextField id="f-name" name="name" label="Factory or business name" required className="sm:col-span-2" />
      <TextField id="f-address" name="addressLine" label="Address (optional)" className="sm:col-span-2" />
      <TextField id="f-locality" name="locality" label="Area, village or industrial estate" required />
      <SelectField label="District" name="district" defaultValue="">
        <option value="">Choose…</option>
        {TELANGANA_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
      </SelectField>
      <TextField id="f-city" name="city" label="Town / city" defaultValue="Hyderabad" />
      <TextField id="f-pin" name="pincode" label="PIN code (optional)" inputMode="numeric" maxLength={6} />
      <TextField id="f-gst" name="gstin" label="GSTIN (optional)" maxLength={15} />
      <div className="sm:col-span-2">
        <LocationFields latName="latitude" lngName="longitude" />
      </div>
      <div className="sm:col-span-2">
        <button className={primaryButtonClass}>Save factory</button>
      </div>
    </form>
  );
}

function MachineForm({ factoryId, options }: { factoryId: string; options: CatalogueOptions }) {
  return (
    <form action={saveMachineAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="factoryId" value={factoryId} />
      <div className="sm:col-span-2">
        <SelectField label="Machine" name="machineTypeId" required defaultValue="" hint="Not sure? Choose “I don't know the machine name” and describe it below.">
          <option value="" disabled>Choose…</option>
          {options.unknownMachine && <option value={options.unknownMachine.id}>{options.unknownMachine.name}</option>}
          {options.machineGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </optgroup>
          ))}
        </SelectField>
      </div>
      {options.manufacturers.length > 0 && (
        <SelectField label="Make (from the list)" name="manufacturerId" defaultValue="">
          <option value="">Not listed / not sure</option>
          {options.manufacturers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </SelectField>
      )}
      <TextField id={`mt-${factoryId}`} name="manufacturerText" label="Make (if not in the list)" />
      <TextField id={`md-${factoryId}`} name="modelText" label="Model (as on the name plate, optional)" />
      <TextField id={`lb-${factoryId}`} name="label" label="Your name for it (e.g. Husker 2)" />
      <TextField id={`yr-${factoryId}`} name="yearInstalled" label="Year installed (optional)" inputMode="numeric" maxLength={4} />
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
        Notes (optional)
        <textarea name="notes" maxLength={1000} rows={2} className={`${fieldClass} py-2 font-normal`} />
      </label>
      <div className="sm:col-span-2">
        <button className={primaryButtonClass}>Add machine</button>
      </div>
    </form>
  );
}
