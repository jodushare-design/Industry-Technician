import Link from "next/link";
import { Card, IconTile } from "@itm/ui";

const STEPS = [
  { color: "orange", icon: "1", title: "Describe the problem", text: "Pick your machine, say what you are seeing, add photos or a voice note." },
  { color: "blue", icon: "2", title: "Contact providers", text: "See why each independent provider matches your machine, then choose whom to contact." },
  { color: "green", icon: "3", title: "Approve the estimate", text: "The provider sends an estimate. You accept, reject or ask for changes — every version is kept." },
] as const;

const INDUSTRIES = [
  ["Rice mills", "bg-orange-soft text-warning", "/machines"],
  ["CNC & machine tools", "bg-blue-soft text-accent", "/machines?q=cnc"],
  ["Motors & drives", "bg-purple-soft text-ios-purple", "/machines?q=motor"],
  ["Pumps & compressors", "bg-teal-soft text-ios-teal", "/machines?q=pump"],
  ["Electrical panels", "bg-red-soft text-danger", "/machines?q=panel"],
  ["PLC & automation", "bg-indigo-soft text-ios-indigo", "/machines?q=plc"],
  ["Boilers & utilities", "bg-pink-soft text-ios-pink", "/machines?q=boiler"],
  ["Packaging", "bg-green-soft text-success", "/machines?q=packing"],
] as const;

const FEATURES = [
  { color: "purple", icon: "✓", title: "Checks you can read", text: "Badges say exactly what was reviewed and when — never vague claims." },
  { color: "teal", icon: "₹", title: "Every price recorded", text: "Estimates, revisions and part costs are approved in the app, with history." },
  { color: "pink", icon: "!", title: "Help when it goes wrong", text: "Complaints are acknowledged within 24 hours and followed up with both sides." },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-surface p-8 shadow-card sm:p-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-gradient-to-br from-ios-blue/30 via-ios-purple/25 to-ios-pink/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-gradient-to-tr from-ios-orange/25 to-ios-yellow/20 blur-3xl" />
        <div className="relative max-w-2xl space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full bg-blue-soft px-3 py-1 text-[13px] font-semibold text-accent">
            <span className="size-2 rounded-full bg-ios-green" /> Hyderabad · Nalgonda · Telangana
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Find a technician for your{" "}
            <span className="bg-gradient-to-r from-ios-blue via-ios-purple to-ios-pink bg-clip-text text-transparent">industrial machine</span>
          </h1>
          <p className="text-lg text-muted sm:text-xl">
            Search independent technicians and service companies by machine and skill. Chat with them, receive their estimates,
            and keep a clear record of what you approved.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/sign-in?as=customer" className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-[17px] font-semibold text-on-accent shadow-sm transition hover:bg-accent-strong active:scale-[0.98]">
              Find a technician
            </Link>
            <Link href="/sign-in?as=provider" className="inline-flex min-h-12 items-center rounded-full bg-blue-soft px-6 text-[17px] font-semibold text-accent transition hover:brightness-95 active:scale-[0.98]">
              Join as a service provider
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-2xl font-bold tracking-tight">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.title} className="space-y-3">
              <IconTile color={s.color}>{s.icon}</IconTile>
              <h3 className="text-[17px] font-semibold">{s.title}</h3>
              <p className="text-[15px] text-muted">{s.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Industries */}
      <section aria-labelledby="industries" className="space-y-4">
        <h2 id="industries" className="text-2xl font-bold tracking-tight">Machines we cover</h2>
        <ul className="flex flex-wrap gap-2.5">
          {INDUSTRIES.map(([label, style, href]) => (
            <li key={label}>
              <Link href={href} className={`inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-semibold transition hover:brightness-95 ${style}`}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Trust */}
      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-3">
            <IconTile color={f.color}>{f.icon}</IconTile>
            <div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-[15px] text-muted">{f.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-subtle p-6 text-[15px]">
        <h2 className="mb-1 font-semibold">How this marketplace works</h2>
        <p className="text-muted">
          Technicians and service companies here are independent businesses. You agree the work, price, site safety arrangements
          and payment directly with the provider you choose. The platform provides search, chat, estimate and approval records,
          parts coordination and a complaint channel.{" "}
          <Link href="/legal/marketplace_description" className="font-medium text-accent hover:underline">
            Read more
          </Link>
        </p>
      </section>
    </div>
  );
}
