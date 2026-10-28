-- CreateEnum
CREATE TYPE "CourseItemType" AS ENUM ('VIDEO', 'PLAYLIST', 'ARTICLE', 'DOCS', 'GUIDE', 'TUTORIAL', 'TOOL', 'BOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "CourseBuild" AS ENUM ('AI', 'TOPICS');

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT,
    "outcomes" TEXT[],
    "subject" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "build" "CourseBuild" NOT NULL DEFAULT 'AI',
    "weeklyMinutes" INTEGER,
    "focus" TEXT,
    "gaps" TEXT[],
    "unused" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItem" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "type" "CourseItemType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "author" TEXT,
    "minutes" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "why" TEXT,
    "sections" TEXT[],
    "startSec" INTEGER,
    "endSec" INTEGER,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "CourseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePractice" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stage" "LoopStage" NOT NULL DEFAULT 'BUILD',
    "task" TEXT NOT NULL,
    "doneWhen" TEXT,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "CoursePractice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCheckpoint" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "CourseCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseModule_courseId_position_idx" ON "CourseModule"("courseId", "position");

-- CreateIndex
CREATE INDEX "CourseItem_moduleId_position_idx" ON "CourseItem"("moduleId", "position");

-- CreateIndex
CREATE INDEX "CoursePractice_moduleId_position_idx" ON "CoursePractice"("moduleId", "position");

-- CreateIndex
CREATE INDEX "CourseCheckpoint_moduleId_position_idx" ON "CourseCheckpoint"("moduleId", "position");

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItem" ADD CONSTRAINT "CourseItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePractice" ADD CONSTRAINT "CoursePractice_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCheckpoint" ADD CONSTRAINT "CourseCheckpoint_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

