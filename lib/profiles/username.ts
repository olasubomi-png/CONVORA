/**
 * Public agent username rules.
 * Distinct from organization slugs but shares normalization patterns.
 */

export const RESERVED_AGENT_USERNAMES = new Set([
  "app",
  "api",
  "auth",
  "login",
  "logout",
  "register",
  "signup",
  "signin",
  "signout",
  "settings",
  "admin",
  "organization",
  "organizations",
  "org",
  "orgs",
  "me",
  "user",
  "users",
  "agent",
  "agents",
  "static",
  "assets",
  "public",
  "health",
  "status",
  "docs",
  "help",
  "support",
  "billing",
  "pricing",
  "www",
  "convora",
  "about",
  "privacy",
  "terms",
  "profile",
  "profiles",
]);

const USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isValidUsername(username: string): boolean {
  if (username.length < 2 || username.length > 32) {
    return false;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return false;
  }
  if (RESERVED_AGENT_USERNAMES.has(username)) {
    return false;
  }
  return true;
}
