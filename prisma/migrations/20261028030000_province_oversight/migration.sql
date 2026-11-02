-- CreateTable
CREATE TABLE "ProvinceMatter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dueAt" DATETIME,
    "basis" TEXT,
    "resourceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "logsJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProvinceAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matterId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "feedback" TEXT,
    "evidenceNote" TEXT,
    "respondedAt" DATETIME,
    "submittedAt" DATETIME,
    "reviewComment" TEXT,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProvinceAssignment_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "ProvinceMatter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProvincePilot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'PREPARING',
    "responsibleName" TEXT NOT NULL,
    "planDate" DATETIME,
    "summary" TEXT NOT NULL,
    "reviewComment" TEXT,
    "logsJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProvinceResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "conditions" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProvinceDutyEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "score" REAL NOT NULL,
    "grade" TEXT NOT NULL,
    "breakdownJson" TEXT NOT NULL DEFAULT '{}',
    "conclusion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "ProvinceMatter_businessNo_key" ON "ProvinceMatter"("businessNo");

-- CreateIndex
CREATE INDEX "ProvinceMatter_kind_status_dueAt_idx" ON "ProvinceMatter"("kind", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ProvinceAssignment_workspaceId_status_idx" ON "ProvinceAssignment"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProvinceAssignment_matterId_workspaceId_key" ON "ProvinceAssignment"("matterId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvincePilot_workspaceId_key" ON "ProvincePilot"("workspaceId");

-- CreateIndex
CREATE INDEX "ProvinceResource_workspaceId_status_kind_idx" ON "ProvinceResource"("workspaceId", "status", "kind");

-- CreateIndex
CREATE INDEX "ProvinceDutyEvaluation_period_status_idx" ON "ProvinceDutyEvaluation"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProvinceDutyEvaluation_workspaceId_period_key" ON "ProvinceDutyEvaluation"("workspaceId", "period");
