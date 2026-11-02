ALTER TABLE "SafetyAlert" ADD COLUMN "evidenceJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "SafetyAlert" ADD COLUMN "ruleKey" TEXT;
CREATE UNIQUE INDEX "SafetyAlert_ruleKey_key" ON "SafetyAlert"("ruleKey");
ALTER TABLE "ElectronicFence" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ElectronicFence" ADD COLUMN "historyJson" TEXT NOT NULL DEFAULT '[]';
CREATE TABLE "VehicleObservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "vehicleId" TEXT NOT NULL,
  "operationRecordId" TEXT,
  "longitude" REAL NOT NULL,
  "latitude" REAL NOT NULL,
  "speed" REAL NOT NULL,
  "battery" INTEGER NOT NULL,
  "heading" REAL NOT NULL DEFAULT 0,
  "drivingState" TEXT NOT NULL,
  "autonomousState" TEXT NOT NULL,
  "pointType" TEXT NOT NULL DEFAULT 'NORMAL',
  "recordedAt" DATETIME NOT NULL,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleObservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VehicleObservation_vehicleId_recordedAt_idx" ON "VehicleObservation"("vehicleId", "recordedAt");
CREATE INDEX "VehicleObservation_operationRecordId_recordedAt_idx" ON "VehicleObservation"("operationRecordId", "recordedAt");
