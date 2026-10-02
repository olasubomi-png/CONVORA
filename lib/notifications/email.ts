import { getServerEnv } from "@/lib/env";

export type NotificationEmailPayload = {
  to: string;
  customerName: string;
  organizationName?: string;
  channel: string;
  preview: string;
  conversationUrl: string;
  messageCount?: number;
};

export function isEmailConfigured(): boolean {
  try {
    const env = getServerEnv();
    return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  } catch {
    return Boolean(
      process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim(),
    );
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

export function buildNotificationEmailSubject(
  payload: Pick<
    NotificationEmailPayload,
    "customerName" | "channel" | "messageCount"
  >,
): string {
  const count =
    payload.messageCount && payload.messageCount > 1
      ? payload.messageCount
      : 1;
  if (count > 1) {
    return `${payload.customerName} sent ${count} messages on ${payload.channel}`;
  }
  return `${payload.customerName} messaged you on ${payload.channel}`;
}

/**
 * Build branded HTML for agent notification emails.
 * All dynamic fields are HTML-escaped.
 */
export function buildNotificationEmailHtml(
  payload: NotificationEmailPayload,
): string {
  const count =
    payload.messageCount && payload.messageCount > 1
      ? payload.messageCount
      : 1;
  const customer = escapeHtml(payload.customerName || "Customer");
  const channel = escapeHtml(payload.channel || "WEB");
  const preview = escapeHtml(payload.preview || "New message");
  const org = payload.organizationName
    ? escapeHtml(payload.organizationName)
    : null;
  const url = escapeAttr(payload.conversationUrl || "#");
  const countLine =
    count > 1
      ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5c5c5c;">${count} new messages in this conversation</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CONVORA</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px 12px;border-bottom:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.14em;color:#141414;">CONVORA</p>
              ${org ? `<p style="margin:6px 0 0;font-size:12px;color:#71717a;">${org}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#1f4e3d;">New customer message</p>
              <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#141414;line-height:1.35;">Customer: ${customer}</p>
              <p style="margin:0 0 16px;font-size:14px;color:#5c5c5c;">Channel: ${channel}</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#141414;border-left:3px solid #e4e4e7;padding-left:12px;">&ldquo;${preview}&rdquo;</p>
              ${countLine}
              <a href="${url}"
                 style="display:inline-block;background:#1f4e3d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;">
                Open conversation
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 20px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">
                You received this because email notifications are enabled on your CONVORA account.
                Manage preferences in Settings → Notifications.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a single notification email via Resend when configured.
 * Returns false when skipped or provider rejects — never throws for transport failures.
 * Never logs API keys.
 */
export async function sendNotificationEmail(
  payload: NotificationEmailPayload,
): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;

    let apiKey: string | undefined;
    let from: string | undefined;
    try {
      const env = getServerEnv();
      apiKey = env.RESEND_API_KEY;
      from = env.EMAIL_FROM;
    } catch {
      apiKey = process.env.RESEND_API_KEY?.trim();
      from = process.env.EMAIL_FROM?.trim();
    }
    if (!apiKey || !from) return false;

    const subject = buildNotificationEmailSubject(payload);
    const html = buildNotificationEmailHtml(payload);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
