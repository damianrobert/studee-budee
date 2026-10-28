-- CreateEnum
CREATE TYPE "RoadmapStepStatus" AS ENUM ('TODO', 'DOING', 'DONE');

-- CreateEnum
CREATE TYPE "ResourceOrigin" AS ENUM ('SEARCH', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('DOCS', 'ARTICLE', 'VIDEO', 'COURSE', 'BOOK', 'INTERACTIVE', 'REPO', 'OTHER');

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapStage" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "RoadmapStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapStep" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "practice" TEXT,
    "status" "RoadmapStepStatus" NOT NULL DEFAULT 'TODO',

    CONSTRAINT "RoadmapStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapResource" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "origin" "ResourceOrigin" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapEdit" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "scope" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoadmapStage_roadmapId_position_idx" ON "RoadmapStage"("roadmapId", "position");

-- CreateIndex
CREATE INDEX "RoadmapStep_stageId_position_idx" ON "RoadmapStep"("stageId", "position");

-- CreateIndex
CREATE INDEX "RoadmapResource_stepId_position_idx" ON "RoadmapResource"("stepId", "position");

-- CreateIndex
CREATE INDEX "RoadmapEdit_roadmapId_createdAt_idx" ON "RoadmapEdit"("roadmapId", "createdAt");

-- AddForeignKey
ALTER TABLE "RoadmapStage" ADD CONSTRAINT "RoadmapStage_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapStep" ADD CONSTRAINT "RoadmapStep_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RoadmapStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapResource" ADD CONSTRAINT "RoadmapResource_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "RoadmapStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapEdit" ADD CONSTRAINT "RoadmapEdit_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
