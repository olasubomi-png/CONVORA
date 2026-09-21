import { z } from "zod";

export const instagramCredentialsSchema = z.object({
  /** Page access token for the Page linked to the Instagram professional account */
  pageAccessToken: z.string().min(20).max(1000),
  appSecret: z.string().min(8).max(200),
  verifyToken: z.string().min(8).max(200),
  /** Instagram business / professional account ID used as webhook entry id */
  instagramAccountId: z.string().min(1).max(64),
  /** Linked Facebook Page ID (used for Graph send path when required) */
  pageId: z.string().min(1).max(64).optional(),
});

export type InstagramCredentials = z.infer<typeof instagramCredentialsSchema>;

const messagingEventSchema = z.object({
  sender: z.object({ id: z.string().min(1) }),
  recipient: z.object({ id: z.string().min(1) }),
  timestamp: z.union([z.number(), z.string()]).optional(),
  message: z
    .object({
      mid: z.string().min(1),
      text: z.string().optional(),
      attachments: z
        .array(
          z.object({
            type: z.string(),
            payload: z
              .object({
                url: z.string().optional(),
              })
              .passthrough()
              .optional(),
          }),
        )
        .optional(),
      is_echo: z.boolean().optional(),
    })
    .optional(),
});

export const instagramWebhookSchema = z.object({
  object: z.literal("instagram"),
  entry: z
    .array(
      z.object({
        id: z.string().min(1),
        time: z.number().optional(),
        messaging: z.array(messagingEventSchema).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type InstagramWebhookPayload = z.infer<typeof instagramWebhookSchema>;
