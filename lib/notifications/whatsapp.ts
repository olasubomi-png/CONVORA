import { WhatsAppCloudClient } from "@/lib/channels/providers/whatsapp/client";
import { ConfigurationError, ValidationError } from "@/lib/errors";

/**
 * Platform-level WhatsApp Cloud API config for *agent* notification alerts.
 * Separate from per-organization customer-channel WhatsApp installations.
 *
 * Required env:
 * - WHATSAPP_NOTIFICATIONS_ACCESS_TOKEN
 * - WHATSAPP_NOTIFICATIONS_PHONE_NUMBER_ID
 * - WHATSAPP_NOTIFICATION_TEMPLATE_NAME
 * - WHATSAPP_NOTIFICATION_TEMPLATE_LANG (default: en)
 *
 * Meta requires an approved message template for business-initiated messages
 * outside the 24-hour customer-care window. Agent alerts are business-initiated.
 *
 * Suggested template (approve in Meta Business Manager):
 *   Name: convora_agent_alert
 *   Language: en
 *   Body:
 *     CONVORA — New customer message
 *     Customer: {{1}}
 *     Channel: {{2}}
 *     "{{3}}"
 *     {{4}} new message(s). Open: {{5}}
 */
export type WhatsAppNotificationConfig = {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
};

export function getWhatsAppNotificationConfig(): WhatsAppNotificationConfig | null {
  const accessToken =
    process.env.WHATSAPP_NOTIFICATIONS_ACCESS_TOKEN?.trim() || "";
  const phoneNumberId =
    process.env.WHATSAPP_NOTIFICATIONS_PHONE_NUMBER_ID?.trim() || "";
  const templateName =
    process.env.WHATSAPP_NOTIFICATION_TEMPLATE_NAME?.trim() || "";
  const templateLanguage =
    process.env.WHATSAPP_NOTIFICATION_TEMPLATE_LANG?.trim() || "en";

  if (!accessToken || !phoneNumberId || !templateName) {
    return null;
  }
  return {
    accessToken,
    phoneNumberId,
    templateName,
    templateLanguage,
  };
}

export function isWhatsAppNotificationsConfigured(): boolean {
  return getWhatsAppNotificationConfig() !== null;
}

/** E.164: + followed by 7–15 digits, first digit 1–9. */
export function normalizeE164Phone(input: string): string {
  const trimmed = input.trim().replace(/[\s\-()]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) {
    throw new ValidationError(
      "Enter a valid WhatsApp number in E.164 format (e.g. +2348012345678).",
    );
  }
  return trimmed;
}

export type SendWhatsAppNotificationInput = {
  to: string;
  customerName: string;
  organizationName?: string;
  channelLabel: string;
  preview: string;
  conversationUrl: string;
  messageCount: number;
};

/**
 * Send an agent alert via WhatsApp Cloud API template.
 * Never logs tokens. Throws AppError on provider failure for worker retry.
 */
export async function sendWhatsAppNotification(
  input: SendWhatsAppNotificationInput,
): Promise<{ messageId: string }> {
  const config = getWhatsAppNotificationConfig();
  if (!config) {
    throw new ConfigurationError(
      "WhatsApp agent notifications are not configured. Set WHATSAPP_NOTIFICATIONS_ACCESS_TOKEN, WHATSAPP_NOTIFICATIONS_PHONE_NUMBER_ID, and WHATSAPP_NOTIFICATION_TEMPLATE_NAME.",
    );
  }

  const to = normalizeE164Phone(input.to);
  const client = new WhatsAppCloudClient(
    config.accessToken,
    config.phoneNumberId,
  );

  const preview = input.preview.trim().slice(0, 120) || "New message";
  const countLabel =
    input.messageCount > 1
      ? `${input.messageCount} new messages`
      : "1 new message";

  // Template body params: {{1}} customer, {{2}} channel, {{3}} preview, {{4}} count, {{5}} url
  return client.sendTemplate({
    to,
    templateName: config.templateName,
    languageCode: config.templateLanguage,
    bodyParameters: [
      input.customerName.slice(0, 60),
      input.channelLabel.slice(0, 40),
      preview,
      countLabel,
      input.conversationUrl.slice(0, 200),
    ],
  });
}
