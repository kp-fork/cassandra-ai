-- CreateTable
CREATE TABLE "SearchCache" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "githubPath" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "searchCount" INTEGER NOT NULL DEFAULT 1,
    "period" INTEGER NOT NULL DEFAULT 12,
    "lastSearched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchCache_type_query_idx" ON "SearchCache"("type", "query");

-- CreateIndex
CREATE INDEX "SearchCache_lastSearched_idx" ON "SearchCache"("lastSearched");

-- CreateIndex
CREATE UNIQUE INDEX "SearchCache_type_query_period_key" ON "SearchCache"("type", "query", "period");
