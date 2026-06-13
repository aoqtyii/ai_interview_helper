-- CreateTable
CREATE TABLE "ImprovementPlanItemLearningResource" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "learningItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementPlanItemLearningResource_pkey" PRIMARY KEY ("id")
);

-- Backfill existing single-resource links as the first recommendation.
INSERT INTO "ImprovementPlanItemLearningResource" ("id", "planItemId", "learningItemId", "position")
SELECT concat('iplr_', "id"), "id", "learningItemId", 1
FROM "ImprovementPlanItem"
WHERE "learningItemId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "ImprovementPlanItemLearningResource_planItemId_learningItemId_key" ON "ImprovementPlanItemLearningResource"("planItemId", "learningItemId");

-- CreateIndex
CREATE INDEX "ImprovementPlanItemLearningResource_planItemId_position_idx" ON "ImprovementPlanItemLearningResource"("planItemId", "position");

-- CreateIndex
CREATE INDEX "ImprovementPlanItemLearningResource_learningItemId_idx" ON "ImprovementPlanItemLearningResource"("learningItemId");

-- AddForeignKey
ALTER TABLE "ImprovementPlanItemLearningResource" ADD CONSTRAINT "ImprovementPlanItemLearningResource_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "ImprovementPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementPlanItemLearningResource" ADD CONSTRAINT "ImprovementPlanItemLearningResource_learningItemId_fkey" FOREIGN KEY ("learningItemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
