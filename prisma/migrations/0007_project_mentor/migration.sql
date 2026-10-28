-- CreateEnum
CREATE TYPE "MentorRole" AS ENUM ('USER', 'MENTOR');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "mentorMemory" TEXT,
ADD COLUMN "mentorMemoryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MentorMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "MentorRole" NOT NULL,
    "content" TEXT NOT NULL,
    "solution" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MentorMessage_projectId_createdAt_idx" ON "MentorMessage"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "MentorMessage" ADD CONSTRAINT "MentorMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
