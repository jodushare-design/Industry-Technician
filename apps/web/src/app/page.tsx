import Link from "next/link";
import { Card } from "@itm/ui";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Find a technician for your industrial machine</h1>
        <p className="max-w-2xl text-lg text-muted">
          Search independent technicians and service companies around Hyderabad by machine and skill. Chat with them,
          receive their estimates, and keep a clear record of what you approved.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sign-in?as=customer"
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 font-semibold text-on-accent hover:bg-accent-strong"
          >
            Find a technician
          </Link>
          <Link
            href="/sign-in?as=provider"
            className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-5 font-semibold hover:bg-subtle"
          >
            Join as a service provider
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <h2 className="font-semibold">1. Describe the problem</h2>
          <p className="mt-1 text-sm text-muted">Pick your machine, say what you are seeing, add photos or a voice note.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">2. Contact providers</h2>
          <p className="mt-1 text-sm text-muted">
            See why each independent provider matches your machine, then choose who to contact.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">3. Approve the estimate</h2>
          <p className="mt-1 text-sm text-muted">
            The provider sends an estimate. You accept, reject or ask for changes — every version is kept.
          </p>
        </Card>
      </section>

      <section className="rounded-lg border border-line bg-subtle p-5 text-sm">
        <h2 className="mb-1 font-semibold">How this marketplace works</h2>
        <p className="text-muted">
          Technicians and service companies here are independent businesses. You agree the work, price, site safety
          arrangements and payment directly with the provider you choose. The platform provides search, chat, estimate
          and approval records, parts coordination and a complaint channel.{" "}
          <Link href="/legal/marketplace_description" className="underline">
            Read more
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
