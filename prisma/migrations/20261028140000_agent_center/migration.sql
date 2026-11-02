CREATE TABLE "AgentConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "enterpriseId" TEXT,
  "agentCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "pagePath" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "AgentConversation_userId_updatedAt_idx" ON "AgentConversation"("userId", "updatedAt");

CREATE TABLE "AgentTurn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sourcesJson" TEXT NOT NULL DEFAULT '[]',
  "factsJson" TEXT NOT NULL DEFAULT '{}',
  "scopeKey" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'MODEL',
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AgentTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentTurn_conversationId_requestKey_key" ON "AgentTurn"("conversationId", "requestKey");
CREATE INDEX "AgentTurn_conversationId_createdAt_idx" ON "AgentTurn"("conversationId", "createdAt");
