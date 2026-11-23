"use client";

import { useEffect } from "react";
import { reportError } from "@itm/core";
import { Alert, Button } from "@itm/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { where: "web.error-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Alert tone="error" title="Something went wrong">
        Please try again. If it keeps happening, contact support{error.digest ? ` and quote ${error.digest}` : ""}.
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
