import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/lib/notifications/push";
import { parseInput, z } from "@/lib/validation";
import { getActiveMembership } from "@/lib/authz/membership";
import { ValidationError } from "@/lib/errors";

const subscribeSchema = z.object({
  organizationId: z.string().uuid(),
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(200),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(subscribeSchema, body);
    const membership = await getActiveMembership(
      auth.user.id,
      input.organizationId,
    );
    if (!membership) {
      throw new ValidationError("You are not an active member of this organization.");
    }
    const row = await savePushSubscription({
      userId: auth.user.id,
      membershipId: membership.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(unsubscribeSchema, body);
    await removePushSubscription(auth.user.id, input.endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
