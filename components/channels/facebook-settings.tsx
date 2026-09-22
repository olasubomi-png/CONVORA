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

export function FacebookSettings({
  organizationId,
  installations,
  webhookUrl,
  metaConfigured = false,
}: {
  organizationId: string;
  installations: Installation[];
  webhookUrl: string;
  metaConfigured?: boolean;
}) {
  return (
    <MetaConnectPanel
      organizationId={organizationId}
      provider="meta_messenger"
      title="Facebook Messenger"
      description="Authorize a Facebook Page. Messenger conversations appear in your shared inbox. Customers keep using Facebook—they never need a CONVORA account."
      installations={installations}
      metaConfigured={metaConfigured}
      webhookUrl={webhookUrl}
    />
  );
}
