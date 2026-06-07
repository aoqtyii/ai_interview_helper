-- CreateEnum
CREATE TYPE "AssessmentFindingType" AS ENUM ('STRENGTH', 'WEAKNESS');

-- AlterTable
ALTER TABLE "AssessmentReport" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AssessmentReport" ADD COLUMN "nextPractice" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AssessmentDimensionScore" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "dimensionName" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentDimensionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentFinding" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "type" "AssessmentFindingType" NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weakness" TEXT NOT NULL,
    "practiceMethod" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "ProgressStatus" NOT NULL DEFAULT 'TODO',
    "skillId" TEXT,
    "learningItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImprovementPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentDimensionScore_reportId_dimensionKey_key" ON "AssessmentDimensionScore"("reportId", "dimensionKey");

-- CreateIndex
CREATE INDEX "AssessmentDimensionScore_reportId_position_idx" ON "AssessmentDimensionScore"("reportId", "position");

-- CreateIndex
CREATE INDEX "AssessmentDimensionScore_dimensionKey_idx" ON "AssessmentDimensionScore"("dimensionKey");

-- CreateIndex
CREATE INDEX "AssessmentFinding_reportId_type_idx" ON "AssessmentFinding"("reportId", "type");

-- CreateIndex
CREATE INDEX "AssessmentFinding_reportId_position_idx" ON "AssessmentFinding"("reportId", "position");

-- CreateIndex
CREATE INDEX "AssessmentFinding_dimensionKey_idx" ON "AssessmentFinding"("dimensionKey");

-- CreateIndex
CREATE INDEX "ImprovementPlanItem_planId_priority_idx" ON "ImprovementPlanItem"("planId", "priority");

-- CreateIndex
CREATE INDEX "ImprovementPlanItem_dimensionKey_idx" ON "ImprovementPlanItem"("dimensionKey");

-- CreateIndex
CREATE INDEX "ImprovementPlanItem_skillId_idx" ON "ImprovementPlanItem"("skillId");

-- CreateIndex
CREATE INDEX "ImprovementPlanItem_learningItemId_idx" ON "ImprovementPlanItem"("learningItemId");

-- AddForeignKey
ALTER TABLE "AssessmentDimensionScore" ADD CONSTRAINT "AssessmentDimensionScore_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AssessmentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentFinding" ADD CONSTRAINT "AssessmentFinding_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AssessmentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementPlanItem" ADD CONSTRAINT "ImprovementPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementPlanItem" ADD CONSTRAINT "ImprovementPlanItem_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementPlanItem" ADD CONSTRAINT "ImprovementPlanItem_learningItemId_fkey" FOREIGN KEY ("learningItemId") REFERENCES "LearningItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
