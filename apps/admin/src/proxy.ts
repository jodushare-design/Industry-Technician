import type { NextRequest } from "next/server";
import { refreshSession } from "@itm/next/proxy";

/** Everything except sign-in requires a session. Staff role is checked per page (lib/dal.ts) and by RLS. */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/sign-in") {
    return refreshSession(request, { protectedPrefixes: [], signInPath: "/sign-in" });
  }
  return refreshSession(request, { protectedPrefixes: ["/"], signInPath: "/sign-in" });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
