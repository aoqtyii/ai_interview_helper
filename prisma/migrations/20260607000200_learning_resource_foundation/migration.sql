-- AlterEnum
ALTER TYPE "LearningType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "LearningType" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "LearningType" ADD VALUE IF NOT EXISTS 'INTERVIEW_REVIEW';

-- AlterTable
ALTER TABLE "LearningItem" ADD COLUMN "roleProfileId" TEXT;
ALTER TABLE "LearningItem" ADD COLUMN "difficulty" "Difficulty" NOT NULL DEFAULT 'MID';
ALTER TABLE "LearningItem" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LearningItem" ADD COLUMN "dimensionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LearningItem" ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "LearningItem" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "LearningItem" ADD COLUMN "sourceMetadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "LearningItem" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LearningItem" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing learning resources from their skill role where possible.
UPDATE "LearningItem" AS item
SET "roleProfileId" = skill."roleProfileId"
FROM "Skill" AS skill
WHERE item."skillId" = skill."id" AND item."roleProfileId" IS NULL;

-- AlterTable
ALTER TABLE "LearningProgress" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "LearningProgress" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LearningProgress" ADD COLUMN "reflection" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "LearningItem_roleProfileId_idx" ON "LearningItem"("roleProfileId");
CREATE INDEX "LearningItem_skillId_idx" ON "LearningItem"("skillId");
CREATE INDEX "LearningItem_status_idx" ON "LearningItem"("status");
CREATE INDEX "LearningItem_difficulty_idx" ON "LearningItem"("difficulty");

-- AddForeignKey
ALTER TABLE "LearningItem" ADD CONSTRAINT "LearningItem_roleProfileId_fkey" FOREIGN KEY ("roleProfileId") REFERENCES "RoleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
