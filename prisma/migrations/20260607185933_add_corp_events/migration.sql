-- AlterTable
ALTER TABLE "Corp" ADD COLUMN     "formerNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CorpEvent" (
    "id" TEXT NOT NULL,
    "corpId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,

    CONSTRAINT "CorpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorpEvent_corpId_occurredAt_idx" ON "CorpEvent"("corpId", "occurredAt");

-- CreateIndex
CREATE INDEX "CorpEvent_eventType_idx" ON "CorpEvent"("eventType");

-- AddForeignKey
ALTER TABLE "CorpEvent" ADD CONSTRAINT "CorpEvent_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
