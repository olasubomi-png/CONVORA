import { z } from "zod";
import { normalizeUsername, isValidUsername } from "@/lib/profiles/username";

export const agentProfileSchema = z.object({
  publicUsername: z
    .string()
    .trim()
    .min(1)
    .transform(normalizeUsername)
    .refine(isValidUsername, {
      message:
        "Username must be 2–32 characters, lowercase letters, numbers, and hyphens only. Reserved names are not allowed.",
    }),
  displayName: z.string().trim().min(1).max(120),
  professionalTitle: z.string().trim().max(120).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable().or(z.literal("")),
  location: z.string().trim().max(200).optional().nullable(),
  serviceArea: z.string().trim().max(200).optional().nullable(),
  yearsExperience: z.coerce.number().int().min(0).max(80).optional().nullable(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
});

export const organizationProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(200).optional().nullable(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  bannerUrl: z.string().url().optional().nullable().or(z.literal("")),
  description: z.string().trim().max(4000).optional().nullable(),
  websiteUrl: z.string().url().optional().nullable().or(z.literal("")),
  publicEmail: z.string().email().optional().nullable().or(z.literal("")),
  publicPhone: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  serviceArea: z.string().trim().max(200).optional().nullable(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
});

export const agentPostSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  type: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LINK"]).default("TEXT"),
  mediaUrl: z.string().url().optional().nullable().or(z.literal("")),
  visibility: z.enum(["DRAFT", "PUBLIC", "ARCHIVED"]).optional(),
});

export const verificationUpdateSchema = z.object({
  status: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "SUSPENDED"]),
});
