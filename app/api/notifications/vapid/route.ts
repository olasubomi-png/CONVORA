import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getVapidPublicKey } from "@/lib/notifications/push";

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const publicKey = getVapidPublicKey();
    return NextResponse.json({
      configured: Boolean(publicKey),
      publicKey,
    });
  } catch (error) {
    return jsonError(error);
  }
}
