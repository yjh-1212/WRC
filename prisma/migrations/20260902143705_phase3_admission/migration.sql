-- CreateTable
CREATE TABLE "ProcessDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applicationType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProcessNodeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processDefinitionId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "approvalRoleCode" TEXT NOT NULL,
    "timeLimitHours" INTEGER NOT NULL DEFAULT 48,
    "countersignMode" TEXT NOT NULL DEFAULT 'ANY',
    "canReturn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProcessNodeDefinition_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdmissionApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "applicationType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentNodeName" TEXT,
    "submittedAt" DATETIME,
    "completedAt" DATETIME,
    "enterpriseNameSnapshot" TEXT,
    "creditCodeSnapshot" TEXT,
    "legalRepresentative" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "registeredAddress" TEXT,
    "operationPlan" TEXT,
    "qualificationSummary" TEXT,
    "roadTestStartAt" DATETIME,
    "roadTestEndAt" DATETIME,
    "roadTestRoute" TEXT,
    "testPlan" TEXT,
    "safetyMeasures" TEXT,
    "targetLicenseId" TEXT,
    "requestedExpiresAt" DATETIME,
    "renewalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdmissionApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdmissionApplication_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdmissionApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdmissionApplication_targetLicenseId_fkey" FOREIGN KEY ("targetLicenseId") REFERENCES "VehicleLicense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdmissionApplicationVehicle" (
    "applicationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("applicationId", "vehicleId"),
    CONSTRAINT "AdmissionApplicationVehicle_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdmissionApplicationVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "processDefinitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "currentNodeOrder" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProcessInstance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProcessInstance_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "processInstanceId" TEXT NOT NULL,
    "nodeDefinitionId" TEXT NOT NULL,
    "assigneeRoleCode" TEXT NOT NULL,
    "handlerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" DATETIME NOT NULL,
    "handledAt" DATETIME,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalTask_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalTask_processInstanceId_fkey" FOREIGN KEY ("processInstanceId") REFERENCES "ProcessInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalTask_nodeDefinitionId_fkey" FOREIGN KEY ("nodeDefinitionId") REFERENCES "ProcessNodeDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalTask_handlerUserId_fkey" FOREIGN KEY ("handlerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "processInstanceId" TEXT,
    "taskId" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "nodeName" TEXT,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalHistory_processInstanceId_fkey" FOREIGN KEY ("processInstanceId") REFERENCES "ProcessInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApprovalHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "resultType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "documentNo" TEXT NOT NULL,
    "licenseId" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalResult_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "VehicleLicense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessDefinition_businessNo_key" ON "ProcessDefinition"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessDefinition_code_key" ON "ProcessDefinition"("code");

-- CreateIndex
CREATE INDEX "ProcessDefinition_applicationType_status_idx" ON "ProcessDefinition"("applicationType", "status");

-- CreateIndex
CREATE INDEX "ProcessNodeDefinition_approvalRoleCode_idx" ON "ProcessNodeDefinition"("approvalRoleCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessNodeDefinition_processDefinitionId_nodeCode_key" ON "ProcessNodeDefinition"("processDefinitionId", "nodeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessNodeDefinition_processDefinitionId_orderNo_key" ON "ProcessNodeDefinition"("processDefinitionId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplication_businessNo_key" ON "AdmissionApplication"("businessNo");

-- CreateIndex
CREATE INDEX "AdmissionApplication_applicationType_status_idx" ON "AdmissionApplication"("applicationType", "status");

-- CreateIndex
CREATE INDEX "AdmissionApplication_enterpriseId_status_idx" ON "AdmissionApplication"("enterpriseId", "status");

-- CreateIndex
CREATE INDEX "AdmissionApplication_organizationId_status_idx" ON "AdmissionApplication"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AdmissionApplication_applicantUserId_createdAt_idx" ON "AdmissionApplication"("applicantUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdmissionApplicationVehicle_vehicleId_idx" ON "AdmissionApplicationVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessInstance_businessNo_key" ON "ProcessInstance"("businessNo");

-- CreateIndex
CREATE INDEX "ProcessInstance_applicationId_createdAt_idx" ON "ProcessInstance"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessInstance_status_currentNodeOrder_idx" ON "ProcessInstance"("status", "currentNodeOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalTask_businessNo_key" ON "ApprovalTask"("businessNo");

-- CreateIndex
CREATE INDEX "ApprovalTask_assigneeRoleCode_status_dueAt_idx" ON "ApprovalTask"("assigneeRoleCode", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ApprovalTask_applicationId_createdAt_idx" ON "ApprovalTask"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalTask_processInstanceId_status_idx" ON "ApprovalTask"("processInstanceId", "status");

-- CreateIndex
CREATE INDEX "ApprovalHistory_applicationId_createdAt_idx" ON "ApprovalHistory"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalHistory_processInstanceId_createdAt_idx" ON "ApprovalHistory"("processInstanceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalResult_businessNo_key" ON "ApprovalResult"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalResult_applicationId_key" ON "ApprovalResult"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalResult_documentNo_key" ON "ApprovalResult"("documentNo");

-- CreateIndex
CREATE INDEX "ApprovalResult_resultType_status_idx" ON "ApprovalResult"("resultType", "status");

-- CreateIndex
CREATE INDEX "ApprovalResult_licenseId_idx" ON "ApprovalResult"("licenseId");
