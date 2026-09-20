CREATE TABLE IF NOT EXISTS "web_chat_message_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_message_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_chat_visitors" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "web_chat_visitors" SET "expires_at" = "created_at" + interval '30 days' WHERE "expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "web_chat_visitors" ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "web_chat_message_idempotency" DROP CONSTRAINT IF EXISTS "web_chat_message_idempotency_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "web_chat_message_idempotency" ADD CONSTRAINT "web_chat_message_idempotency_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "web_chat_message_idempotency" DROP CONSTRAINT IF EXISTS "web_chat_msg_idem_conversation_org_fk";
--> statement-breakpoint
ALTER TABLE "web_chat_message_idempotency" ADD CONSTRAINT "web_chat_msg_idem_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "web_chat_msg_idem_conv_client_unique" ON "web_chat_message_idempotency" USING btree ("conversation_id","client_message_id");
