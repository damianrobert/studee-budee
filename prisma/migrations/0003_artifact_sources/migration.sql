-- Artifacts promoted from a postmortem or explain-it note link back to their source.
ALTER TABLE "Artifact" ADD COLUMN "sourceNoteId" TEXT,
ADD COLUMN "sourcePostmortemId" TEXT;

-- CreateIndex
CREATE INDEX "Artifact_targetMonth_idx" ON "Artifact"("targetMonth");

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_sourcePostmortemId_fkey" FOREIGN KEY ("sourcePostmortemId") REFERENCES "Postmortem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
