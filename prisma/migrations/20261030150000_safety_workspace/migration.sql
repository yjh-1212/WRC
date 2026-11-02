ALTER TABLE "RegulatoryInspection" ADD COLUMN "materialsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RegulatoryInspection" ADD COLUMN "historyJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RegulatoryInspection" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SafetyAlert" ADD COLUMN "attachmentJson" TEXT;
ALTER TABLE "Accident" ADD COLUMN "determinationJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "EmergencyTask" ADD COLUMN "activeKey" TEXT;
ALTER TABLE "EmergencyTask" ADD COLUMN "responsibleName" TEXT;
CREATE UNIQUE INDEX "EmergencyTask_activeKey_key" ON "EmergencyTask"("activeKey");

CREATE TABLE "SafetyEvidenceRevision" (
 "id" TEXT NOT NULL PRIMARY KEY,"eventType" TEXT NOT NULL,"eventId" TEXT NOT NULL,"version" INTEGER NOT NULL,
 "vehicleId" TEXT,"enterpriseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"occurredAt" DATETIME NOT NULL,
 "windowFrom" DATETIME NOT NULL,"windowTo" DATETIME NOT NULL,"state" TEXT NOT NULL,"snapshotJson" TEXT NOT NULL,
 "sha256" TEXT NOT NULL,"reason" TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SafetyEvidenceRevision_eventType_eventId_version_key" ON "SafetyEvidenceRevision"("eventType","eventId","version");
CREATE INDEX "SafetyEvidenceRevision_organizationId_createdAt_idx" ON "SafetyEvidenceRevision"("organizationId","createdAt");
CREATE INDEX "SafetyEvidenceRevision_enterpriseId_createdAt_idx" ON "SafetyEvidenceRevision"("enterpriseId","createdAt");

CREATE TABLE "SafetyMaterial" (
 "id" TEXT NOT NULL PRIMARY KEY,"enterpriseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"name" TEXT NOT NULL,"mimeType" TEXT NOT NULL,
 "size" INTEGER NOT NULL,"sha256" TEXT NOT NULL,"uploadedById" TEXT NOT NULL,"uploadedByName" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SafetyMaterial_organizationId_createdAt_idx" ON "SafetyMaterial"("organizationId","createdAt");
CREATE INDEX "SafetyMaterial_enterpriseId_createdAt_idx" ON "SafetyMaterial"("enterpriseId","createdAt");

CREATE TABLE "InspectionIssue" (
 "id" TEXT NOT NULL PRIMARY KEY,"inspectionId" TEXT NOT NULL,"enterpriseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"sequence" INTEGER NOT NULL,
 "title" TEXT NOT NULL,"requirement" TEXT NOT NULL,"responsibleName" TEXT NOT NULL,"dueAt" DATETIME NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InspectionIssue_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "RegulatoryInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InspectionIssue_inspectionId_sequence_key" ON "InspectionIssue"("inspectionId","sequence");
CREATE INDEX "InspectionIssue_organizationId_createdAt_idx" ON "InspectionIssue"("organizationId","createdAt");
CREATE INDEX "InspectionIssue_enterpriseId_createdAt_idx" ON "InspectionIssue"("enterpriseId","createdAt");

CREATE TABLE "SafetyRectificationTask" (
 "id" TEXT NOT NULL PRIMARY KEY,"businessNo" TEXT NOT NULL,"enterpriseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,
 "sourceType" TEXT NOT NULL,"sourceId" TEXT NOT NULL,"inspectionIssueId" TEXT,"activeKey" TEXT,"title" TEXT NOT NULL,"requirement" TEXT NOT NULL,
 "responsibleName" TEXT NOT NULL,"dueAt" DATETIME NOT NULL,"status" TEXT NOT NULL DEFAULT 'WAITING_RESPONSE',"respondedAt" DATETIME,
 "feedback" TEXT,"materialsJson" TEXT NOT NULL DEFAULT '[]',"reviewComment" TEXT,"historyJson" TEXT NOT NULL DEFAULT '[]',"version" INTEGER NOT NULL DEFAULT 1,
 "closedAt" DATETIME,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,
 CONSTRAINT "SafetyRectificationTask_inspectionIssueId_fkey" FOREIGN KEY ("inspectionIssueId") REFERENCES "InspectionIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SafetyRectificationTask_businessNo_key" ON "SafetyRectificationTask"("businessNo");
CREATE UNIQUE INDEX "SafetyRectificationTask_inspectionIssueId_key" ON "SafetyRectificationTask"("inspectionIssueId");
CREATE UNIQUE INDEX "SafetyRectificationTask_activeKey_key" ON "SafetyRectificationTask"("activeKey");
CREATE INDEX "SafetyRectificationTask_organizationId_status_dueAt_idx" ON "SafetyRectificationTask"("organizationId","status","dueAt");
CREATE INDEX "SafetyRectificationTask_enterpriseId_status_dueAt_idx" ON "SafetyRectificationTask"("enterpriseId","status","dueAt");
CREATE INDEX "SafetyRectificationTask_sourceType_sourceId_idx" ON "SafetyRectificationTask"("sourceType","sourceId");
