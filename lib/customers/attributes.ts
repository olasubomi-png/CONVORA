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
  input: {
    key: string;
    label: string;
    type: CustomerAttributeType;
    options?: string[];
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can define custom attributes.",
    );
  }

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!key || key.length > 64) {
    throw new ValidationError("Invalid attribute key.");
  }

  const db = getDatabase();
  const [def] = await db
    .insert(customerAttributeDefinitions)
    .values({
      organizationId,
      key,
      label: input.label.trim(),
      type: input.type,
      options: input.type === "SELECT" ? (input.options ?? []) : [],
    })
    .returning();
  if (!def) throw new Error("Failed to create attribute definition");
  return def;
}

function serializeValue(
  type: CustomerAttributeType,
  value: unknown,
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
    case "SELECT":
      return {
        valueText: String(value).slice(0, 2000),
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
      };
    case "NUMBER": {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new ValidationError("Invalid number attribute value.");
      }
      return {
        valueText: null,
        valueNumber: String(n),
        valueBoolean: null,
        valueDate: null,
      };
    }
    case "BOOLEAN":
      return {
        valueText: null,
        valueNumber: null,
        valueBoolean: value === true || value === "true" ? "true" : "false",
        valueDate: null,
      };
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

export async function setCustomerAttributes(
  actorUserId: string,
  customerId: string,
  values: Record<string, unknown>,
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
  const byKey = new Map(defs.map((d) => [d.key, d]));

  return db.transaction(async (tx) => {
    for (const [key, raw] of Object.entries(values)) {
      const def = byKey.get(key);
      if (!def) {
        throw new NotFoundError(`Unknown attribute: ${key}`);
      }
      if (
        def.type === "SELECT" &&
        raw != null &&
        raw !== "" &&
        !def.options.includes(String(raw))
      ) {
        throw new ValidationError(`Invalid option for ${key}.`);
      }
      const serialized = serializeValue(def.type, raw);
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
        value = v.valueBoolean === "true";
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
