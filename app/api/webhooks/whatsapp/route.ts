import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { processInboundEvent } from "@/lib/channels/inbound";
import {
  registerChannelAdapter,
  getChannelAdapter,
} from "@/lib/channels/registry";
import {
  WhatsAppCloudAdapter,
  WHATSAPP_CLOUD_PROVIDER,
  verifyWhatsAppChallenge,
} from "@/lib/channels/providers/whatsapp/adapter";
import { loadWhatsAppCredentials } from "@/lib/channels/providers/whatsapp/installations";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { whatsappWebhookSchema } from "@/lib/channels/providers/whatsapp/schemas";

export const runtime = "nodejs";

/**
 * GET — Meta webhook verification challenge.
 * Query: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(request: Request) {
  try {
    const rl = checkRateLimit({
      key: "wa:webhook:verify",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Match installation by verify token (decrypt credentials)
    const db = getDatabase();
    const installations = await db
      .select()
      .from(channelInstallations)
      .where(
        and(
          eq(channelInstallations.channel, "WHATSAPP"),
          eq(channelInstallations.provider, WHATSAPP_CLOUD_PROVIDER),
          eq(channelInstallations.status, "ACTIVE"),
        ),
      );

    for (const installation of installations) {
      try {
        const creds = loadWhatsAppCredentials(installation);
        const result = verifyWhatsAppChallenge({
          mode,
          token,
          challenge,
          expectedVerifyToken: creds.verifyToken,
        });
        if (result !== null) {
          return new NextResponse(result, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
      } catch {
        // Skip installations with bad/missing credentials
      }
    }

    return new NextResponse("Forbidden", { status: 403 });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * POST — inbound WhatsApp events.
 * Signature verified before any Conversation Engine work.
 */
export async function POST(request: Request) {
  try {
    const rl = checkRateLimit({
      key: "wa:webhook:post",
      limit: 300,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const rawBody = await request.text();
    if (rawBody.length > 512_000) {
      return new NextResponse("Payload too large", { status: 413 });
    }

    // Parse lightly to discover phone_number_id for installation lookup
    let phoneNumberId: string | null = null;
    try {
      const raw: unknown = JSON.parse(rawBody);
      const parsed = whatsappWebhookSchema.safeParse(raw);
      if (parsed.success) {
        phoneNumberId =
          parsed.data.entry[0]?.changes[0]?.value.metadata?.phone_number_id ??
          null;
      }
    } catch {
      return new NextResponse("Bad Request", { status: 400 });
    }

    if (!phoneNumberId) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const db = getDatabase();
    const installations = await db
      .select()
      .from(channelInstallations)
      .where(
        and(
          eq(channelInstallations.channel, "WHATSAPP"),
          eq(channelInstallations.provider, WHATSAPP_CLOUD_PROVIDER),
          eq(channelInstallations.status, "ACTIVE"),
        ),
      );

    const installation = installations.find((r) => {
      const pc = r.publicConfig as { phoneNumberId?: string };
      return pc.phoneNumberId === phoneNumberId;
    });

    if (!installation) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const credentials = loadWhatsAppCredentials(installation);
    const adapter = new WhatsAppCloudAdapter(credentials);
    registerChannelAdapter(adapter);

    // Ensure registry returns this instance
    getChannelAdapter({
      channel: "WHATSAPP",
      provider: WHATSAPP_CLOUD_PROVIDER,
    });

    const headers: Record<string, string | null> = {
      "x-hub-signature-256": request.headers.get("x-hub-signature-256"),
    };

    await processInboundEvent({
      installationId: installation.id,
      headers,
      body: rawBody,
    });

    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    // Always avoid leaking details to Meta; log-safe path via jsonError for non-provider clients
    return jsonError(error);
  }
}
