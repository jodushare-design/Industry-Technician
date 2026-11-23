import type { NextRequest } from "next/server";
import { refreshSession } from "@itm/next/proxy";

export function proxy(request: NextRequest) {
  return refreshSession(request, { protectedPrefixes: ["/account"], signInPath: "/sign-in" });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
