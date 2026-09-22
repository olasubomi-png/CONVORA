ALTER TABLE "web_chat_installations" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "web_chat_installations_org_default_unique"
  ON "web_chat_installations" ("organization_id")
  WHERE "is_default" = true;

WITH ranked AS (
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rn
  FROM web_chat_installations
)
UPDATE web_chat_installations w
SET is_default = true
FROM ranked r
WHERE w.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM web_chat_installations x
    WHERE x.organization_id = w.organization_id
      AND x.is_default = true
  );

INSERT INTO web_chat_installations (
  id, organization_id, public_key, name, status, allowed_origins, config, is_default, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  o.id,
  'wc_' || replace(gen_random_uuid()::text, '-', ''),
  'Profile Chat',
  'ACTIVE',
  '[]'::jsonb,
  jsonb_build_object(
    'displayName', o.name,
    'welcomeMessage', 'Hi! Send a message and we will get back to you here.',
    'headerText', o.name
  ),
  true,
  now(),
  now()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM web_chat_installations w
  WHERE w.organization_id = o.id AND w.is_default = true
);
