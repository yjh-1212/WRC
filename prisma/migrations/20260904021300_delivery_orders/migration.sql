-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessNo" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "cargoType" TEXT NOT NULL,
    "cargoWeight" REAL NOT NULL,
    "startName" TEXT NOT NULL,
    "startAddress" TEXT NOT NULL,
    "startLng" REAL NOT NULL,
    "startLat" REAL NOT NULL,
    "endName" TEXT NOT NULL,
    "endAddress" TEXT NOT NULL,
    "endLng" REAL NOT NULL,
    "endLat" REAL NOT NULL,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "etaMinutes" INTEGER,
    "dispatchedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrder_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryOrder_businessNo_key" ON "DeliveryOrder"("businessNo");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_vehicleId_status_idx" ON "DeliveryOrder"("vehicleId", "status");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_enterpriseId_status_idx" ON "DeliveryOrder"("enterpriseId", "status");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_organizationId_status_idx" ON "DeliveryOrder"("organizationId", "status");
