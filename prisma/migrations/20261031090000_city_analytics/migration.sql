-- Additive migration: preserve existing evaluations, credit entries and reports.
ALTER TABLE "EvaluationTask" ADD COLUMN "rulesVersion" TEXT;
ALTER TABLE "EvaluationTask" ADD COLUMN "rulesSnapshotJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "qualityJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "evidenceJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "historyJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "reviewedByName" TEXT;
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "reviewComment" TEXT;
ALTER TABLE "EnterpriseEvaluation" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CreditEntry" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "CreditEntry" ADD COLUMN "ruleSnapshotJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CreditEntry" ADD COLUMN "historyJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CreditEntry" ADD COLUMN "repairNote" TEXT;
ALTER TABLE "CreditEntry" ADD COLUMN "repairedBy" TEXT;
ALTER TABLE "CreditEntry" ADD COLUMN "repairMaterialsJson" TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX "CreditEntry_sourceKey_key" ON "CreditEntry"("sourceKey");
