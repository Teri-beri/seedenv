ALTER TABLE "AppCampaign" ADD COLUMN "instructionRevision" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "CohortInstructionVersion" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "directions" JSONB NOT NULL,
  "editedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CohortInstructionVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CohortInstructionVersion_campaignId_revision_key" ON "CohortInstructionVersion"("campaignId", "revision");
ALTER TABLE "CohortInstructionVersion" ADD CONSTRAINT "CohortInstructionVersion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionApplication" ADD COLUMN "instructionVersionId" TEXT;
ALTER TABLE "Submission" ADD COLUMN "instructionVersionId" TEXT;
-- Existing work is anchored to the directions available at migration time.
INSERT INTO "CohortInstructionVersion" ("id", "campaignId", "revision", "directions", "editedById")
SELECT 'instructions_' || c."id", c."id", 1,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', t."id", 'stepNumber', t."stepNumber", 'instructionTitle', t."instructionTitle",
    'instructionDetail', t."instructionDetail", 'proofType', t."proofType", 'minimumRep', t."minimumRep"
  ) ORDER BY t."stepNumber") FROM "TaskInstruction" t WHERE t."campaignId" = c."id"), '[]'::jsonb),
  c."developerId"
FROM "AppCampaign" c
WHERE c."status" <> 'DRAFT';
UPDATE "MissionApplication" a SET "instructionVersionId" = v."id"
FROM "CohortInstructionVersion" v WHERE v."campaignId" = a."campaignId" AND a."status" IN ('ACCEPTED', 'STARTED');
UPDATE "Submission" s SET "instructionVersionId" = v."id"
FROM "CohortInstructionVersion" v WHERE v."campaignId" = s."campaignId";
ALTER TABLE "MissionApplication" ADD CONSTRAINT "MissionApplication_instructionVersionId_fkey" FOREIGN KEY ("instructionVersionId") REFERENCES "CohortInstructionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_instructionVersionId_fkey" FOREIGN KEY ("instructionVersionId") REFERENCES "CohortInstructionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
