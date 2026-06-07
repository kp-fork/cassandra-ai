-- CreateTable
CREATE TABLE "EntityComment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityUid" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT '익명',
    "password" TEXT,
    "content" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityComment_entityType_entityUid_idx" ON "EntityComment"("entityType", "entityUid");

-- CreateIndex
CREATE INDEX "EntityComment_createdAt_idx" ON "EntityComment"("createdAt");
