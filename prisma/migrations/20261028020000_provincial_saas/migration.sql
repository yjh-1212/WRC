-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "CityWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityCode" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "modulesJson" TEXT NOT NULL DEFAULT '[]',
    "validUntil" DATETIME,
    "quotasJson" TEXT NOT NULL DEFAULT '{}',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CityApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NEW',
    "workspaceId" TEXT,
    "cityCode" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "modulesJson" TEXT NOT NULL DEFAULT '[]',
    "expectedVehicles" INTEGER NOT NULL DEFAULT 0,
    "materialNote" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "trackingHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "historyJson" TEXT NOT NULL DEFAULT '[]',
    "reviewComment" TEXT,
    "grantJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL DEFAULT 'CITY_ADMIN',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProvisionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkspaceNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Existing users keep their IDs and relationships.
ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "User" ADD COLUMN "accountLevel" TEXT NOT NULL DEFAULT 'CITY';
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CityWorkspace_cityCode_key" ON "CityWorkspace"("cityCode");

-- CreateIndex
CREATE UNIQUE INDEX "CityWorkspace_organizationId_key" ON "CityWorkspace"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CityApplication_businessNo_key" ON "CityApplication"("businessNo");

-- CreateIndex
CREATE INDEX "CityApplication_cityCode_status_idx" ON "CityApplication"("cityCode", "status");

-- CreateIndex
CREATE INDEX "CityApplication_workspaceId_idx" ON "CityApplication"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_username_idx" ON "WorkspaceInvitation"("workspaceId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisionJob_applicationId_key" ON "ProvisionJob"("applicationId");

-- CreateIndex
CREATE INDEX "WorkspaceNotice_workspaceId_createdAt_idx" ON "WorkspaceNotice"("workspaceId", "createdAt");
