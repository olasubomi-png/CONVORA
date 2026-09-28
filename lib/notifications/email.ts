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
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  }
}

/**
 * Send a single notification email via Resend when configured.
 * Returns false when skipped or failed — never throws for delivery failures.
 */
export async function sendNotificationEmail(
  payload: NotificationEmailPayload,
): Promise<boolean> {
  try {
    const env = getServerEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;

    const count = payload.messageCount && payload.messageCount > 1 ? payload.messageCount : 1;
    const subject =
      count > 1
        ? `${payload.customerName} sent ${count} messages on ${payload.channel}`
        : `${payload.customerName} messaged you on ${payload.channel}`;
    const countLine =
      count > 1
        ? `<p style="font-size:13px;color:#5c5c5c;margin:0 0 12px">${count} new messages in this conversation</p>`
        : "";
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#141414">
        <p style="font-size:16px;font-weight:600;margin:0 0 8px">${escapeHtml(payload.customerName)}</p>
        <p style="font-size:14px;color:#5c5c5c;margin:0 0 12px">${escapeHtml(payload.channel)} · CONVORA</p>
        ${countLine}
        <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escapeHtml(payload.preview)}</p>
        <a href="${escapeAttr(payload.conversationUrl)}"
           style="display:inline-block;background:#1f4e3d;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600">
          Open conversation
        </a>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
