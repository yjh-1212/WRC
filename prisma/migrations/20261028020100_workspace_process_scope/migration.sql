ALTER TABLE "ProcessDefinition" ADD COLUMN "workspaceId" TEXT;
CREATE INDEX "ProcessDefinition_workspaceId_idx" ON "ProcessDefinition"("workspaceId");
