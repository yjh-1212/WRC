ALTER TABLE "Vehicle" ADD COLUMN "unifiedCode" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "unifiedCodeIssuedAt" DATETIME;
ALTER TABLE "Vehicle" ADD COLUMN "vehicleType" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "Vehicle" ADD COLUMN "operationScene" TEXT NOT NULL DEFAULT 'URBAN_DELIVERY';
ALTER TABLE "Vehicle" ADD COLUMN "upperEquipment" TEXT;
CREATE UNIQUE INDEX "Vehicle_unifiedCode_key" ON "Vehicle"("unifiedCode");

CREATE TABLE "SafetyOperator" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "idNumberMasked" TEXT NOT NULL,
  "phone" TEXT,
  "enterpriseId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "qualificationType" TEXT NOT NULL DEFAULT 'REMOTE_SAFETY_OPERATOR',
  "qualificationNo" TEXT,
  "trainingCompleted" BOOLEAN NOT NULL DEFAULT false,
  "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" DATETIME,
  "expiresAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewComment" TEXT,
  "shiftStart" TEXT,
  "shiftEnd" TEXT,
  "onDuty" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SafetyOperator_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SafetyOperator_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SafetyOperator_businessNo_key" ON "SafetyOperator"("businessNo");
CREATE INDEX "SafetyOperator_enterpriseId_status_idx" ON "SafetyOperator"("enterpriseId", "status");
CREATE INDEX "SafetyOperator_organizationId_status_idx" ON "SafetyOperator"("organizationId", "status");

CREATE TABLE "SafetyOperatorVehicle" (
  "operatorId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("operatorId", "vehicleId"),
  CONSTRAINT "SafetyOperatorVehicle_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SafetyOperator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SafetyOperatorVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SafetyOperatorVehicle_vehicleId_idx" ON "SafetyOperatorVehicle"("vehicleId");

CREATE TABLE "ExternalInterfaceConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enterpriseId" TEXT NOT NULL,
  "interfaceType" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "authType" TEXT NOT NULL DEFAULT 'SIGNATURE',
  "protocolVersion" TEXT NOT NULL DEFAULT '1.0',
  "contactName" TEXT,
  "contactPhone" TEXT,
  "capabilitiesJson" TEXT NOT NULL DEFAULT '[]',
  "environment" TEXT NOT NULL DEFAULT 'TEST',
  "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "lastTestAt" DATETIME,
  "lastTestResult" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ExternalInterfaceConfig_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalInterfaceConfig_businessNo_key" ON "ExternalInterfaceConfig"("businessNo");
CREATE INDEX "ExternalInterfaceConfig_enterpriseId_interfaceType_idx" ON "ExternalInterfaceConfig"("enterpriseId", "interfaceType");
CREATE INDEX "ExternalInterfaceConfig_status_idx" ON "ExternalInterfaceConfig"("status");

CREATE TABLE "RegulatoryInspection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessNo" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "inspectionType" TEXT NOT NULL DEFAULT 'ROUTINE',
  "enterpriseId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inspectorName" TEXT NOT NULL,
  "scheduledAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "result" TEXT,
  "issueCount" INTEGER NOT NULL DEFAULT 0,
  "rectificationDueAt" DATETIME,
  "rectification" TEXT,
  "reviewComment" TEXT,
  "closedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RegulatoryInspection_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RegulatoryInspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RegulatoryInspection_businessNo_key" ON "RegulatoryInspection"("businessNo");
CREATE INDEX "RegulatoryInspection_enterpriseId_status_scheduledAt_idx" ON "RegulatoryInspection"("enterpriseId", "status", "scheduledAt");
CREATE INDEX "RegulatoryInspection_organizationId_status_scheduledAt_idx" ON "RegulatoryInspection"("organizationId", "status", "scheduledAt");

CREATE TABLE "BusinessRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessNo" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "organizationId" TEXT NOT NULL,
  "valueJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "effectiveAt" DATETIME,
  "publishedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BusinessRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BusinessRule_businessNo_key" ON "BusinessRule"("businessNo");
CREATE UNIQUE INDEX "BusinessRule_organizationId_category_version_key" ON "BusinessRule"("organizationId", "category", "version");
CREATE INDEX "BusinessRule_category_status_idx" ON "BusinessRule"("category", "status");

CREATE TABLE "CreditAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessNo" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "enterpriseId" TEXT,
  "vehicleId" TEXT,
  "organizationId" TEXT NOT NULL,
  "initialScore" INTEGER NOT NULL DEFAULT 100,
  "currentScore" INTEGER NOT NULL DEFAULT 100,
  "grade" TEXT NOT NULL DEFAULT 'A',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CreditAccount_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CreditAccount_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CreditAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreditAccount_businessNo_key" ON "CreditAccount"("businessNo");
CREATE UNIQUE INDEX "CreditAccount_subjectType_enterpriseId_vehicleId_key" ON "CreditAccount"("subjectType", "enterpriseId", "vehicleId");
CREATE INDEX "CreditAccount_organizationId_grade_idx" ON "CreditAccount"("organizationId", "grade");

CREATE TABLE "CreditEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessNo" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "scoreChange" INTEGER NOT NULL,
  "scoreAfter" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "confirmedBy" TEXT,
  "confirmedAt" DATETIME,
  "repairEligibleAt" DATETIME,
  "repairedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CreditEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreditEntry_businessNo_key" ON "CreditEntry"("businessNo");
CREATE INDEX "CreditEntry_accountId_createdAt_idx" ON "CreditEntry"("accountId", "createdAt");
CREATE INDEX "CreditEntry_status_repairEligibleAt_idx" ON "CreditEntry"("status", "repairEligibleAt");

WITH ranked AS (
  SELECT "id", printf('330100-FV-%s-%05d-%d', strftime('%Y', 'now'), row_number() OVER (ORDER BY "createdAt", "id"), row_number() OVER (ORDER BY "createdAt", "id") % 10) AS code
  FROM "Vehicle"
)
UPDATE "Vehicle"
SET "unifiedCode" = (SELECT ranked.code FROM ranked WHERE ranked.id = "Vehicle"."id"),
    "unifiedCodeIssuedAt" = CURRENT_TIMESTAMP;

INSERT INTO "BusinessRule" ("id", "businessNo", "category", "name", "version", "organizationId", "valueJson", "status", "effectiveAt", "publishedBy", "createdAt", "updatedAt")
SELECT 'rule-accident-sla-' || "id", 'RULE-SLA-001', 'ACCIDENT_SLA', '事故与事件四级报告时限', 1, "id", '{"I":{"initialReportMinutes":10,"fullReportHours":24},"II":{"initialReportMinutes":30,"fullReportHours":24},"III":{"initialReportMinutes":60,"fullReportHours":48},"IV":{"initialReportMinutes":30,"fullReportHours":24}}', 'PUBLISHED', CURRENT_TIMESTAMP, '系统预置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" WHERE "code" = 'HZJT';

INSERT INTO "BusinessRule" ("id", "businessNo", "category", "name", "version", "organizationId", "valueJson", "status", "effectiveAt", "publishedBy", "createdAt", "updatedAt")
SELECT 'rule-credit-' || "id", 'RULE-CREDIT-001', 'CREDIT', '信用积分默认规则', 1, "id", '{"initialScore":100,"grades":{"A":[90,100],"B":[75,89],"C":[60,74],"D":[0,59]},"deductions":{"MINOR":-2,"GENERAL":-5,"SERIOUS":-10,"MAJOR":-20},"repairDays":{"MINOR":30,"GENERAL":90,"SERIOUS":180,"MAJOR":365}}', 'PUBLISHED', CURRENT_TIMESTAMP, '系统预置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" WHERE "code" = 'HZJT';

INSERT INTO "BusinessRule" ("id", "businessNo", "category", "name", "version", "organizationId", "valueJson", "status", "effectiveAt", "publishedBy", "createdAt", "updatedAt")
SELECT 'rule-retention-' || "id", 'RULE-RETENTION-001', 'RETENTION', '数据留存默认规则', 1, "id", '{"rawDays":90,"longTermYears":5,"protectedEvidenceCleanup":false}', 'PUBLISHED', CURRENT_TIMESTAMP, '系统预置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" WHERE "code" = 'HZJT';

INSERT INTO "CreditAccount" ("id", "businessNo", "subjectType", "enterpriseId", "vehicleId", "organizationId", "initialScore", "currentScore", "grade", "status", "createdAt", "updatedAt")
SELECT 'credit-ent-' || "id", 'CR-ENT-' || printf('%04d', row_number() OVER (ORDER BY "createdAt", "id")), 'ENTERPRISE', "id", NULL, "organizationId", 100, 100, 'A', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Enterprise";

INSERT INTO "CreditAccount" ("id", "businessNo", "subjectType", "enterpriseId", "vehicleId", "organizationId", "initialScore", "currentScore", "grade", "status", "createdAt", "updatedAt")
SELECT 'credit-veh-' || "id", 'CR-VEH-' || printf('%05d', row_number() OVER (ORDER BY "createdAt", "id")), 'VEHICLE', "enterpriseId", "id", "organizationId", 100, 100, 'A', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Vehicle" WHERE "deletedAt" IS NULL;
