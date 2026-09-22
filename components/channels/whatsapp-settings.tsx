"use client";

import { MetaConnectPanel } from "@/components/channels/meta-connect-panel";

type Installation = {
  id: string;
  displayName: string;
  status: string;
  publicConfig: Record<string, unknown>;
  provider: string;
  channel: string;
};

export function WhatsAppSettings({
  organizationId,
  installations,
  webhookUrl,
  metaConnectAvailable = false,
}: {
  organizationId: string;
  installations: Installation[];
  webhookUrl: string;
  metaConnectAvailable?: boolean;
}) {
  return (
    <MetaConnectPanel
      organizationId={organizationId}
      provider="whatsapp_cloud"
      title="WhatsApp"
      description="Authorize your WhatsApp Business account through Meta. CONVORA manages delivery and webhooks. Conversations appear in your shared inbox."
      installations={installations}
      metaConfigured={metaConnectAvailable}
      webhookUrl={webhookUrl}
    />
  );
}
