-- CreateTable
CREATE TABLE "SafetyAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "longitude" REAL,
    "latitude" REAL,
    "address" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "responsibleUserId" TEXT,
    "confirmedAt" DATETIME,
    "closedAt" DATETIME,
    "lastComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SafetyAlert_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SafetyAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SafetyAlert_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SafetyAlert_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElectronicFence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fenceType" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "organizationId" TEXT NOT NULL,
    "polygonJson" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "speedLimit" INTEGER,
    "allowedHours" TEXT,
    "ruleDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ElectronicFence_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ElectronicFence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElectronicFenceVehicle" (
    "fenceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("fenceId", "vehicleId"),
    CONSTRAINT "ElectronicFenceVehicle_fenceId_fkey" FOREIGN KEY ("fenceId") REFERENCES "ElectronicFence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ElectronicFenceVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FenceTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "fenceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "longitude" REAL NOT NULL,
    "latitude" REAL NOT NULL,
    "speed" REAL NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "recoveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FenceTrigger_fenceId_fkey" FOREIGN KEY ("fenceId") REFERENCES "ElectronicFence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FenceTrigger_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FenceTrigger_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SafetyAlert" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Accident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "accidentType" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "operationRecordId" TEXT,
    "alertId" TEXT,
    "reporterUserId" TEXT,
    "longitude" REAL NOT NULL,
    "latitude" REAL NOT NULL,
    "address" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "casualties" INTEGER NOT NULL DEFAULT 0,
    "damageDescription" TEXT,
    "investigation" TEXT,
    "responsibility" TEXT,
    "disposalProgress" TEXT,
    "attachmentJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "closedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Accident_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Accident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Accident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Accident_operationRecordId_fkey" FOREIGN KEY ("operationRecordId") REFERENCES "OperationRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Accident_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SafetyAlert" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Accident_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "violationType" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "operationRecordId" TEXT,
    "alertId" TEXT,
    "longitude" REAL,
    "latitude" REAL,
    "occurredAt" DATETIME NOT NULL,
    "determination" TEXT,
    "rectification" TEXT,
    "reviewComment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_DETERMINATION',
    "confirmedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Violation_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Violation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Violation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Violation_operationRecordId_fkey" FOREIGN KEY ("operationRecordId") REFERENCES "OperationRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Violation_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SafetyAlert" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfflineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "recoveryNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfflineEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfflineEvent_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfflineEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfflineEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SafetyAlert" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmergencyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "accidentId" TEXT,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "responseMode" TEXT,
    "assigneeUserId" TEXT,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_DISPATCH',
    "dispatchedAt" DATETIME,
    "respondedAt" DATETIME,
    "feedback" TEXT,
    "attachmentJson" TEXT,
    "evaluationScore" INTEGER,
    "evaluation" TEXT,
    "reviewComment" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmergencyTask_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SafetyAlert" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmergencyTask_accidentId_fkey" FOREIGN KEY ("accidentId") REFERENCES "Accident" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmergencyTask_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmergencyTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmergencyTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmergencyTaskLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmergencyTaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EmergencyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmergencyTaskLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyAlert_businessNo_key" ON "SafetyAlert"("businessNo");

-- CreateIndex
CREATE INDEX "SafetyAlert_enterpriseId_status_occurredAt_idx" ON "SafetyAlert"("enterpriseId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "SafetyAlert_organizationId_status_occurredAt_idx" ON "SafetyAlert"("organizationId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "SafetyAlert_vehicleId_occurredAt_idx" ON "SafetyAlert"("vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "SafetyAlert_level_status_idx" ON "SafetyAlert"("level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicFence_businessNo_key" ON "ElectronicFence"("businessNo");

-- CreateIndex
CREATE INDEX "ElectronicFence_enterpriseId_active_idx" ON "ElectronicFence"("enterpriseId", "active");

-- CreateIndex
CREATE INDEX "ElectronicFence_organizationId_active_idx" ON "ElectronicFence"("organizationId", "active");

-- CreateIndex
CREATE INDEX "ElectronicFence_fenceType_active_idx" ON "ElectronicFence"("fenceType", "active");

-- CreateIndex
CREATE INDEX "ElectronicFenceVehicle_vehicleId_idx" ON "ElectronicFenceVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "FenceTrigger_businessNo_key" ON "FenceTrigger"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "FenceTrigger_alertId_key" ON "FenceTrigger"("alertId");

-- CreateIndex
CREATE INDEX "FenceTrigger_fenceId_occurredAt_idx" ON "FenceTrigger"("fenceId", "occurredAt");

-- CreateIndex
CREATE INDEX "FenceTrigger_vehicleId_status_idx" ON "FenceTrigger"("vehicleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Accident_businessNo_key" ON "Accident"("businessNo");

-- CreateIndex
CREATE INDEX "Accident_enterpriseId_status_occurredAt_idx" ON "Accident"("enterpriseId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Accident_organizationId_status_occurredAt_idx" ON "Accident"("organizationId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Accident_vehicleId_occurredAt_idx" ON "Accident"("vehicleId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Violation_businessNo_key" ON "Violation"("businessNo");

-- CreateIndex
CREATE INDEX "Violation_enterpriseId_status_occurredAt_idx" ON "Violation"("enterpriseId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Violation_organizationId_status_occurredAt_idx" ON "Violation"("organizationId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Violation_vehicleId_occurredAt_idx" ON "Violation"("vehicleId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineEvent_businessNo_key" ON "OfflineEvent"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineEvent_alertId_key" ON "OfflineEvent"("alertId");

-- CreateIndex
CREATE INDEX "OfflineEvent_enterpriseId_status_startedAt_idx" ON "OfflineEvent"("enterpriseId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "OfflineEvent_organizationId_status_startedAt_idx" ON "OfflineEvent"("organizationId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "OfflineEvent_vehicleId_status_idx" ON "OfflineEvent"("vehicleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyTask_businessNo_key" ON "EmergencyTask"("businessNo");

-- CreateIndex
CREATE INDEX "EmergencyTask_enterpriseId_status_dueAt_idx" ON "EmergencyTask"("enterpriseId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "EmergencyTask_organizationId_status_dueAt_idx" ON "EmergencyTask"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "EmergencyTask_alertId_createdAt_idx" ON "EmergencyTask"("alertId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyTaskLog_taskId_createdAt_idx" ON "EmergencyTaskLog"("taskId", "createdAt");
