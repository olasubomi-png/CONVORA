CREATE TYPE "public"."agent_post_type" AS ENUM('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LINK');--> statement-breakpoint
CREATE TYPE "public"."agent_post_visibility" AS ENUM('DRAFT', 'PUBLIC', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "agent_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_profile_id" uuid NOT NULL,
	"type" "agent_post_type" DEFAULT 'TEXT' NOT NULL,
	"body" text NOT NULL,
	"media_url" text,
	"visibility" "agent_post_visibility" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"public_username" text NOT NULL,
	"display_name" text NOT NULL,
	"professional_title" text,
	"bio" text,
	"avatar_url" text,
	"location" text,
	"service_area" text,
	"years_experience" integer,
	"verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"visibility" "profile_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text,
	"logo_url" text,
	"banner_url" text,
	"description" text,
	"website_url" text,
	"public_email" text,
	"public_phone" text,
	"location" text,
	"service_area" text,
	"verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"visibility" "profile_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_posts" ADD CONSTRAINT "agent_posts_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_posts_profile_id_idx" ON "agent_posts" USING btree ("agent_profile_id");--> statement-breakpoint
CREATE INDEX "agent_posts_visibility_idx" ON "agent_posts" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profiles_membership_unique" ON "agent_profiles" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profiles_username_unique" ON "agent_profiles" USING btree ("public_username");--> statement-breakpoint
CREATE INDEX "agent_profiles_visibility_idx" ON "agent_profiles" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_profiles_org_unique" ON "organization_profiles" USING btree ("organization_id");