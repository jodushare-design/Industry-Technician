import { Alert } from "@itm/ui";

export function NoAccess() {
  return (
    <Alert tone="error" title="No access">
      This portal is only for platform staff. If you need access, ask a platform administrator.
    </Alert>
  );
}
