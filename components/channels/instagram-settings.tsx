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

export function InstagramSettings({
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
      provider="meta_instagram"
      title="Instagram"
      description="Authorize an eligible Instagram professional account linked to a Facebook Page. Personal accounts are not supported by Meta messaging APIs."
      installations={installations}
      metaConfigured={metaConfigured}
      webhookUrl={webhookUrl}
    />
  );
}
