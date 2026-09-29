-- Agent WhatsApp notification channel
ALTER TYPE "public"."notification_delivery_channel" ADD VALUE IF NOT EXISTS 'WHATSAPP';

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "whatsapp_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "whatsapp_phone_e164" text;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "whatsapp_digest_seconds" integer DEFAULT 120 NOT NULL;
