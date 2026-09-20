export const RESERVED_ORGANIZATION_SLUGS = new Set([
  "app","api","auth","login","logout","register","signup","signin","signout",
  "settings","admin","organization","organizations","org","me","user","users",
  "static","assets","public","health","status","docs","help","support","billing","pricing","www","convora",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

export function isValidSlug(slug: string): boolean {
  if (slug.length < 2 || slug.length > 48) return false;
  if (!SLUG_PATTERN.test(slug)) return false;
  if (RESERVED_ORGANIZATION_SLUGS.has(slug)) return false;
  return true;
}

export function slugFromName(name: string): string {
  return normalizeSlug(name);
}
