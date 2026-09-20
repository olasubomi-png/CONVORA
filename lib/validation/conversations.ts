import { z } from "zod";

export const createCustomerSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const createConversationSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  subject: z.string().trim().max(300).optional().nullable(),
  channel: z
    .enum(["WEB", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "EMAIL", "SMS", "OTHER"])
    .optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
  initialMessage: z.string().trim().max(10000).optional().nullable(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export const statusSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]),
});

export const prioritySchema = z.object({
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]),
});

export const assignSchema = z.object({
  membershipId: z.string().uuid(),
});

export const tagSchema = z.object({
  tagId: z.string().uuid(),
});

export const createTagSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});
