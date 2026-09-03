-- CreateTable
CREATE TABLE "EvaluationIndicator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "description" TEXT,
    "weight" REAL NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'LOWER_BETTER',
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationIndicator_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvaluationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "indicatorId" TEXT NOT NULL,
    "minValue" REAL,
    "maxValue" REAL,
    "score" REAL NOT NULL,
    "label" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationRule_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "EvaluationIndicator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvaluationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "generatedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnterpriseEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "totalScore" REAL NOT NULL,
    "grade" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "safetyScore" REAL NOT NULL,
    "complianceScore" REAL NOT NULL,
    "operationScore" REAL NOT NULL,
    "breakdownJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "conclusion" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EnterpriseEvaluation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EvaluationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnterpriseEvaluation_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EnterpriseEvaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvaluationAppeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "reviewComment" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationAppeal_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "EnterpriseEvaluation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvaluationAppeal_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvaluationAppeal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccidentReconstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accidentId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "windowMinutes" INTEGER NOT NULL DEFAULT 30,
    "evidenceJson" TEXT NOT NULL,
    "causeJson" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "recommendation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "analystId" TEXT NOT NULL,
    "analystName" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccidentReconstruction_accidentId_fkey" FOREIGN KEY ("accidentId") REFERENCES "Accident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccidentReconstruction_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccidentReconstruction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegulatoryReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "enterpriseId" TEXT,
    "organizationId" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "recipient" TEXT,
    "generatedById" TEXT NOT NULL,
    "generatedByName" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distributedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RegulatoryReport_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RegulatoryReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationIndicator_code_key" ON "EvaluationIndicator"("code");

-- CreateIndex
CREATE INDEX "EvaluationIndicator_organizationId_status_idx" ON "EvaluationIndicator"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EvaluationIndicator_dimension_status_idx" ON "EvaluationIndicator"("dimension", "status");

-- CreateIndex
CREATE INDEX "EvaluationRule_indicatorId_orderNo_idx" ON "EvaluationRule"("indicatorId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationTask_businessNo_key" ON "EvaluationTask"("businessNo");

-- CreateIndex
CREATE INDEX "EvaluationTask_organizationId_status_periodEnd_idx" ON "EvaluationTask"("organizationId", "status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseEvaluation_businessNo_key" ON "EnterpriseEvaluation"("businessNo");

-- CreateIndex
CREATE INDEX "EnterpriseEvaluation_enterpriseId_status_createdAt_idx" ON "EnterpriseEvaluation"("enterpriseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EnterpriseEvaluation_organizationId_riskLevel_idx" ON "EnterpriseEvaluation"("organizationId", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseEvaluation_taskId_enterpriseId_key" ON "EnterpriseEvaluation"("taskId", "enterpriseId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAppeal_businessNo_key" ON "EvaluationAppeal"("businessNo");

-- CreateIndex
CREATE INDEX "EvaluationAppeal_enterpriseId_status_createdAt_idx" ON "EvaluationAppeal"("enterpriseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationAppeal_organizationId_status_idx" ON "EvaluationAppeal"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccidentReconstruction_accidentId_key" ON "AccidentReconstruction"("accidentId");

-- CreateIndex
CREATE INDEX "AccidentReconstruction_organizationId_status_idx" ON "AccidentReconstruction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AccidentReconstruction_enterpriseId_createdAt_idx" ON "AccidentReconstruction"("enterpriseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryReport_businessNo_key" ON "RegulatoryReport"("businessNo");

-- CreateIndex
CREATE INDEX "RegulatoryReport_organizationId_category_periodEnd_idx" ON "RegulatoryReport"("organizationId", "category", "periodEnd");

-- CreateIndex
CREATE INDEX "RegulatoryReport_enterpriseId_periodEnd_idx" ON "RegulatoryReport"("enterpriseId", "periodEnd");

-- CreateIndex
CREATE INDEX "RegulatoryReport_status_generatedAt_idx" ON "RegulatoryReport"("status", "generatedAt");
