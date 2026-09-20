import { z } from "zod";
import { normalizeSlug, isValidSlug } from "@/lib/orgs/slug";
import { validatePasswordPolicy } from "@/lib/auth/password";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const registerSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address.").transform(normalizeEmail),
  password: z.string().min(1, "Password is required.").superRefine((value, ctx) => {
    const policyError = validatePasswordPolicy(value);
    if (policyError) ctx.addIssue({ code: z.ZodIssueCode.custom, message: policyError });
  }),
  fullName: z.string().trim().min(1, "Full name is required.").max(120, "Full name is too long."),
});

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address.").transform(normalizeEmail),
  password: z.string().min(1, "Password is required."),
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Organization name must be at least 2 characters.").max(100, "Organization name is too long."),
  slug: z.string().trim().min(1, "Slug is required.").transform(normalizeSlug).refine(isValidSlug, {
    message: "Slug must be 2–48 characters, lowercase letters, numbers, and hyphens only. Reserved names are not allowed.",
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
