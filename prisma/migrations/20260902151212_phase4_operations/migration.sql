-- CreateTable
CREATE TABLE "VehicleRealtimeStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "longitude" REAL NOT NULL,
    "latitude" REAL NOT NULL,
    "speed" REAL NOT NULL DEFAULT 0,
    "heading" REAL NOT NULL DEFAULT 0,
    "battery" INTEGER NOT NULL,
    "drivingState" TEXT NOT NULL DEFAULT 'PARKED',
    "autonomousState" TEXT NOT NULL DEFAULT 'STANDBY',
    "signalStrength" INTEGER NOT NULL DEFAULT 100,
    "mileageToday" REAL NOT NULL DEFAULT 0,
    "locationTime" DATETIME NOT NULL,
    "heartbeatAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleRealtimeStatus_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionType" TEXT NOT NULL DEFAULT 'OPERATION',
    "enterpriseId" TEXT,
    "organizationId" TEXT NOT NULL,
    "approvalResultId" TEXT,
    "polygonJson" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "speedLimit" INTEGER NOT NULL DEFAULT 20,
    "allowedHours" TEXT,
    "ruleDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperationRegion_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperationRegion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperationRegion_approvalResultId_fkey" FOREIGN KEY ("approvalResultId") REFERENCES "ApprovalResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationRegionVehicle" (
    "regionId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("regionId", "vehicleId"),
    CONSTRAINT "OperationRegionVehicle_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "OperationRegion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperationRegionVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "startAddress" TEXT,
    "endAddress" TEXT,
    "mileage" REAL NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "avgSpeed" REAL NOT NULL DEFAULT 0,
    "maxSpeed" REAL NOT NULL DEFAULT 0,
    "energyUsed" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "autonomousMiles" REAL NOT NULL DEFAULT 0,
    "manualTakeovers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperationRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperationRecord_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperationRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperationRecord_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "OperationRegion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleTrackPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationRecordId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "longitude" REAL NOT NULL,
    "latitude" REAL NOT NULL,
    "speed" REAL NOT NULL,
    "battery" INTEGER NOT NULL,
    "heading" REAL NOT NULL DEFAULT 0,
    "autonomousState" TEXT NOT NULL DEFAULT 'AUTO',
    "pointType" TEXT NOT NULL DEFAULT 'NORMAL',
    "recordedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleTrackPoint_operationRecordId_fkey" FOREIGN KEY ("operationRecordId") REFERENCES "OperationRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VehicleTrackPoint_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleOnlineDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "metricDate" DATETIME NOT NULL,
    "onlineMinutes" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "onlineRate" REAL NOT NULL,
    "firstOnlineAt" DATETIME,
    "lastOnlineAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleOnlineDaily_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleRealtimeStatus_vehicleId_key" ON "VehicleRealtimeStatus"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleRealtimeStatus_drivingState_heartbeatAt_idx" ON "VehicleRealtimeStatus"("drivingState", "heartbeatAt");

-- CreateIndex
CREATE INDEX "VehicleRealtimeStatus_heartbeatAt_idx" ON "VehicleRealtimeStatus"("heartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationRegion_businessNo_key" ON "OperationRegion"("businessNo");

-- CreateIndex
CREATE INDEX "OperationRegion_enterpriseId_status_idx" ON "OperationRegion"("enterpriseId", "status");

-- CreateIndex
CREATE INDEX "OperationRegion_organizationId_status_idx" ON "OperationRegion"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OperationRegion_approvalStatus_idx" ON "OperationRegion"("approvalStatus");

-- CreateIndex
CREATE INDEX "OperationRegionVehicle_vehicleId_idx" ON "OperationRegionVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationRecord_businessNo_key" ON "OperationRecord"("businessNo");

-- CreateIndex
CREATE INDEX "OperationRecord_vehicleId_startedAt_idx" ON "OperationRecord"("vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "OperationRecord_enterpriseId_startedAt_idx" ON "OperationRecord"("enterpriseId", "startedAt");

-- CreateIndex
CREATE INDEX "OperationRecord_organizationId_startedAt_idx" ON "OperationRecord"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "OperationRecord_status_startedAt_idx" ON "OperationRecord"("status", "startedAt");

-- CreateIndex
CREATE INDEX "OperationRecord_regionId_idx" ON "OperationRecord"("regionId");

-- CreateIndex
CREATE INDEX "VehicleTrackPoint_vehicleId_recordedAt_idx" ON "VehicleTrackPoint"("vehicleId", "recordedAt");

-- CreateIndex
CREATE INDEX "VehicleTrackPoint_pointType_recordedAt_idx" ON "VehicleTrackPoint"("pointType", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleTrackPoint_operationRecordId_sequence_key" ON "VehicleTrackPoint"("operationRecordId", "sequence");

-- CreateIndex
CREATE INDEX "VehicleOnlineDaily_metricDate_onlineRate_idx" ON "VehicleOnlineDaily"("metricDate", "onlineRate");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleOnlineDaily_vehicleId_metricDate_key" ON "VehicleOnlineDaily"("vehicleId", "metricDate");
