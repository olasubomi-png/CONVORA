import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/notifications/notify";
import { ValidationError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    const result = await listNotificationsForUser(
      auth.user.id,
      organizationId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = (await request.json()) as {
      organizationId?: string;
      action?: string;
    };
    if (!body.organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    if (body.action === "mark_all_read") {
      const result = await markAllNotificationsRead(
        auth.user.id,
        body.organizationId,
      );
      return NextResponse.json(result);
    }
    throw new ValidationError("Unsupported action.");
  } catch (error) {
    return jsonError(error);
  }
}
