import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  customerAttributeDefinitions,
  customerAttributeValues,
  type CustomerAttributeType,
} from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";
import { getActiveMembership } from "@/lib/authz/membership";
import { recordAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { isAdminRole } from "@/lib/authz/roles";
import { parseInput, z } from "@/lib/validation";

const MAX_OPTIONS = 50;
const MAX_OPTION_LEN = 80;
const MAX_KEY_LEN = 64;
const MAX_LABEL_LEN = 120;

export const attributeDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(MAX_KEY_LEN)
    .transform((k) => k.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
    .refine((k) => /^[a-z][a-z0-9_]*$/.test(k), {
      message: "Key must start with a letter and use a-z, 0-9, underscore.",
    }),
  label: z.string().trim().min(1).max(MAX_LABEL_LEN),
  type: z.enum(["TEXT", "NUMBER", "BOOLEAN", "DATE", "SELECT"]),
  options: z.array(z.string().trim().min(1).max(MAX_OPTION_LEN)).max(MAX_OPTIONS).optional(),
});

const RESERVED_KEYS = new Set([
  "id",
  "email",
  "phone",
  "name",
  "organization",
  "organization_id",
  "status",
]);

export function serializeAttributeValue(
  type: CustomerAttributeType,
  value: unknown,
  options: string[] = [],
): {
  valueText: string | null;
  valueNumber: string | null;
  valueBoolean: string | null;
  valueDate: Date | null;
} {
  if (value === null || value === undefined || value === "") {
    return {
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      valueDate: null,
    };
  }

  switch (type) {
    case "TEXT":
      return {
        valueText: String(value).slice(0, 2000),
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
      };
    case "SELECT": {
      const s = String(value).trim();
      if (!options.includes(s)) {
        throw new ValidationError("Invalid option for SELECT attribute.");
      }
      return {
        valueText: s,
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
      };
    }
    case "NUMBER": {
      if (typeof value !== "number" && typeof value !== "string") {
        throw new ValidationError("Invalid number attribute value.");
      }
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        throw new ValidationError("Invalid number attribute value.");
      }
      return {
        valueText: null,
        valueNumber: String(n),
        valueBoolean: null,
        valueDate: null,
      };
    }
    case "BOOLEAN": {
      // Accept only explicit booleans or the strings "true" / "false"
      if (value === true || value === "true") {
        return {
          valueText: null,
          valueNumber: null,
          valueBoolean: "true",
          valueDate: null,
        };
      }
      if (value === false || value === "false") {
        return {
          valueText: null,
          valueNumber: null,
          valueBoolean: "false",
          valueDate: null,
        };
      }
      throw new ValidationError(
        'Boolean attribute must be true, false, "true", or "false".',
      );
    }
    case "DATE": {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) {
        throw new ValidationError("Invalid date attribute value.");
      }
      return {
        valueText: null,
        valueNumber: null,
        valueBoolean: null,
        valueDate: d,
      };
    }
    default:
      throw new ValidationError("Unsupported attribute type.");
  }
}

export async function listAttributeDefinitions(
  actorUserId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const db = getDatabase();
  return db
    .select()
    .from(customerAttributeDefinitions)
    .where(eq(customerAttributeDefinitions.organizationId, organizationId));
}

export async function createAttributeDefinition(
  actorUserId: string,
  organizationId: string,
  input: unknown,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can define custom attributes.",
    );
  }

  const data = parseInput(attributeDefinitionSchema, input);
  if (RESERVED_KEYS.has(data.key)) {
    throw new ValidationError("This attribute key is reserved.");
  }

  let options: string[] = [];
  if (data.type === "SELECT") {
    const raw = data.options ?? [];
    if (raw.length === 0) {
      throw new ValidationError("SELECT attributes require options.");
    }
    const normalized = raw.map((o) => o.trim()).filter(Boolean);
    const unique = [...new Set(normalized)];
    if (unique.length !== normalized.length) {
      throw new ValidationError("Duplicate SELECT options are not allowed.");
    }
    options = unique;
  } else if (data.options && data.options.length > 0) {
    throw new ValidationError(
      "Options are only allowed for SELECT attributes.",
    );
  }

  const db = getDatabase();
  const [def] = await db
    .insert(customerAttributeDefinitions)
    .values({
      organizationId,
      key: data.key,
      label: data.label,
      type: data.type,
      options,
    })
    .returning();
  if (!def) throw new Error("Failed to create attribute definition");
  return def;
}

export async function setCustomerAttributes(
  actorUserId: string,
  customerId: string,
  values: Record<string, unknown>,
) {
  const { customer } = await requireOrgCustomer(actorUserId, customerId);
  if (customer.status !== "ACTIVE") {
    throw new ValidationError("Cannot update attributes on a merged customer.");
  }

  const db = getDatabase();
  const defs = await db
    .select()
    .from(customerAttributeDefinitions)
    .where(
      eq(
        customerAttributeDefinitions.organizationId,
        customer.organizationId,
      ),
    );
  const byKey = new Map(defs.map((d) => [d.key, d]));

  return db.transaction(async (tx) => {
    for (const [key, raw] of Object.entries(values)) {
      const def = byKey.get(key);
      if (!def) {
        // Non-disclosure for unknown / cross-tenant definition keys
        throw new NotFoundError(`Unknown attribute: ${key}`);
      }
      if (def.organizationId !== customer.organizationId) {
        throw new NotFoundError(`Unknown attribute: ${key}`);
      }
      const serialized = serializeAttributeValue(def.type, raw, def.options);
      await tx
        .insert(customerAttributeValues)
        .values({
          customerId,
          definitionId: def.id,
          ...serialized,
        })
        .onConflictDoUpdate({
          target: [
            customerAttributeValues.customerId,
            customerAttributeValues.definitionId,
          ],
          set: { ...serialized, updatedAt: new Date() },
        });
    }

    await recordAuditEvent(
      {
        eventType: "CUSTOMER_ATTRIBUTES_UPDATED",
        actorUserId,
        organizationId: customer.organizationId,
        payload: { customerId, keys: Object.keys(values) },
      },
      tx,
    );
  });
}

export async function getCustomerAttributes(
  actorUserId: string,
  customerId: string,
) {
  const { customer } = await requireOrgCustomer(actorUserId, customerId);
  const db = getDatabase();
  const defs = await db
    .select()
    .from(customerAttributeDefinitions)
    .where(
      eq(
        customerAttributeDefinitions.organizationId,
        customer.organizationId,
      ),
    );
  const vals = await db
    .select()
    .from(customerAttributeValues)
    .where(eq(customerAttributeValues.customerId, customerId));
  const valByDef = new Map(vals.map((v) => [v.definitionId, v]));

  return defs.map((d) => {
    const v = valByDef.get(d.id);
    let value: string | number | boolean | null = null;
    if (v) {
      if (d.type === "TEXT" || d.type === "SELECT") value = v.valueText;
      else if (d.type === "NUMBER") {
        value = v.valueNumber != null ? Number(v.valueNumber) : null;
      } else if (d.type === "BOOLEAN") {
        value = v.valueBoolean === "true" ? true : v.valueBoolean === "false" ? false : null;
      } else if (d.type === "DATE") {
        value = v.valueDate ? v.valueDate.toISOString() : null;
      }
    }
    return {
      key: d.key,
      label: d.label,
      type: d.type,
      options: d.options,
      value,
    };
  });
}
