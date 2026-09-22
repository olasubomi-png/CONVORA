import { NextResponse } from "next/server";
import { verifyPlatformMetaSignature } from "@/lib/channels/meta/webhook-signature";
import { verifyMetaWebhookChallenge } from "@/lib/channels/meta/webhook-verify";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processInboundEvent } from "@/lib/channels/inbound";
import {
  WhatsAppCloudAdapter,
  WHATSAPP_CLOUD_PROVIDER,
} from "@/lib/channels/providers/whatsapp/adapter";
import {
  loadWhatsAppCredentials,
  getWhatsAppInstallationByPhoneNumberId,
} from "@/lib/channels/providers/whatsapp/installations";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { whatsappWebhookSchema } from "@/lib/channels/providers/whatsapp/schemas";

export const runtime = "nodejs";

/**
 * GET — Meta webhook verification challenge.
 */
export async function GET(request: Request) {
  try {
    const rl = checkRateLimit({
      key: "wa:webhook:get",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const installationTokens: string[] = [];
    const db = getDatabase();
    const installations = await db
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.provider, WHATSAPP_CLOUD_PROVIDER));

    for (const installation of installations) {
      if (installation.status !== "ACTIVE") continue;
      try {
        const creds = loadWhatsAppCredentials(installation);
        installationTokens.push(creds.verifyToken);
      } catch {
        // skip bad credentials
      }
    }

    const result = verifyMetaWebhookChallenge({
      mode,
      token,
      challenge,
      installationVerifyTokens: installationTokens,
    });
    if (result !== null) {
      return new NextResponse(result, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new NextResponse("Forbidden", { status: 403 });
  } catch (error) {
    return jsonError(error);
  }
}

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

    const platformSig = verifyPlatformMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
    );
    if (platformSig.required && !platformSig.ok) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

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

    const installation =
      await getWhatsAppInstallationByPhoneNumberId(phoneNumberId);
    if (!installation) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Installation-scoped adapter (credentials for this org only)
    const credentials = loadWhatsAppCredentials(installation);
    const adapter = new WhatsAppCloudAdapter(credentials);

    const headers: Record<string, string | null> = {
      "x-hub-signature-256": request.headers.get("x-hub-signature-256"),
    };

    await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body: rawBody,
    });

    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
