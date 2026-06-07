-- CreateTable
CREATE TABLE "EntityVote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityUid" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityVote_entityType_entityUid_idx" ON "EntityVote"("entityType", "entityUid");

-- CreateIndex
CREATE INDEX "EntityVote_createdAt_idx" ON "EntityVote"("createdAt");
