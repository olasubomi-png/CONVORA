CREATE TYPE "public"."automation_execution_status" AS ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
--> statement-breakpoint
CREATE TYPE "public"."automation_trigger_type" AS ENUM('conversation.created', 'conversation.message_received', 'conversation.message_sent', 'conversation.assigned', 'conversation.unassigned', 'conversation.status_changed', 'conversation.priority_changed', 'customer.created', 'customer.updated', 'customer.tag_added', 'customer.tag_removed');
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" "automation_trigger_type" NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "automation_rules_organization_id_idx" ON "automation_rules" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "automation_rules_org_trigger_idx" ON "automation_rules" USING btree ("organization_id","trigger_type","enabled");
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_rules_org_id_unique" ON "automation_rules" USING btree ("organization_id","id");
--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "automation_rule_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_rule_definitions_rule_unique" ON "automation_rule_definitions" USING btree ("rule_id");
--> statement-breakpoint
ALTER TABLE "automation_rule_definitions" ADD CONSTRAINT "automation_rule_definitions_rule_fk" FOREIGN KEY ("organization_id","rule_id") REFERENCES "public"."automation_rules"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "automation_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "automation_execution_status" DEFAULT 'PENDING' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"event_payload" jsonb,
	"result" jsonb,
	"failure_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_executions_idempotency_unique" ON "automation_executions" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "automation_executions_organization_id_idx" ON "automation_executions" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "automation_executions_rule_id_idx" ON "automation_executions" USING btree ("rule_id");
--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_rule_fk" FOREIGN KEY ("organization_id","rule_id") REFERENCES "public"."automation_rules"("organization_id","id") ON DELETE cascade ON UPDATE no action;
