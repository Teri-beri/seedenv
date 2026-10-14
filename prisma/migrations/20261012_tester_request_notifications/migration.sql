ALTER TABLE "User"
ALTER COLUMN "notification_preferences"
SET DEFAULT '{"email_tester_requests":true,"email_tester_feedback":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb;

UPDATE "User"
SET "notification_preferences" = jsonb_set("notification_preferences", '{email_tester_requests}', 'true'::jsonb, true)
WHERE NOT ("notification_preferences" ? 'email_tester_requests');
