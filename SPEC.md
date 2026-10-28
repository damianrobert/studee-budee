# studee-budee — Personal DevOps Learning App

> **Spec for Claude Code.** Build the complete app described below. It is a single-user, self-hosted web app that helps one person study DevOps/AI-infrastructure alongside a full-time job. The whole stack must start with **one command**: `docker compose up -d`.

---

## 1. Purpose and principles

The app supports a specific learning method. Every feature exists to reinforce one of these habits. If you are unsure how to implement something, choose the option that best serves these principles:

1. **Small daily sessions beat long binges.** A session of 10+ minutes counts toward the streak.
2. **Always know the next step.** Every session ends by writing "what's next"; the next session starts by showing it.
3. **One project at a time.** Only one project may be active (WIP limit = 1).
4. **The learning loop:** every topic moves through **Pain → Build → Break → Explain**.
   - *Pain*: do it the manual way first, to feel the problem.
   - *Build*: automate/solve it with the tool.
   - *Break*: deliberately break it and debug it.
   - *Explain*: write it up in plain words.
5. **Proof over knowledge.** Track outputs (commits, postmortems, published artifacts), never hours of watching.
6. **Failure is the curriculum.** Postmortems and chaos experiments are first-class features.
7. **AI as tutor, not crutch.** AI features give hints and quizzes, never full answers, and only after an honest attempt.

Keep the UI calm, fast and uncluttered. The user opens this app daily with limited time and energy — the home screen must let them start a session in one click.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** — server components + server actions; no separate backend |
| Styling | **Tailwind CSS** + **shadcn/ui** components |
| Database | **PostgreSQL 16** |
| ORM | **Prisma** (migrations applied automatically on container start) |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` for rendering; a simple textarea editor with live preview (split view) is enough |
| Charts | **Recharts** |
| AI (optional) | Anthropic API via `@anthropic-ai/sdk`; enabled only if `ANTHROPIC_API_KEY` is set |
| Auth | Single-user password login (see §4) |

Use pinned dependency versions. Keep dependencies minimal.

---

## 3. Docker / deployment

### 3.1 Services (`docker-compose.yml`)

- **`app`** — the Next.js app, built from a multi-stage `Dockerfile` (deps → build → slim runtime using Next.js `output: "standalone"`), runs as non-root user, exposes port `3000`.
- **`db`** — `postgres:16-alpine`, data in named volume `pgdata`, with a `healthcheck` (`pg_isready`).
- **`backup`** — lightweight container (e.g. `postgres:16-alpine` with a cron loop or `prodrigestivill/postgres-backup-local`) that runs `pg_dump` nightly into volume/bind mount `./backups`, keeping the last 14 daily dumps.

Requirements:
- `app` has `depends_on: db: condition: service_healthy`.
- `app` has its own healthcheck hitting `GET /api/health` (returns 200 + DB connectivity status).
- Uploaded files go to named volume `uploads` mounted at `/data/uploads` (files on disk, metadata in Postgres).
- `restart: unless-stopped` on all services.
- Container entrypoint runs `prisma migrate deploy` before starting the server.
- Timezone configurable via `TZ` env var (default `Europe/Bucharest`); all "day" logic (streaks, today) uses this timezone.

### 3.2 Configuration

Provide `.env.example`:

```
APP_PASSWORD=change-me
SESSION_SECRET=generate-a-long-random-string
POSTGRES_USER=studee
POSTGRES_PASSWORD=change-me
POSTGRES_DB=studee
DATABASE_URL=postgresql://studee:change-me@db:5432/studee
TZ=Europe/Bucharest
APP_PORT=3000
MAX_UPLOAD_MB=50
ANTHROPIC_API_KEY=            # optional; leave empty to disable AI features
ANTHROPIC_MODEL=claude-sonnet-4-5
```

### 3.3 README

Include a `README.md` with: what the app is, `cp .env.example .env` → `docker compose up -d` → open `http://localhost:3000`, how to restore a backup (`pg_restore`/`psql` command), how to update (`git pull && docker compose up -d --build`).

---

## 4. Authentication

- Single user. No registration, no user table needed.
- Login page asks for a password; compare against `APP_PASSWORD` (constant-time comparison).
- On success set an HTTP-only, signed session cookie (signed with `SESSION_SECRET`), 30-day expiry.
- Middleware protects every route except `/login` and `/api/health`.
- Simple rate limit on login (e.g. 5 attempts/minute, in memory).

---

## 5. Data model (Prisma)

Implement roughly the following. Adjust details if needed, but keep the concepts.

```prisma
enum ProjectStatus { ACTIVE PAUSED DONE ARCHIVED }
enum LoopStage    { PAIN BUILD BREAK EXPLAIN DONE }
enum NoteType     { NOTE EXPLAIN_IT }
enum ArtifactStatus { IDEA DRAFT PUBLISHED }
enum ArtifactKind { BLOG_POST DIAGRAM README SOCIAL_POST TALK OTHER }
enum Bottleneck   { TIME ENERGY FOCUS TUTORIAL_HELL STUCK_ON_CONCEPT TOOL_FOMO ENVIRONMENT_ISSUES OTHER }
enum ReadingStatus { UNREAD READ ARCHIVED }

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?  // markdown
  goal        String?  // what "done" looks like
  repoUrl     String?
  status      ProjectStatus @default(PAUSED)
  topics      Topic[]
  sessions    Session[]
  notes       Note[]
  postmortems Postmortem[]
  files       FileAsset[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Topic {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title       String
  description String?
  stage       LoopStage @default(PAIN)
  position    Int       // ordering within a column
  stageHistory TopicStageChange[]
  sessions    Session[]
  notes       Note[]
  postmortems Postmortem[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model TopicStageChange {
  id        String    @id @default(cuid())
  topicId   String
  topic     Topic     @relation(fields: [topicId], references: [id], onDelete: Cascade)
  from      LoopStage
  to        LoopStage
  changedAt DateTime  @default(now())
}

model Session {
  id            String     @id @default(cuid())
  projectId     String?
  project       Project?   @relation(fields: [projectId], references: [id], onDelete: SetNull)
  topicId       String?
  topic         Topic?     @relation(fields: [topicId], references: [id], onDelete: SetNull)
  startedAt     DateTime
  endedAt       DateTime?
  durationMin   Int?       // computed on stop; editable
  stage         LoopStage? // which loop step this session was
  summary       String?    // what I did
  producedOutput Boolean   @default(false)
  outputLink    String?    // commit URL, note link, etc.
  nextStep      String?    // REQUIRED when ending a session
  createdAt     DateTime   @default(now())
}

model Note {
  id        String   @id @default(cuid())
  title     String
  content   String   // markdown
  type      NoteType @default(NOTE)
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  topicId   String?
  topic     Topic?   @relation(fields: [topicId], references: [id], onDelete: SetNull)
  tags      Tag[]
  files     FileAsset[]
  pinned    Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // add a generated tsvector column + GIN index via raw SQL migration for full-text search
}

model Postmortem {
  id           String   @id @default(cuid())
  title        String
  occurredAt   DateTime @default(now())
  whatBroke    String
  symptoms     String
  investigation String  // how I found the cause
  rootCause    String
  fix          String
  lessons      String
  wasDeliberate Boolean @default(false) // true if from a chaos experiment
  projectId    String?
  project      Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  topicId      String?
  topic        Topic?   @relation(fields: [topicId], references: [id], onDelete: SetNull)
  chaosExperimentId String?
  chaosExperiment   ChaosExperiment? @relation(fields: [chaosExperimentId], references: [id], onDelete: SetNull)
  files        FileAsset[]
  tags         Tag[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model ChaosExperiment {
  id          String   @id @default(cuid())
  title       String   // e.g. "Kill the DB container mid-write"
  description String?  // how to do it
  hypothesis  String?  // what I expect to happen
  difficulty  Int      @default(1) // 1-3
  category    String?  // containers, networking, storage, k8s, ci, security...
  completedAt DateTime?
  postmortems Postmortem[]
  createdAt   DateTime @default(now())
}

model WeeklyRetro {
  id           String     @id @default(cuid())
  weekStart    DateTime   @unique // Monday 00:00 in TZ
  shipped      String     // what did I ship?
  slowedDown   String     // what slowed me down?
  bottleneck   Bottleneck
  nextWeekGoal String     // one goal for next week
  energy       Int?       // 1-5 self rating
  createdAt    DateTime   @default(now())
}

model ReadingItem {
  id        String        @id @default(cuid())
  url       String
  title     String?
  source    String?       // domain, auto-filled
  status    ReadingStatus @default(UNREAD)
  takeaway  String?       // one-line takeaway when marked read
  tags      Tag[]
  createdAt DateTime      @default(now())
  readAt    DateTime?
}

model Artifact {
  id          String         @id @default(cuid())
  title       String
  kind        ArtifactKind
  status      ArtifactStatus @default(IDEA)
  url         String?
  notes       String?
  targetMonth DateTime       // first day of month it's intended for
  publishedAt DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model WorkObservation {
  id         String   @id @default(cuid())
  content    String   // what I noticed at my job
  question   String?  // question to ask a colleague
  resolved   Boolean  @default(false)
  answer     String?
  tags       Tag[]
  createdAt  DateTime @default(now())
}

model FileAsset {
  id           String   @id @default(cuid())
  originalName String
  storedName   String   // uuid-based filename on disk
  mimeType     String
  sizeBytes    Int
  projectId    String?
  project      Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  notes        Note[]
  postmortems  Postmortem[]
  createdAt    DateTime @default(now())
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  notes Note[]
  postmortems Postmortem[]
  readingItems ReadingItem[]
  workObservations WorkObservation[]
}

model Flashcard {
  id         String   @id @default(cuid())
  front      String
  back       String
  noteId     String?  // source note, if generated
  // SM-2 spaced repetition fields
  easeFactor Float    @default(2.5)
  interval   Int      @default(0) // days
  repetitions Int     @default(0)
  dueAt      DateTime @default(now())
  createdAt  DateTime @default(now())
}

model Setting {
  key   String @id
  value String
}
```

Seed the database on first run with ~20 sensible chaos experiments (see §7.6) and nothing else.

---

## 6. Navigation and layout

Left sidebar (collapsible on mobile):

- **Today** (home, `/`)
- **Projects** (`/projects`)
- **Notes** (`/notes`)
- **Postmortems** (`/postmortems`)
- **Chaos Lab** (`/chaos`)
- **Retros** (`/retros`)
- **Reading** (`/reading`)
- **Artifacts** (`/artifacts`)
- **Work Log** (`/work`)
- **Flashcards** (`/flashcards`)
- **Files** (`/files`)
- **Stats** (`/stats`)
- **Settings** (`/settings`)

Global elements:
- **Global search** (Ctrl/Cmd + K) across notes, postmortems, topics, reading items, work observations (Postgres full-text search).
- **Quick capture** button (Ctrl/Cmd + J): small modal with tabs to quickly add a note, reading link, or work observation without leaving the page.
- **Active session indicator** in the header: when a session is running, show elapsed time and a "Stop" button on every page.
- Light/dark mode (follows system, toggle in settings).
- Fully usable on a phone (responsive) — the reading inbox and quick capture will often be used on mobile.

---

## 7. Features

### 7.1 Today screen (`/`)

The home page. Must load fast and allow starting a session in one click.

Contents, top to bottom:
1. **"Next step" card** — the `nextStep` from the most recent completed session, displayed prominently, with its project/topic. If none: "Start your first session."
2. **Big "Start session" button.** Starts a session pre-filled with the active project and the topic from the last session (changeable).
3. **Streak card** — current streak (consecutive days with ≥10 min of sessions), longest streak, and a 7-day row of dots (filled = day counted).
4. **This week** — the goal from the latest weekly retro; sessions this week vs. a weekly target (setting, default 5).
5. **Active project** — name, progress (topics per stage as a small stacked bar), link to the board.
6. **Nudges** (show only when relevant, max 2 at once):
   - It's Sunday (or later) and no retro exists for this week → "Time for your 15-minute retro."
   - No chaos experiment completed in 14 days → "Break something this week."
   - Current month has no PUBLISHED artifact and it's past the 20th → "One artifact this month?"
   - Unread reading items > 15 → "Your reading inbox is piling up."
   - Due flashcards > 0 → "N flashcards due."

### 7.2 Sessions

**Start:** choose project (defaults to active) and optional topic. Creates a `Session` with `startedAt = now`. Only one running session at a time.

**Running:** header shows a timer. Session survives page reloads/closing the browser (it's in the DB).

**Stop:** opens a modal form:
- *What did I do?* (summary, optional short text)
- *Loop stage* (Pain / Build / Break / Explain, optional)
- *Did I produce something visible?* (toggle) + *link* (optional)
- **What's next?** — **required**. Cannot save without it. Placeholder: "One concrete action to start with next time."
- Duration is computed but editable (in case the user forgot to stop the timer).

Also:
- **Log a past session manually** (for sessions done away from the app).
- If a running session is older than 4 hours, show a banner asking whether it was forgotten, with a field to correct the end time.
- Session history list at `/sessions` (reachable from Stats and project pages), filterable by project.

**Streak rules:** a day "counts" if the total duration of sessions on that day (in `TZ`) is ≥ 10 minutes (setting: `minSessionMinutes`, default 10). Streak = consecutive counted days ending today or yesterday (today not yet counted doesn't break it).

### 7.3 Projects and the learning-loop board

**Projects list** (`/projects`): cards with name, status, goal, topic counts per stage, last session date. Create/edit/archive.

**WIP limit:** only one project can be `ACTIVE`. Activating another one asks for confirmation and pauses the current one. Show a short line explaining why ("One project at a time keeps you finishing things.").

**Project page** (`/projects/[id]`):
- Header: name, goal, repo link, status, total sessions, last activity.
- **Board** with 5 columns: **Pain → Build → Break → Explain → Done**, with a one-line description under each column header (see §1).
- Topic cards: drag-and-drop between columns and to reorder (use `@dnd-kit`). Each move records a `TopicStageChange`.
- **Gate:** a topic can only move to **Done** if it has at least one `EXPLAIN_IT` note. If not, show a dialog offering to create one right away (opens the note editor pre-linked to that topic).
- Soft hint (not a block): moving to Explain without any linked postmortem shows "Did you break it first?"
- Topic detail drawer: description, stage history timeline, linked sessions, notes, postmortems, "Start session on this topic" button.
- Tabs below the board: Notes · Postmortems · Files · Sessions (all filtered to this project).

### 7.4 Notes

- List with search, filter by project/topic/tag/type, pinned notes first.
- Editor: title, markdown content with split preview, project/topic selectors, tags (create on the fly), file attachments (drag & drop files into the editor uploads them and inserts a markdown link/image).
- Code blocks with syntax highlighting (bash, yaml, hcl, dockerfile, python, go, json, sql at least).
- **Explain-it notes:** a note type with a template shown as placeholder:
  > Explain this concept in ~5 sentences as if teaching a colleague who has never seen it. What problem does it solve? How does it work? When would you not use it?
  Show explain-it notes with a distinct badge.
- Autosave (debounced) with a "saved" indicator.
- Export a single note as `.md`.

### 7.5 Postmortems

- List view (newest first), filter by project/topic, badge for deliberate (chaos) vs. real.
- Form with the fixed template fields: *Title · When · What broke · Symptoms · How I found the cause · Root cause · Fix · What I learned*. All markdown-capable.
- Link to project/topic and optionally to a chaos experiment. Attach files (screenshots, logs).
- **"Copy as Markdown"** button that outputs a clean, portfolio-ready postmortem (for pasting into a README or blog).

### 7.6 Chaos Lab

- List of experiments with category, difficulty (1–3 dots), done/not done.
- **"Pick one for me"** button: randomly picks an incomplete experiment (optional filter by category/difficulty) and shows it as a card with *Start session* and *Write postmortem* actions.
- Marking an experiment done prompts for a postmortem (pre-linked, `wasDeliberate = true`).
- Add/edit custom experiments.

Seed experiments (examples — write ~20 across categories):
- *Containers:* kill the DB container while the app is writing; run a container with a 50MB memory limit and watch it get OOM-killed; delete a named volume and recreate the stack; break the Dockerfile so the image builds but the app crashes on start.
- *Networking:* put two containers on different networks and debug why they can't talk; misconfigure a port mapping; break DNS resolution inside a container.
- *Storage:* fill the disk of a container/VM to 100%; corrupt a config file.
- *Config/secrets:* start the app with a missing env variable; rotate a DB password without updating the app.
- *Kubernetes:* give a pod a wrong image tag (ImagePullBackOff); set a liveness probe that always fails (CrashLoopBackOff); set CPU limits too low; apply a NetworkPolicy that blocks everything.
- *CI/CD:* push a commit that fails the pipeline and fix it; let a secret expire in CI.
- *Backups:* restore last night's backup into a fresh database and verify the data.

### 7.7 Weekly retros

- `/retros`: list of past retros; current week at top with "Write this week's retro" if missing.
- Form: *What did I ship?* · *What slowed me down?* · *Main bottleneck* (select from enum) · *One goal for next week* · *Energy 1–5*.
- While writing, show a sidebar with this week's auto-collected facts: sessions count and total minutes, topics that moved stages, postmortems written, artifacts published, reading items read. (So "what did I ship" is easy to answer.)
- Retro list shows a **bottleneck frequency chart** (bar chart of bottleneck tags over the last 12 weeks) — to reveal the recurring constraint.
- The latest `nextWeekGoal` is displayed on the Today screen.

### 7.8 Reading inbox

- Fast add: paste URL (title auto-fetched server-side from `<title>`/OpenGraph with a 5s timeout; fall back to the URL), optional tags.
- Tabs: Unread · Read · Archived.
- Marking as read asks for an optional one-line **takeaway**.
- Mobile-friendly: this is used on the commute.
- Reading does **not** count as a session or toward the streak (by design — passive input).
- Suggested starter tags: `postmortem`, `kubernetes`, `ai-infra`, `career`, `video`.

### 7.9 Artifacts

- Monthly view: one row per month (current month first), artifacts in that month with status pills (Idea → Draft → Published), kind, link.
- Current month without a published artifact gets a subtle highlight.
- "Promote" action: create an artifact from a postmortem or explain-it note (pre-fills title and links back to the source).

### 7.10 Work observations log

- Quick list of things noticed at the day job: *observation* + optional *question to ask a colleague*.
- Toggle resolved, with an *answer* field.
- Filter: open questions / all.

### 7.11 Files

- Upload via drag & drop or file picker (max size from `MAX_UPLOAD_MB`).
- Stored on disk at `/data/uploads/<uuid>.<ext>`; metadata in `FileAsset`.
- Grid/list view with thumbnail previews for images, icons for others; filter by project; search by name.
- Inline preview for images, PDFs (in an iframe/object), and text/code files (with highlighting).
- Download and delete (delete removes file from disk too). Show where a file is attached (notes/postmortems).
- Serve files only through an authenticated route (`/api/files/[id]`), never from a public folder. Sanitize filenames; set correct `Content-Type` and `Content-Disposition`.

### 7.12 Stats (`/stats`)

Only "proof" metrics. **Do not show total hours studied as a headline metric** (minutes can appear as secondary info in session lists).

- **Activity heatmap** (GitHub-style, last 365 days) — color = counted day / session count.
- Current and longest streak.
- **Sessions per week** (bar chart, last 12 weeks) with the weekly target line.
- **Sessions with visible output** — % per week.
- **Topics completed** (reached Done) over time.
- **Loop balance** — sessions per stage (Pain/Build/Break/Explain); highlight if Break or Explain is under 15% ("You're building but not breaking/explaining").
- Postmortems written (total, deliberate vs. real).
- Artifacts published per month.
- Reading items read per month.

### 7.13 Flashcards

- Create cards manually (front/back, markdown).
- Review mode: show front → reveal back → rate *Again / Hard / Good / Easy*; schedule with the **SM-2** algorithm.
- Due count shown in sidebar badge and Today nudges.
- Optional: "Generate flashcards from this note" (AI, see §8) — generated cards are shown for review/editing before saving.

### 7.14 Settings

- Weekly session target (default 5), minimum minutes for a counted day (default 10), week start (Monday).
- Theme.
- AI features status (enabled/disabled based on env), model in use.
- **Export everything:** download a `.zip` containing all notes/postmortems as markdown files (folder per project) + a full JSON dump of all tables + uploaded files.
- **Import** from that JSON export (for migrating to a new machine).
- Manage tags (rename/merge/delete).

---

## 8. AI features (optional — only if `ANTHROPIC_API_KEY` is set)

If the key is missing, hide all AI UI entirely. All AI calls happen server-side. AI is a **tutor**: it must give hints and questions, never complete solutions. Enforce this in system prompts.

1. **"I'm stuck" (15-minute rule)**
   - Button available during a running session.
   - Pressing it asks: *What are you trying to do? What have you tried? What happened?* (all required).
   - Then starts a **15-minute countdown**. Only when it reaches zero can the user request a hint. (The user can cancel and keep working; solving it themselves is the goal.)
   - The hint response must be a nudge: a question to ask, a concept to look up, a command to inspect state — **not** the solution. User can request up to 3 progressively stronger hints per stuck event.
   - Save the exchange as a note linked to the session's topic (type NOTE, tag `stuck`).

2. **Quiz me**
   - On a topic or project page: "Quiz me" generates 5 questions from the user's own linked notes and explain-it notes.
   - User answers in free text; AI grades each answer briefly (correct / partially / wrong + what's missing).
   - Offer to turn missed questions into flashcards.

3. **Check my explanation**
   - On an explain-it note: "Check my explanation" — AI points out errors, gaps, and vague parts, and asks one follow-up question. It must not rewrite the note.

4. **Generate flashcards from note**
   - Produces 3–8 Q/A pairs as JSON; user reviews/edits/deletes before saving.

Implementation notes: stream responses; handle API errors gracefully with a friendly message; keep prompts in a single `lib/ai/prompts.ts` file.

---

## 9. Non-functional requirements

- **Performance:** Today screen renders in well under 1 second on a local machine. Use server components and avoid client-side data waterfalls.
- **Data safety:** all destructive actions (delete project, note, file) require confirmation. Deleting a project asks whether to also delete linked notes/postmortems or just unlink them.
- **Validation:** validate all inputs with **zod** on the server.
- **Security:** auth middleware on everything; signed cookies; no secrets in client bundles; file route checks auth and prevents path traversal; CSRF protection is covered by server actions + SameSite cookies.
- **Accessibility:** keyboard navigable, visible focus states, proper labels.
- **Dates:** store UTC; display and compute "days" in `TZ`.
- **Empty states:** every list has a helpful empty state that explains the purpose of the feature in one sentence and offers the primary action.
- **Tests:** unit tests (Vitest) for streak calculation, SM-2 scheduling, week boundaries in TZ, and the Done-gate rule. A small Playwright smoke test (login → start session → stop session with next step → see it on Today) is a plus.
- **Code quality:** TypeScript strict mode, ESLint, Prettier. Clear folder structure (`app/`, `components/`, `lib/`, `prisma/`).

---

## 10. Out of scope

- Multiple users, sharing, or public pages.
- Native mobile apps (responsive web only).
- Integrations with GitHub/calendar (may come later; don't build now).
- Rich WYSIWYG editing (markdown + preview is enough).

---

## 11. Build order

Build everything, in this order, verifying each step works in Docker before moving on:

1. Docker Compose stack (app, db, backup), Prisma schema + migrations, health endpoint, auth.
2. Layout, sidebar, theme, global session indicator.
3. Projects + topics board (with WIP limit and Done gate).
4. Sessions (start/stop/manual log, required next step) + Today screen + streaks.
5. Notes (with full-text search, tags, attachments) + Files.
6. Postmortems + Chaos Lab (with seed data).
7. Weekly retros, Reading inbox, Artifacts, Work log.
8. Stats page.
9. Flashcards (SM-2).
10. Global search + quick capture.
11. Settings, export/import.
12. AI features (behind env flag).
13. Tests, README, final polish of empty states and mobile layout.

## 12. Definition of done

- `cp .env.example .env && docker compose up -d` on a clean machine brings up a working app at `http://localhost:3000`.
- `docker compose down && docker compose up -d` preserves all data and uploaded files.
- A nightly backup file appears in `./backups`, and the README's restore command successfully restores it.
- All features in §7 work; AI features work when a key is provided and are hidden when not.
- Unit tests pass.
