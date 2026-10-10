ALTER TABLE "User"
  ADD COLUMN "launch_wizard_drafts" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "launch_wizard_draft_revision" INTEGER NOT NULL DEFAULT 0;
