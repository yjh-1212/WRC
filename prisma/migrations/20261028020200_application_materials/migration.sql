CREATE TABLE "ApplicationMaterial" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "applicationId" TEXT NOT NULL,
 "originalName" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL,
 "size" INTEGER NOT NULL,
 "storageName" TEXT NOT NULL,
 "sha256" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "deletedAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ApplicationMaterial_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CityApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ApplicationMaterial_storageName_key" ON "ApplicationMaterial"("storageName");
CREATE INDEX "ApplicationMaterial_applicationId_deletedAt_idx" ON "ApplicationMaterial"("applicationId", "deletedAt");
