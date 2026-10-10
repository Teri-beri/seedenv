ALTER TABLE "Submission"
  ADD COLUMN "denial_review_pending" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "denial_requested_at" TIMESTAMP(3),
  ADD COLUMN "denial_resolved_at" TIMESTAMP(3),
  ADD COLUMN "denial_resolution" VARCHAR(1000),
  ADD COLUMN "denial_reviewer_id" TEXT;
