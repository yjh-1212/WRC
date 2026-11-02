CREATE TABLE "CockpitRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "parentCode" TEXT,
    "longitude" REAL NOT NULL,
    "latitude" REAL NOT NULL,
    "cameraHeight" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceName" TEXT NOT NULL,
    "reportedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CockpitRegion_code_key" ON "CockpitRegion"("code");
CREATE INDEX "CockpitRegion_level_parentCode_status_idx" ON "CockpitRegion"("level", "parentCode", "status");

CREATE TABLE "CockpitRegionSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "regionId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "registeredVehicles" INTEGER NOT NULL,
    "onlineVehicles" INTEGER NOT NULL,
    "runningVehicles" INTEGER NOT NULL,
    "operatingEnterprises" INTEGER NOT NULL,
    "mileageToday" REAL NOT NULL,
    "riskEvents" INTEGER NOT NULL,
    "majorEvents" INTEGER NOT NULL,
    "unresolvedMajor" INTEGER NOT NULL,
    "dataQualityRate" REAL NOT NULL,
    "deliveryVehicles" INTEGER NOT NULL DEFAULT 0,
    "sanitationVehicles" INTEGER NOT NULL DEFAULT 0,
    "patrolVehicles" INTEGER NOT NULL DEFAULT 0,
    "retailVehicles" INTEGER NOT NULL DEFAULT 0,
    "shuttleVehicles" INTEGER NOT NULL DEFAULT 0,
    "sourceName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'REGULATORY_REPORT',
    "reportedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CockpitRegionSnapshot_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "CockpitRegion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CockpitRegionSnapshot_regionId_capturedAt_key" ON "CockpitRegionSnapshot"("regionId", "capturedAt");
CREATE INDEX "CockpitRegionSnapshot_capturedAt_idx" ON "CockpitRegionSnapshot"("capturedAt");

CREATE TABLE "CockpitRoadRight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roadName" TEXT NOT NULL,
    "rightType" TEXT NOT NULL,
    "geometryType" TEXT NOT NULL DEFAULT 'LINE',
    "geometryJson" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "speedLimit" INTEGER,
    "sourceDocument" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CockpitRoadRight_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "CockpitRegion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CockpitRoadRight_businessNo_key" ON "CockpitRoadRight"("businessNo");
CREATE INDEX "CockpitRoadRight_regionId_status_validTo_idx" ON "CockpitRoadRight"("regionId", "status", "validTo");
