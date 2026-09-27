-- Media assets (filesystem or external key reference; never store secrets)
CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "kind" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "storage_key" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'private',
  "original_filename" text,
  "width" integer,
  "height" integer,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_storage_key_unique" ON "media_assets" ("storage_key");
CREATE INDEX IF NOT EXISTS "media_assets_organization_id_idx" ON "media_assets" ("organization_id");

-- Post likes
CREATE TABLE IF NOT EXISTS "agent_post_likes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_post_likes_post_user_unique" ON "agent_post_likes" ("post_id", "user_id");
CREATE INDEX IF NOT EXISTS "agent_post_likes_post_id_idx" ON "agent_post_likes" ("post_id");

-- Post comments
CREATE TABLE IF NOT EXISTS "agent_post_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "agent_post_comments_post_id_idx" ON "agent_post_comments" ("post_id");
CREATE INDEX IF NOT EXISTS "agent_post_comments_user_id_idx" ON "agent_post_comments" ("user_id");

-- Message attachments
CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "media_asset_id" uuid NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "message_attachments_message_id_idx" ON "message_attachments" ("message_id");
CREATE INDEX IF NOT EXISTS "message_attachments_organization_id_idx" ON "message_attachments" ("organization_id");

-- FKs (soft: only if parent tables exist)
DO $$ BEGIN
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_post_likes" ADD CONSTRAINT "agent_post_likes_post_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "agent_posts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_post_likes" ADD CONSTRAINT "agent_post_likes_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_post_comments" ADD CONSTRAINT "agent_post_comments_post_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "agent_posts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_post_comments" ADD CONSTRAINT "agent_post_comments_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fk"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_media_asset_id_fk"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow IMAGE message type
DO $$ BEGIN
  ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'IMAGE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
