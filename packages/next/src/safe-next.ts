/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeNextPath(value: string | string[] | undefined, fallback = "/account"): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
