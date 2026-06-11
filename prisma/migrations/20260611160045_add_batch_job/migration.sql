-- CreateTable
CREATE TABLE "BatchJob" (
    "id" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'CORP',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchJob_pkey" PRIMARY KEY ("id")
);
