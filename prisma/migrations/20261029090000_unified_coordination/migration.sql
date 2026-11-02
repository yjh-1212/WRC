ALTER TABLE "ProvinceMatter" ADD COLUMN "template" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "ProvinceMatter" ADD COLUMN "leadWorkspaceId" TEXT;
ALTER TABLE "ProvinceMatter" ADD COLUMN "checklistJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProvinceMatter" ADD COLUMN "relatedType" TEXT;
ALTER TABLE "ProvinceMatter" ADD COLUMN "relatedId" TEXT;
ALTER TABLE "ProvinceAssignment" ADD COLUMN "reportJson" TEXT;
CREATE INDEX "ProvinceMatter_template_status_idx" ON "ProvinceMatter"("template", "status");
CREATE INDEX "ProvinceMatter_relatedType_relatedId_idx" ON "ProvinceMatter"("relatedType", "relatedId");
