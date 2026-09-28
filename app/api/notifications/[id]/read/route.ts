import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { markNotificationRead } from "@/lib/notifications/notify";
import { NotFoundError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await ctx.params;
    const updated = await markNotificationRead(auth.user.id, id);
    if (!updated) {
      throw new NotFoundError("Notification not found.");
    }
    return NextResponse.json({
      ok: true,
      notification: {
        id: updated.id,
        readAt: updated.readAt,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
