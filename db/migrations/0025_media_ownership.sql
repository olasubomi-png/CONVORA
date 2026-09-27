-- Visitor ownership + single-use attachment binding for chat media
ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "created_by_visitor_id" uuid;
ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "consumed_by_message_id" uuid;

CREATE INDEX IF NOT EXISTS "media_assets_created_by_visitor_id_idx"
  ON "media_assets" ("created_by_visitor_id");

DO $$ BEGIN
  ALTER TABLE "media_assets"
    ADD CONSTRAINT "media_assets_created_by_visitor_id_fk"
    FOREIGN KEY ("created_by_visitor_id") REFERENCES "web_chat_visitors"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "media_assets"
    ADD CONSTRAINT "media_assets_consumed_by_message_id_fk"
    FOREIGN KEY ("consumed_by_message_id") REFERENCES "messages"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
