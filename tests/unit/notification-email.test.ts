import { describe, expect, it } from "vitest";
import {
  buildNotificationEmailHtml,
  buildNotificationEmailSubject,
  escapeHtml,
} from "@/lib/notifications/email";

describe("notification email content", () => {
  it("builds single-message subject", () => {
    expect(
      buildNotificationEmailSubject({
        customerName: "John Ade",
        channel: "Web Chat",
        messageCount: 1,
      }),
    ).toBe("John Ade messaged you on Web Chat");
  });

  it("builds multi-message subject", () => {
    expect(
      buildNotificationEmailSubject({
        customerName: "John Ade",
        channel: "WhatsApp",
        messageCount: 3,
      }),
    ).toBe("John Ade sent 3 messages on WhatsApp");
  });

  it("escapes HTML in customer name and preview", () => {
    const html = buildNotificationEmailHtml({
      to: "agent@example.com",
      customerName: 'A <script>alert(1)</script>',
      channel: "WEB",
      preview: 'Hello "world" & friends',
      conversationUrl: "https://app.example.com/app/inbox?c=1",
      messageCount: 1,
    });
    expect(html).toContain("CONVORA");
    expect(html).toContain("New customer message");
    expect(html).toContain("Open conversation");
    expect(html).toContain("https://app.example.com/app/inbox?c=1");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("includes merged message count line", () => {
    const html = buildNotificationEmailHtml({
      to: "agent@example.com",
      customerName: "Sam",
      channel: "WEB",
      preview: "Hi",
      conversationUrl: "https://app.example.com/app/inbox",
      messageCount: 4,
    });
    expect(html).toContain("4 new messages in this conversation");
  });

  it("escapeHtml covers basic entities", () => {
    expect(escapeHtml(`a&b<c>"'`)).toBe("a&amp;b&lt;c&gt;&quot;&#39;");
  });
});
