export function isNextRedirectError(error: unknown): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("next/dist/client/components/redirect-error") as {
      isRedirectError?: (e: unknown) => boolean;
    };
    if (typeof mod.isRedirectError === "function") {
      return mod.isRedirectError(error);
    }
  } catch {
    /* fall through */
  }
  if (typeof error !== "object" || error === null) return false;
  if (!("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
