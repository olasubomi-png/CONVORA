CREATE TABLE "domain_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"event_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_outbox_event_key_unique" ON "domain_event_outbox" USING btree ("organization_id","event_key");
--> statement-breakpoint
CREATE INDEX "domain_event_outbox_unprocessed_idx" ON "domain_event_outbox" USING btree ("processed_at","created_at");
