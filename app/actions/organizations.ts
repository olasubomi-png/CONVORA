"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { toPublicError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { createOrganizationSchema } from "@/lib/validation/auth";

export type OrgActionResult = { ok: true; organizationId: string } | { ok: false; error: string; code?: string };

function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

export async function createOrganizationAction(formData: FormData): Promise<OrgActionResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const input = parseInput(createOrganizationSchema, formDataToObject(formData));
    const result = await createOrganizationWithOwner(auth.user.id, input);
    redirect(`/app/organization?org=${result.organizationId}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error &&
        typeof (error as { digest?: unknown }).digest === "string" &&
        (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const publicError = toPublicError(error);
    return { ok: false, error: publicError.payload.error.message, code: publicError.payload.error.code };
  }
}
