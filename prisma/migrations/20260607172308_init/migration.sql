-- CreateTable
CREATE TABLE "Corp" (
    "id" TEXT NOT NULL,
    "corpCode" VARCHAR(8) NOT NULL,
    "stockCode" VARCHAR(6),
    "companyName" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'KOSDAQ',
    "marketCap" BIGINT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "delistedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Corp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "personUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "fundUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fundType" TEXT NOT NULL DEFAULT 'spc',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpPersonRelation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "corpId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT,
    "since" TIMESTAMP(3),
    "until" TIMESTAMP(3),
    "source" TEXT,

    CONSTRAINT "CorpPersonRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpFundRelation" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "corpId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT,
    "pct" DOUBLE PRECISION,
    "at" TIMESTAMP(3),
    "source" TEXT,

    CONSTRAINT "CorpFundRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundPersonRelation" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "FundPersonRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filing" (
    "id" TEXT NOT NULL,
    "rceptNo" VARCHAR(14) NOT NULL,
    "corpId" TEXT NOT NULL,
    "filingType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "involvedPeople" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "involvedFunds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Filing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "corpId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "detail" TEXT,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Corp_corpCode_key" ON "Corp"("corpCode");

-- CreateIndex
CREATE INDEX "Corp_companyName_idx" ON "Corp"("companyName");

-- CreateIndex
CREATE INDEX "Corp_corpCode_idx" ON "Corp"("corpCode");

-- CreateIndex
CREATE UNIQUE INDEX "Person_personUid_key" ON "Person"("personUid");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_fundUid_key" ON "Fund"("fundUid");

-- CreateIndex
CREATE INDEX "Fund_name_idx" ON "Fund"("name");

-- CreateIndex
CREATE INDEX "CorpPersonRelation_personId_idx" ON "CorpPersonRelation"("personId");

-- CreateIndex
CREATE INDEX "CorpPersonRelation_corpId_idx" ON "CorpPersonRelation"("corpId");

-- CreateIndex
CREATE INDEX "CorpFundRelation_fundId_idx" ON "CorpFundRelation"("fundId");

-- CreateIndex
CREATE INDEX "CorpFundRelation_corpId_idx" ON "CorpFundRelation"("corpId");

-- CreateIndex
CREATE INDEX "FundPersonRelation_fundId_idx" ON "FundPersonRelation"("fundId");

-- CreateIndex
CREATE INDEX "FundPersonRelation_personId_idx" ON "FundPersonRelation"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Filing_rceptNo_key" ON "Filing"("rceptNo");

-- CreateIndex
CREATE INDEX "Filing_corpId_filedAt_idx" ON "Filing"("corpId", "filedAt");

-- CreateIndex
CREATE INDEX "Filing_filedAt_idx" ON "Filing"("filedAt");

-- CreateIndex
CREATE INDEX "Signal_corpId_firedAt_idx" ON "Signal"("corpId", "firedAt");

-- CreateIndex
CREATE INDEX "Signal_firedAt_idx" ON "Signal"("firedAt");

-- AddForeignKey
ALTER TABLE "CorpPersonRelation" ADD CONSTRAINT "CorpPersonRelation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpPersonRelation" ADD CONSTRAINT "CorpPersonRelation_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpFundRelation" ADD CONSTRAINT "CorpFundRelation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpFundRelation" ADD CONSTRAINT "CorpFundRelation_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundPersonRelation" ADD CONSTRAINT "FundPersonRelation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundPersonRelation" ADD CONSTRAINT "FundPersonRelation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filing" ADD CONSTRAINT "Filing_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
