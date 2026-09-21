import { z } from "zod";
import { resolveAnalyticsRange, type AnalyticsRange } from "@/lib/analytics/range";
import { ValidationError } from "@/lib/errors";

export const analyticsFilterSchema = z.object({
  organizationId: z.string().uuid(),
  preset: z
    .enum([
      "today",
      "yesterday",
      "last_7_days",
      "last_30_days",
      "last_90_days",
      "custom",
    ])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  channel: z
    .enum([
      "WEB",
      "WHATSAPP",
      "FACEBOOK",
      "INSTAGRAM",
      "EMAIL",
      "SMS",
      "OTHER",
    ])
    .optional(),
  status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
  agentMembershipId: z.string().uuid().optional(),
});

export type AnalyticsFilters = z.infer<typeof analyticsFilterSchema> & {
  range: AnalyticsRange;
};

export function parseAnalyticsFilters(
  raw: Record<string, string | null | undefined>,
): AnalyticsFilters {
  const parsed = analyticsFilterSchema.safeParse({
    organizationId: raw.organizationId,
    preset: raw.preset ?? undefined,
    from: raw.from ?? undefined,
    to: raw.to ?? undefined,
    channel: raw.channel ?? undefined,
    status: raw.status ?? undefined,
    priority: raw.priority ?? undefined,
    agentMembershipId: raw.agentMembershipId ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid analytics filters.",
    );
  }
  const range = resolveAnalyticsRange({
    preset: parsed.data.preset,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  return { ...parsed.data, range };
}
