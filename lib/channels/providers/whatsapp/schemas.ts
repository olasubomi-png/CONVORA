import { z } from "zod";

/** Bounded WhatsApp Cloud API webhook payload validation. */
export const whatsappTextMessageSchema = z.object({
  from: z.string().min(1).max(40),
  id: z.string().min(1).max(128),
  timestamp: z.string().min(1).max(32),
  type: z.literal("text"),
  text: z.object({ body: z.string().max(4096) }),
});

export const whatsappMediaMessageSchema = z.object({
  from: z.string().min(1).max(40),
  id: z.string().min(1).max(128),
  timestamp: z.string().min(1).max(32),
  type: z.enum(["image", "document", "audio", "video", "sticker"]),
  image: z.object({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
  document: z.object({ id: z.string().optional(), mime_type: z.string().optional(), filename: z.string().optional() }).optional(),
  audio: z.object({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
  video: z.object({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
  sticker: z.object({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
});

export const whatsappUnsupportedMessageSchema = z.object({
  from: z.string().min(1).max(40),
  id: z.string().min(1).max(128),
  timestamp: z.string().min(1).max(32),
  type: z.string().max(40),
});

export const whatsappChangeValueSchema = z.object({
  messaging_product: z.string().optional(),
  metadata: z
    .object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().min(1).max(64),
    })
    .optional(),
  contacts: z
    .array(
      z.object({
        wa_id: z.string().optional(),
        profile: z.object({ name: z.string().optional() }).optional(),
      }),
    )
    .max(20)
    .optional(),
  messages: z.array(z.unknown()).max(50).optional(),
  statuses: z.array(z.unknown()).max(50).optional(),
});

export const whatsappWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: whatsappChangeValueSchema,
            }),
          )
          .max(20),
      }),
    )
    .max(20),
});

export type WhatsAppWebhook = z.infer<typeof whatsappWebhookSchema>;

export const whatsappCredentialsSchema = z.object({
  accessToken: z.string().min(10).max(500),
  appSecret: z.string().min(8).max(200),
  verifyToken: z.string().min(8).max(200),
  phoneNumberId: z.string().min(1).max(64),
  businessAccountId: z.string().max(64).optional(),
});

export type WhatsAppCredentials = z.infer<typeof whatsappCredentialsSchema>;
