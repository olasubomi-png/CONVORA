CREATE TYPE "public"."agent_presence_status" AS ENUM('ONLINE', 'AWAY', 'OFFLINE');
--> statement-breakpoint
CREATE TYPE "public"."team_member_role" AS ENUM('MEMBER', 'LEAD');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_org_id_unique" ON "memberships" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_name_unique" ON "teams" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE INDEX "teams_organization_id_idx" ON "teams" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_id_unique" ON "teams" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE TABLE "agent_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"status" "agent_presence_status" DEFAULT 'OFFLINE' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_presence_membership_unique" ON "agent_presence" USING btree ("membership_id");
--> statement-breakpoint
CREATE INDEX "agent_presence_organization_id_idx" ON "agent_presence" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "agent_presence" ADD CONSTRAINT "agent_presence_membership_org_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" "team_member_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_team_member_unique" ON "team_memberships" USING btree ("team_id","membership_id");
--> statement-breakpoint
CREATE INDEX "team_memberships_organization_id_idx" ON "team_memberships" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "team_memberships_membership_id_idx" ON "team_memberships" USING btree ("membership_id");
--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_org_fk" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_membership_org_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "conversation_watchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_watchers_unique" ON "conversation_watchers" USING btree ("conversation_id","membership_id");
--> statement-breakpoint
CREATE INDEX "conversation_watchers_organization_id_idx" ON "conversation_watchers" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "conversation_watchers" ADD CONSTRAINT "conversation_watchers_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_watchers" ADD CONSTRAINT "conversation_watchers_membership_org_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "conversation_assignment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"actor_membership_id" uuid,
	"previous_membership_id" uuid,
	"new_membership_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_assignment_history_conversation_id_idx" ON "conversation_assignment_history" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "conversation_assignment_history_organization_id_idx" ON "conversation_assignment_history" USING btree ("organization_id");
