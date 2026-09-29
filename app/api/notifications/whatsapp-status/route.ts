import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { isWhatsAppNotificationsConfigured } from "@/lib/notifications/whatsapp";

/** Whether platform WhatsApp agent alerts are configured (no secrets exposed). */
export async function GET() {
  try {
    await requireAuthenticatedUser();
    return NextResponse.json({
      configured: isWhatsAppNotificationsConfigured(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
