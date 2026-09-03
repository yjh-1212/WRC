-- AlterTable
ALTER TABLE "Enterprise" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Enterprise" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Enterprise" ADD COLUMN "legalRepresentative" TEXT;
ALTER TABLE "Enterprise" ADD COLUMN "registeredAddress" TEXT;

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "creditCode" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL DEFAULT 'DELIVERY',
    "autonomyLevel" TEXT NOT NULL DEFAULT 'L4',
    "maxSpeed" INTEGER NOT NULL,
    "ratedRange" INTEGER NOT NULL,
    "loadCapacity" INTEGER NOT NULL,
    "dimensions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleModel_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "deviceNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "color" TEXT,
    "manufactureDate" DATETIME,
    "serviceStartDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "onlineStatus" TEXT NOT NULL DEFAULT 'OFFLINE',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vehicle_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Vehicle_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleLicense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "licenseNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleLicense_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleLicense_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleLicense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" DATETIME,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'IN_SERVICE',
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleArchive_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnterpriseQualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "qualificationType" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "attachmentUrl" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EnterpriseQualification_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_businessNo_key" ON "Manufacturer"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_creditCode_key" ON "Manufacturer"("creditCode");

-- CreateIndex
CREATE INDEX "Manufacturer_status_deletedAt_idx" ON "Manufacturer"("status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_businessNo_key" ON "VehicleModel"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_modelCode_key" ON "VehicleModel"("modelCode");

-- CreateIndex
CREATE INDEX "VehicleModel_manufacturerId_status_idx" ON "VehicleModel"("manufacturerId", "status");

-- CreateIndex
CREATE INDEX "VehicleModel_status_deletedAt_idx" ON "VehicleModel"("status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_manufacturerId_name_key" ON "VehicleModel"("manufacturerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_businessNo_key" ON "Vehicle"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_deviceNo_key" ON "Vehicle"("deviceNo");

-- CreateIndex
CREATE INDEX "Vehicle_enterpriseId_status_idx" ON "Vehicle"("enterpriseId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_status_idx" ON "Vehicle"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_modelId_idx" ON "Vehicle"("modelId");

-- CreateIndex
CREATE INDEX "Vehicle_onlineStatus_idx" ON "Vehicle"("onlineStatus");

-- CreateIndex
CREATE INDEX "Vehicle_deletedAt_idx" ON "Vehicle"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleLicense_businessNo_key" ON "VehicleLicense"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleLicense_licenseNo_key" ON "VehicleLicense"("licenseNo");

-- CreateIndex
CREATE INDEX "VehicleLicense_vehicleId_status_idx" ON "VehicleLicense"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "VehicleLicense_enterpriseId_status_idx" ON "VehicleLicense"("enterpriseId", "status");

-- CreateIndex
CREATE INDEX "VehicleLicense_organizationId_idx" ON "VehicleLicense"("organizationId");

-- CreateIndex
CREATE INDEX "VehicleLicense_expiresAt_idx" ON "VehicleLicense"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleArchive_archiveNo_key" ON "VehicleArchive"("archiveNo");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleArchive_vehicleId_key" ON "VehicleArchive"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleArchive_lifecycleStatus_idx" ON "VehicleArchive"("lifecycleStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseQualification_businessNo_key" ON "EnterpriseQualification"("businessNo");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseQualification_certificateNo_key" ON "EnterpriseQualification"("certificateNo");

-- CreateIndex
CREATE INDEX "EnterpriseQualification_enterpriseId_status_idx" ON "EnterpriseQualification"("enterpriseId", "status");

-- CreateIndex
CREATE INDEX "EnterpriseQualification_expiresAt_idx" ON "EnterpriseQualification"("expiresAt");

-- CreateIndex
CREATE INDEX "EnterpriseQualification_deletedAt_idx" ON "EnterpriseQualification"("deletedAt");
