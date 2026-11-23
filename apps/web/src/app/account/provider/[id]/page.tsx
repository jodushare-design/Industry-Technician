import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProviderGaps } from "@itm/api";
import {
  AVAILABILITY_LABELS,
  DOCUMENT_TYPES,
  LANGUAGE_OPTIONS,
  PROVIDER_STATUS_LABELS,
  SKILL_LEVEL_LABELS,
  TELANGANA_DISTRICTS,
  badgeText,
  type ProviderDocumentType,
} from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Card, Flash, PageHeader, SelectField, StatusPill, TextField, fieldClass, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { LocationFields } from "@/components/location-fields";
import { getCatalogueOptions } from "@/lib/options";
import {
  addMakeModelAction,
  addSkillAction,
  copySkillAction,
  deleteDocumentAction,
  removeMakeModelAction,
  removeSkillAction,
  saveAreaAction,
  saveCompanyAction,
  saveDetailsAction,
  submitAction,
  updateSkillAction,
} from "./actions";
import { DocumentUploader } from "./document-uploader";

export const metadata: Metadata = { title: "Provider profile" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE = { draft: "neutral", submitted: "warning", approved: "success", rejected: "danger", suspended: "danger" } as const;

export default async function ProviderEditorPage({ params, searchParams }: PageProps<"/account/provider/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/account/provider/${id}`);
  const sp = await searchParams;
  const { client } = session;

  const { data: p } = await client.from("provider_profiles").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  const [{ data: skills }, { data: documents }, { data: checks }, options, gaps] = await Promise.all([
    client.from("provider_skills").select("*").eq("provider_profile_id", id).order("created_at"),
    client.from("provider_documents").select("id, doc_type, title, issuer, valid_until, review_status, review_note, created_at").eq("provider_profile_id", id).order("created_at"),
    client.from("verification_checks").select("kind, label, passed, valid_until, reviewed_at, revoked_at").eq("provider_profile_id", id).order("reviewed_at", { ascending: false }),
    getCatalogueOptions(client),
    getProviderGaps(client, id).catch(() => [] as string[]),
  ]);
  const skillIds = (skills ?? []).map((s) => s.id);
  const [{ data: makes }, { data: entityNames }] = await Promise.all([
    skillIds.length ? client.from("provider_make_model_experience").select("*").in("provider_skill_id", skillIds) : Promise.resolve({ data: [] as never[] }),
    skillIds.length
      ? client.from("catalogue_entities").select("id, name, kind").in("id", (skills ?? []).map((s) => s.catalogue_entity_id))
      : Promise.resolve({ data: [] as { id: string; name: string; kind: string }[] }),
  ]);
  const entity = new Map((entityNames ?? []).map((e) => [e.id, e]));

  // Company admins editing an employee can copy company skills (explicitly, one at a time).
  const isCompanyAdminEditingMember =
    p.kind === "company_member" && session.roles.includes("company_admin") && session.context.roles.some((r) => r.role === "company_admin" && r.organization_id === p.organization_id);
  let companySkills: { id: string; name: string }[] = [];
  if (p.kind === "company_member") {
    const { data: company } = await client.from("provider_profiles").select("id").eq("organization_id", p.organization_id!).eq("kind", "company").maybeSingle();
    if (company && isCompanyAdminEditingMember) {
      const { data: cs } = await client.from("provider_skills").select("id, catalogue_entity_id").eq("provider_profile_id", company.id);
      const { data: cn } = cs?.length ? await client.from("catalogue_entities").select("id, name").in("id", cs.map((c) => c.catalogue_entity_id)) : { data: [] };
      const nm = new Map((cn ?? []).map((c) => [c.id, c.name]));
      const mine = new Set((skills ?? []).map((s) => s.catalogue_entity_id));
      companySkills = (cs ?? []).filter((c) => !mine.has(c.catalogue_entity_id)).map((c) => ({ id: c.id, name: nm.get(c.catalogue_entity_id) ?? "?" }));
    }
  }

  const isSelf = p.user_id === session.context.profile.id;
  const docTypes = (Object.keys(DOCUMENT_TYPES) as ProviderDocumentType[]).filter((t) => {
    const who = DOCUMENT_TYPES[t].who;
    if (who === "company") return p.kind === "company";
    if (who === "person") return p.kind !== "company" && isSelf;
    return true;
  });
  const title = p.kind === "company" ? "Company profile" : p.kind === "company_member" ? "Employee profile" : "My technician profile";
  const editable = p.status !== "suspended";
  const badges = (checks ?? []).filter((c) => c.passed && !c.revoked_at);

  return (
    <div className="space-y-6">
      <Link href="/account" className="text-sm underline">← My account</Link>
      <PageHeader
        title={`${title}${p.display_name ? `: ${p.display_name}` : ""}`}
        description={<StatusPill tone={STATUS_TONE[p.status]}>{PROVIDER_STATUS_LABELS[p.status]}</StatusPill>}
      />
      <Flash notice={sp.notice} error={sp.error} />

      <Alert tone="info" title="You are an independent service provider">
        {p.kind === "company"
          ? "Your company and its employees are independent of the platform. You decide which requests to accept, whom to send, your prices and your methods."
          : "You are not employed by the platform. You decide which requests to accept, your prices and your methods."}
      </Alert>

      {p.status_reason && <Alert tone={p.status === "approved" ? "info" : "warning"} title="Note from the review team">{p.status_reason}</Alert>}

      {(p.status === "draft" || p.status === "rejected") && (
        <Card>
          <h2 className="mb-2 font-semibold">Ready for review?</h2>
          {gaps.length > 0 ? (
            <>
              <p className="text-sm">Before you submit:</p>
              <ul className="mt-1 list-disc pl-5 text-sm">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </>
          ) : (
            <form action={submitAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="profileId" value={id} />
              <p className="text-sm">Everything required is filled in. Customers see your profile only after it is approved.</p>
              <button className={primaryButtonClass}>Submit for review</button>
            </form>
          )}
          {p.kind === "individual" && (
            <p className="mt-2 text-sm text-muted">Approval needs an identity check: upload an identity document below.</p>
          )}
          {p.kind === "company" && (
            <p className="mt-2 text-sm text-muted">Approval needs a business details check: upload your business registration or GST certificate below.</p>
          )}
        </Card>
      )}

      {p.status === "approved" && (
        <p className="text-sm">
          <Link className="underline" href={`/providers/${id}`}>See your profile as customers see it</Link>. Changing your name or business
          registration details sends it back for review.
        </p>
      )}

      <Card>
        <h2 id="details" className="mb-3 font-semibold">{p.kind === "company" ? "About the company" : "About you"}</h2>
        <form action={saveDetailsAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="profileId" value={id} />
          <TextField id="displayName" name="displayName" label={p.kind === "company" ? "Company name (as customers see it)" : "Your name (as customers see it)"} defaultValue={p.display_name ?? ""} required />
          <TextField id="yearsExperience" name="yearsExperience" label="Total years of experience" inputMode="numeric" defaultValue={p.years_experience?.toString() ?? ""} />
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            Short description (optional)
            <textarea name="bio" rows={3} maxLength={1000} defaultValue={p.bio ?? ""} className={`${fieldClass} py-2 font-normal`} placeholder="What you work on, where, and how customers can reach you through the app." />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Languages spoken</legend>
            <div className="flex flex-wrap gap-3">
              {LANGUAGE_OPTIONS.map(([code, label]) => (
                <label key={code} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="languages" value={code} defaultChecked={p.languages.includes(code)} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          <SelectField label="Availability" name="availability" defaultValue={p.availability}>
            {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <TextField id="availabilityNote" name="availabilityNote" label="Availability note (optional)" defaultValue={p.availability_note ?? ""} placeholder="e.g. Mon–Sat, emergency calls on Sunday" />
          <div className="sm:col-span-2"><button className={primaryButtonClass} disabled={!editable}>Save</button></div>
        </form>
      </Card>

      {p.kind === "company" && (
        <Card>
          <h2 id="company" className="mb-3 font-semibold">Business details</h2>
          <form action={saveCompanyAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="profileId" value={id} />
            <TextField id="businessPhone" name="businessPhone" label="Business phone" type="tel" defaultValue={p.business_phone ?? ""} required hint="Not shown to customers. Customers contact you through the app." />
            <TextField id="businessEmail" name="businessEmail" label="Business email (optional)" type="email" defaultValue={p.business_email ?? ""} />
            <TextField id="businessAddress" name="businessAddress" label="Business address" defaultValue={p.business_address ?? ""} required className="sm:col-span-2" />
            <TextField id="businessPincode" name="businessPincode" label="PIN code" defaultValue={p.business_pincode ?? ""} inputMode="numeric" maxLength={6} />
            <TextField id="gstin" name="gstin" label="GSTIN (optional)" defaultValue={p.gstin ?? ""} maxLength={15} />
            <TextField id="registrationNumber" name="registrationNumber" label="Registration number (optional)" defaultValue={p.registration_number ?? ""} hint="e.g. Udyam, CIN or LLPIN" />
            <div className="sm:col-span-2"><button className={primaryButtonClass} disabled={!editable}>Save business details</button></div>
          </form>
        </Card>
      )}

      <Card>
        <h2 id="area" className="mb-3 font-semibold">Where you work</h2>
        <form action={saveAreaAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="profileId" value={id} />
          <TextField id="baseLocality" name="baseLocality" label="Base area or town" defaultValue={p.base_locality ?? ""} required />
          <SelectField label="Base district" name="baseDistrict" defaultValue={p.base_district ?? ""}>
            <option value="">Choose…</option>
            {TELANGANA_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
          </SelectField>
          <TextField id="serviceRadiusKm" name="serviceRadiusKm" label="How far will you travel? (km)" inputMode="numeric" defaultValue={String(p.service_radius_km)} required />
          <div className="sm:col-span-2">
            <LocationFields latName="baseLatitude" lngName="baseLongitude" defaultLat={p.base_latitude} defaultLng={p.base_longitude} />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Districts you also cover (optional)</legend>
            <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {TELANGANA_DISTRICTS.map((d) => (
                <label key={d} className="flex items-center gap-1">
                  <input type="checkbox" name="serviceDistricts" value={d} defaultChecked={p.service_districts.includes(d)} /> {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2"><button className={primaryButtonClass} disabled={!editable}>Save service area</button></div>
        </form>
      </Card>

      <Card>
        <h2 id="skills" className="mb-1 font-semibold">{p.kind === "company" ? "Service categories and machines" : "Machines and skills"}</h2>
        <p className="mb-3 text-sm text-muted">
          {p.kind === "company"
            ? "What the company as a whole services. These are not given to employees automatically — each employee lists their own skills."
            : "Add each machine you work on with your own years of experience. Shown to customers as “stated by provider”."}
        </p>
        <ul className="mb-4 space-y-3">
          {(skills ?? []).map((s) => {
            const e = entity.get(s.catalogue_entity_id);
            const my = (makes ?? []).filter((m) => m.provider_skill_id === s.id);
            return (
              <li key={s.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {e?.name}
                    {s.copied_from_skill_id && <span className="ml-2 text-xs text-muted">(copied from company)</span>}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={updateSkillAction} className="flex items-center gap-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="skillId" value={s.id} />
                      <input name="yearsExperience" defaultValue={s.years_experience} inputMode="numeric" aria-label={`Years with ${e?.name}`} className="min-h-10 w-16 rounded-md border border-line bg-surface px-2" />
                      <span>yrs</span>
                      <select name="level" defaultValue={s.level} aria-label={`Level for ${e?.name}`} className="min-h-10 rounded-md border border-line bg-surface px-2">
                        {Object.entries(SKILL_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button className={smallButtonClass}>Update</button>
                    </form>
                    <form action={removeSkillAction}>
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="skillId" value={s.id} />
                      <button className="text-danger underline">Remove</button>
                    </form>
                  </div>
                </div>
                {e?.kind === "machine_type" && (
                  <div className="mt-2 border-t border-line pt-2">
                    <p className="text-muted">Makes and models you know:</p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {my.map((m) => (
                        <li key={m.id} className="flex items-center gap-1 rounded border border-line px-2 py-0.5">
                          {[m.manufacturer_text, m.model_text].filter(Boolean).join(" ") || "Catalogued make/model"}
                          {m.years_experience != null && ` · ${m.years_experience} yrs`}
                          <form action={removeMakeModelAction}>
                            <input type="hidden" name="profileId" value={id} />
                            <input type="hidden" name="id" value={m.id} />
                            <button className="px-1 text-danger" aria-label="Remove make/model">×</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={addMakeModelAction} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="providerSkillId" value={s.id} />
                      <input name="manufacturerText" placeholder="Make" aria-label="Make" className="min-h-10 rounded-md border border-line bg-surface px-2" />
                      <input name="modelText" placeholder="Model (optional)" aria-label="Model" className="min-h-10 rounded-md border border-line bg-surface px-2" />
                      <input name="yearsExperience" placeholder="Years" aria-label="Years with this make" inputMode="numeric" className="min-h-10 w-20 rounded-md border border-line bg-surface px-2" />
                      <button className={smallButtonClass}>Add make/model</button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
          {(skills ?? []).length === 0 && <li className="text-sm text-muted">Nothing added yet.</li>}
        </ul>

        <form action={addSkillAction} className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-4">
          <input type="hidden" name="profileId" value={id} />
          <div className="sm:col-span-2">
            <SelectField label="Add a machine, category or skill" name="catalogueEntityId" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {options.machineGroups.map((g) => (
                <optgroup key={g.label} label={`Machines — ${g.label}`}>
                  {g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </optgroup>
              ))}
              <optgroup label="Service skills">
                {options.serviceSkills.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
              <optgroup label="Whole equipment categories">
                {options.categories.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            </SelectField>
          </div>
          <TextField id="new-years" name="yearsExperience" label="Your years" inputMode="numeric" defaultValue="1" required />
          <SelectField label="Level" name="level" defaultValue="experienced">
            {Object.entries(SKILL_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <div className="sm:col-span-4"><button className={primaryButtonClass} disabled={!editable}>Add</button></div>
        </form>

        {companySkills.length > 0 && (
          <form action={copySkillAction} className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-line p-3 text-sm">
            <input type="hidden" name="profileId" value={id} />
            <SelectField label="Copy one company skill to this employee" name="companySkillId" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {companySkills.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
            <TextField id="copy-years" name="yearsExperience" label="This person's years" inputMode="numeric" required />
            <SelectField label="Their level" name="level" defaultValue="experienced">
              {Object.entries(SKILL_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
            <button className={smallButtonClass}>Copy for this person</button>
            <p className="w-full text-muted">Only copy skills this person actually has. Each copy is recorded.</p>
          </form>
        )}
      </Card>

      <Card>
        <h2 id="documents" className="mb-1 font-semibold">Documents and photos</h2>
        <p className="mb-3 text-sm text-muted">
          Documents are private: only {p.kind === "company" ? "your company admins" : "you"} and the platform review team can open them.
          Customers see only the result of a review (a dated badge) and accepted work photos.
        </p>
        <ul className="mb-4 space-y-2 text-sm">
          {(documents ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-2">
              <span>
                <span className="font-medium">{d.title}</span> <span className="text-muted">· {DOCUMENT_TYPES[d.doc_type].label}{d.valid_until ? ` · valid until ${d.valid_until}` : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <StatusPill tone={d.review_status === "accepted" ? "success" : d.review_status === "rejected" ? "danger" : "warning"}>
                  {d.review_status === "pending" ? "waiting for review" : d.review_status}
                </StatusPill>
                {d.review_note && <span className="text-muted">{d.review_note}</span>}
                {d.review_status !== "accepted" && (
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="profileId" value={id} />
                    <input type="hidden" name="documentId" value={d.id} />
                    <button className="text-danger underline">Delete</button>
                  </form>
                )}
              </span>
            </li>
          ))}
          {(documents ?? []).length === 0 && <li className="text-muted">No documents yet.</li>}
        </ul>
        {editable && <DocumentUploader profileId={id} allowedTypes={docTypes} />}
      </Card>

      {badges.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Review results shown to customers</h2>
          <ul className="list-disc pl-5 text-sm">
            {badges.map((b, i) => <li key={i}>{badgeText({ kind: b.kind, label: b.label, valid_until: b.valid_until, reviewed_at: b.reviewed_at })}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
