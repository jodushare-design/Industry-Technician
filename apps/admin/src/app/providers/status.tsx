import type { ProviderStatus } from "@itm/types";
import { StatusPill } from "@itm/ui";
export { Flash } from "@itm/ui";

const TONE: Record<ProviderStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return <StatusPill tone={TONE[status]}>{status}</StatusPill>;
}
