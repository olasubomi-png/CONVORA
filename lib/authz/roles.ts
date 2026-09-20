import type { MembershipRole } from "@/db/schema";

const ROLE_RANK: Record<MembershipRole, number> = { AGENT: 1, ADMIN: 2, OWNER: 3 };

export function roleAtLeast(actual: MembershipRole, required: MembershipRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function isAdminRole(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
