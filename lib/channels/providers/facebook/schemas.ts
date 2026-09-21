import { z } from "zod";

export const facebookCredentialsSchema = z.object({
  pageAccessToken: z.string().min(20).max(1000),
  appSecret: z.string().min(8).max(200),
  verifyToken: z.string().min(8).max(200),
  pageId: z.string().min(1).max(64),
});

export type FacebookCredentials = z.infer<typeof facebookCredentialsSchema>;

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
  postback: z
    .object({
      payload: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

export const facebookWebhookSchema = z.object({
  object: z.literal("page"),
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

export type FacebookWebhookPayload = z.infer<typeof facebookWebhookSchema>;
