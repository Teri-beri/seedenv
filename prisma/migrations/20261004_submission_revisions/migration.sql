ALTER TABLE "Submission"
  ADD COLUMN "revisionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "revisionStartedAt" TIMESTAMP(3);

UPDATE "Submission"
SET "revisionRequestedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING' AND "rejectionReason" LIKE 'Revision requested:%';
