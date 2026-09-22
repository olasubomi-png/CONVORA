"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getUserOrganizationContexts } from "@/lib/authz/context";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { upsertOrganizationProfile } from "@/lib/profiles/organization";
import { isNextRedirectError } from "@/lib/auth/redirect";
import { toPublicError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { z } from "zod";
import { normalizeSlug, isValidSlug } from "@/lib/orgs/slug";

const onboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Username is required.")
    .transform(normalizeSlug)
    .refine(isValidSlug, {
      message:
        "Use 2–48 lowercase letters, numbers, and hyphens. Reserved names are not allowed.",
    }),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export type OnboardingResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; code?: string };

function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

/**
 * First-time setup: organization + public CONVORA profile.
 * Does not require channel connection.
 */
export async function completeOnboardingAction(
  formData: FormData,
): Promise<OnboardingResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const existing = await getUserOrganizationContexts(auth.user.id);
    if (existing.length > 0) {
      redirect("/app");
    }

    const input = parseInput(onboardingSchema, formDataToObject(formData));
    const org = await createOrganizationWithOwner(auth.user.id, {
      name: input.displayName,
      slug: input.slug,
    });

    await upsertOrganizationProfile(auth.user.id, org.organizationId, {
      displayName: input.displayName,
      description: input.description || null,
      visibility: "PUBLIC",
    });

    redirect(`/app/onboarding/ready?slug=${encodeURIComponent(input.slug)}`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const publicError = toPublicError(error);
    return {
      ok: false,
      error: publicError.payload.error.message,
      code: publicError.payload.error.code,
    };
  }
}
