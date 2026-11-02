CREATE TABLE "CockpitAppearance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "CockpitAppearance" ("id", "payload") VALUES ('province', '{"style":{},"presets":[]}');
