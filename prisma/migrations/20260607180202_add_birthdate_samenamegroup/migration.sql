-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "birthDate" TEXT;

-- CreateTable
CREATE TABLE "SameNameGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SameNameGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SameNameGroup_name_idx" ON "SameNameGroup"("name");

-- CreateIndex
CREATE INDEX "Person_birthDate_idx" ON "Person"("birthDate");
