CREATE TABLE IF NOT EXISTS "channel_oauth_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "state_hash" text NOT NULL,
  "user_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "channel_oauth_states_state_hash_unique"
  ON "channel_oauth_states" ("state_hash");

CREATE INDEX IF NOT EXISTS "channel_oauth_states_org_idx"
  ON "channel_oauth_states" ("organization_id");

CREATE INDEX IF NOT EXISTS "channel_oauth_states_expires_idx"
  ON "channel_oauth_states" ("expires_at");
