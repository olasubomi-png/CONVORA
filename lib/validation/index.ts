import { z, type ZodType } from "zod";
import { ValidationError } from "@/lib/errors";

/**
 * Runtime validation boundary for untrusted input.
 *
 * Client input
 *   → Validation (this module)
 *   → Domain logic
 *   → Database
 *
 * TypeScript types are compile-time only. Never treat a typed object
 * as validated unless it passed through a schema at runtime.
 */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("Invalid input.", {
      details: { issues: result.error.issues },
    });
  }

  return result.data;
}

export function safeParseInput<T>(
  schema: ZodType<T>,
  input: unknown,
): { success: true; data: T } | { success: false; issues: z.ZodIssue[] } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { success: false, issues: result.error.issues };
  }
  return { success: true, data: result.data };
}

export { z };
