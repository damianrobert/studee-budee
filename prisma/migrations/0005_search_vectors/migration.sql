-- Full-text search for global search (Ctrl/Cmd+K). Same approach as "Note" in 0001_init:
-- generated tsvector columns (never written by the app) with GIN indexes.

ALTER TABLE "Postmortem" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("whatBroke", '') || ' ' || coalesce("rootCause", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("symptoms", '') || ' ' || coalesce("investigation", '') || ' ' ||
        coalesce("fix", '') || ' ' || coalesce("lessons", '')), 'C')
) STORED;
CREATE INDEX "Postmortem_searchVector_idx" ON "Postmortem" USING GIN ("searchVector");

ALTER TABLE "Topic" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
) STORED;
CREATE INDEX "Topic_searchVector_idx" ON "Topic" USING GIN ("searchVector");

ALTER TABLE "ReadingItem" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("takeaway", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("source", '')), 'C')
) STORED;
CREATE INDEX "ReadingItem_searchVector_idx" ON "ReadingItem" USING GIN ("searchVector");

ALTER TABLE "WorkObservation" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("content", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("question", '') || ' ' || coalesce("answer", '')), 'B')
) STORED;
CREATE INDEX "WorkObservation_searchVector_idx" ON "WorkObservation" USING GIN ("searchVector");
