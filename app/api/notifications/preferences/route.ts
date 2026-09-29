import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/notify";
import { parseInput, z } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

const patchSchema = z.object({
  organizationId: z.string().uuid(),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  /** Cooldown window in seconds before another email for the same conversation (30–3600). */
  emailDigestSeconds: z.number().int().min(30).max(3600).optional(),
  whatsappEnabled: z.boolean().optional(),
  whatsappPhoneE164: z.string().max(20).nullable().optional(),
  whatsappDigestSeconds: z.number().int().min(30).max(3600).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    const prefs = await getNotificationPreferences(
      auth.user.id,
      organizationId,
    );
    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(patchSchema, body);
    const prefs = await updateNotificationPreferences(
      auth.user.id,
      input.organizationId,
      input,
    );
    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    return jsonError(error);
  }
}
