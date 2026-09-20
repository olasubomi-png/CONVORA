import { z } from "zod";

export const createCustomerBodySchema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(200),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  internalSummary: z.string().trim().max(2000).optional().nullable(),
});

export const updateCustomerBodySchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  internalSummary: z.string().trim().max(2000).optional().nullable(),
});

export const customerNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export const customerTagBodySchema = z.object({
  tagId: z.string().uuid(),
});

export const customerAttributesBodySchema = z.object({
  values: z.record(z.unknown()),
});
