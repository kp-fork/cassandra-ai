-- CreateTable
CREATE TABLE "PersonHistory" (
    "id" TEXT NOT NULL,
    "personUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TEXT,
    "companyName" TEXT NOT NULL,
    "stockCode" TEXT,
    "role" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "sourceRceptNo" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonHistory_personUid_eventDate_idx" ON "PersonHistory"("personUid", "eventDate");

-- CreateIndex
CREATE INDEX "PersonHistory_name_birthDate_idx" ON "PersonHistory"("name", "birthDate");

-- CreateIndex
CREATE INDEX "PersonHistory_companyName_idx" ON "PersonHistory"("companyName");
