"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { upsertOwnAgentProfile } from "@/lib/profiles/agent";
import { upsertOrganizationProfile } from "@/lib/profiles/organization";
import { createAgentPost, setAgentPostVisibility } from "@/lib/posts/agent-posts";
import { parseInput } from "@/lib/validation";
import {
  agentPostSchema,
  agentProfileSchema,
  organizationProfileSchema,
} from "@/lib/validation/profiles";
import { toPublicError } from "@/lib/errors";

export type ProfileActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

export async function saveAgentProfileAction(
  formData: FormData,
): Promise<ProfileActionResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const raw = formDataToObject(formData);
    const organizationId = raw.organizationId;
    if (!organizationId) {
      return { ok: false, error: "Organization is required.", code: "VALIDATION_ERROR" };
    }
    // organizationId is validated against the user's membership server-side
    const input = parseInput(agentProfileSchema, raw);
    const profile = await upsertOwnAgentProfile(auth.user.id, organizationId, input);
    revalidatePath("/app/profile");
    revalidatePath(`/@${profile.publicUsername}`);
    return { ok: true };
  } catch (error) {
    const publicError = toPublicError(error);
    return {
      ok: false,
      error: publicError.payload.error.message,
      code: publicError.payload.error.code,
    };
  }
}

export async function saveOrganizationProfileAction(
  formData: FormData,
): Promise<ProfileActionResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const raw = formDataToObject(formData);
    const organizationId = raw.organizationId;
    if (!organizationId) {
      return { ok: false, error: "Organization is required.", code: "VALIDATION_ERROR" };
    }
    const input = parseInput(organizationProfileSchema, raw);
    await upsertOrganizationProfile(auth.user.id, organizationId, input);
    revalidatePath("/app/organization");
    revalidatePath("/app/organization/profile");
    return { ok: true };
  } catch (error) {
    const publicError = toPublicError(error);
    return {
      ok: false,
      error: publicError.payload.error.message,
      code: publicError.payload.error.code,
    };
  }
}

export async function createPostAction(
  formData: FormData,
): Promise<ProfileActionResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const raw = formDataToObject(formData);
    const agentProfileId = raw.agentProfileId;
    if (!agentProfileId) {
      return { ok: false, error: "Profile is required.", code: "VALIDATION_ERROR" };
    }
    const input = parseInput(agentPostSchema, raw);
    await createAgentPost(auth.user.id, agentProfileId, input);
    revalidatePath("/app/profile");
    return { ok: true };
  } catch (error) {
    const publicError = toPublicError(error);
    return {
      ok: false,
      error: publicError.payload.error.message,
      code: publicError.payload.error.code,
    };
  }
}

export async function publishPostAction(
  formData: FormData,
): Promise<ProfileActionResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const postId = formData.get("postId");
    if (typeof postId !== "string" || !postId) {
      return { ok: false, error: "Post is required.", code: "VALIDATION_ERROR" };
    }
    await setAgentPostVisibility(auth.user.id, postId, "PUBLIC");
    revalidatePath("/app/profile");
    return { ok: true };
  } catch (error) {
    const publicError = toPublicError(error);
    return {
      ok: false,
      error: publicError.payload.error.message,
      code: publicError.payload.error.code,
    };
  }
}
