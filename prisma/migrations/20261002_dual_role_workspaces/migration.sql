ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tester_workspace_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "developer_workspace_enabled" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "User"
SET "tester_workspace_enabled" = TRUE
WHERE "role" = 'TESTER' AND "tester_workspace_enabled" = FALSE;

UPDATE "User"
SET "developer_workspace_enabled" = TRUE
WHERE "role" = 'DEVELOPER' AND "developer_workspace_enabled" = FALSE;