import { NextResponse } from "next/server";
import { verifyPlatformMetaSignature } from "@/lib/channels/meta/webhook-signature";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { processInboundEvent } from "@/lib/channels/inbound";
import { FacebookMessengerAdapter } from "@/lib/channels/providers/facebook/adapter";
import {
  getFacebookInstallationByPageId,
  loadFacebookCredentials,
} from "@/lib/channels/providers/facebook/installations";
import { facebookWebhookSchema } from "@/lib/channels/providers/facebook/schemas";
import { verifyMetaWebhookChallenge } from "@/lib/channels/meta/webhook-verify";
import { FACEBOOK_MESSENGER_PROVIDER } from "@/lib/channels/providers/facebook/adapter";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";

/**
 * GET — Meta webhook verification challenge for Facebook Page.
 * Accepts platform META_WEBHOOK_VERIFY_TOKEN or per-installation tokens.
 */
export async function GET(request: Request) {
  try {
    const rl = checkRateLimit({
      key: "fb:webhook:get",
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
      .where(eq(channelInstallations.provider, FACEBOOK_MESSENGER_PROVIDER));

    for (const installation of installations) {
      if (installation.status !== "ACTIVE") continue;
      try {
        const creds = loadFacebookCredentials(installation);
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
      key: "fb:webhook:post",
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

    let pageId: string | null = null;
    try {
      const raw: unknown = JSON.parse(rawBody);
      const parsed = facebookWebhookSchema.safeParse(raw);
      if (parsed.success) {
        pageId = parsed.data.entry[0]?.id ?? null;
      }
    } catch {
      return new NextResponse("Bad Request", { status: 400 });
    }

    if (!pageId) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const installation = await getFacebookInstallationByPageId(pageId);
    if (!installation) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const credentials = loadFacebookCredentials(installation);
    const adapter = new FacebookMessengerAdapter(credentials);
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
