import Link from "next/link";
import { PageHeader } from "@itm/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Page not found" description="The page you were looking for doesn't exist." />
      <Link href="/" className="underline">
        Go to the home page
      </Link>
    </div>
  );
}
