# studee-budee: Philosophy and Architecture

Read this first if you're an AI agent (or a human) new to this codebase. It explains **why** the app is built the way it is and **how** the pieces fit together, so you can make changes that match the rest of it.

Related documents:

- [SPEC.md](SPEC.md): the original product spec. It's the source of truth for features. Where the code differs from it on purpose, this file or `progress.md` says so.
- [progress.md](progress.md): the build log, step by step, with a **Decisions / notes** section at the bottom. Read that section before you change anything non-trivial.
- [README.md](README.md): operator docs (run, back up, restore, test).
- [GUIDE.md](GUIDE.md): user docs (how to study with the app).

---

## 1. What this app is

A **single-user, self-hosted** study companion for one person learning DevOps / AI infrastructure alongside a full-time job. It holds no course content. Its job is to shape **habits**: study a little every day, finish things, break things on purpose, explain what you learned, and produce visible proof.

The whole stack starts with `docker compose up -d`. There is one user, one password, no user table, no multi-tenancy. Don't add any of that.

## 2. Philosophy (product)

Every feature exists to reinforce one of these principles (SPEC §1). **When you're unsure how to build something, pick the option that serves them best.**

1. **Small daily sessions beat long binges.** A day with ≥ `minSessionMinutes` (default 10) of sessions counts toward the streak.
2. **Always know the next step.** Stopping a session *requires* a "what's next" text, and the Today screen shows it first thing next time.
3. **One project at a time.** Only one project can be `ACTIVE` (WIP limit = 1). Activating another pauses the current one.
4. **The learning loop: Pain → Build → Break → Explain → Done.** Every topic moves across a board through these stages.
   - A topic **cannot reach Done without an `EXPLAIN_IT` note**. This is enforced on the server (`moveTopic` in `lib/actions/projects.ts`), not just in the UI.
   - Moving to Explain without a postmortem shows a soft hint, "Did you break it first?". It's a nudge, not a block.
5. **Proof over knowledge.** Track outputs (commits, postmortems, published artifacts), never hours watched. Stats deliberately **don't headline hours**; minutes only show up in tooltips.
6. **Failure is the curriculum.** Postmortems and Chaos Lab experiments are first-class features.
7. **AI as tutor, not crutch.** AI gives hints, questions and critique, **never complete solutions**, and only after an honest attempt (e.g. "I'm stuck" makes you wait 15 minutes before the first hint).

UI tone: **calm, fast, uncluttered.** The user arrives tired after work. The home screen must let them start a session in one click. It has to work fully on a phone (reading inbox and quick capture get used on mobile). Nudges are capped at 2 at a time, and the app avoids nagging new users (e.g. the loop-balance warning only appears after 8 tagged sessions).

## 3. Philosophy (engineering)

- **No separate backend.** Next.js App Router with server components for reads and **server actions** for writes. API routes exist only where a server action doesn't fit: streaming, file bytes, big bodies, health.
- **Few dependencies, all pinned to exact versions.** Things that would usually pull in a library are often hand-written: the zip reader/writer (`lib/zip.ts`), the Gemini REST client and SSE parser (`lib/ai/gemini.ts`), shadcn-style UI primitives (`components/ui/`, hand-copied, no shadcn CLI), an HCL highlight grammar (`lib/hljs-hcl.ts`). Before adding a dependency, check whether a small local module would do.
- **The database is the state.** Running sessions live in the DB, so they survive reloads. The "I'm stuck" flow keeps its state in a note: its `createdAt` drives the countdown and `## Hint N` sections hold the hints. Prefer this over client state or new ad-hoc tables.
- **Pure logic in `lib/*.ts`, tested with Vitest.** Streaks, TZ day math, SM-2, stats windows, export format, plan merging, prompt building and so on are pure functions. Pages and actions are thin layers over them.
- **Enforce rules on the server.** The client may pre-check for UX, but the server action is the real gate (Done gate, single running session, WIP limit, topic belongs to project, chaos link forces `wasDeliberate`).
- **Time is always in the app timezone (`TZ`, default `Europe/Bucharest`).** All "day", "week" (Monday start) and "month" logic goes through `lib/time.ts` day keys (`YYYY-MM-DD`). Don't use `new Date().getDate()` or similar for business logic. DST is handled and tested.
- **Optional integrations degrade cleanly.** No Gemini key means every AI button is hidden and the AI routes return 404. No Brave key means roadmap links are marked "suggested by AI, not checked".
- **Prose style in UI and docs:** plain, short, concrete. No filler or flattery, in the app copy and in AI prompts alike.

## 4. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router, `output: "standalone"`), React 19.1, TypeScript strict |
| Styling | Tailwind v4 (CSS tokens in `app/globals.css`), hand-copied shadcn-style components on `radix-ui` + `cva` + `tailwind-merge`, Lucide icons |
| DB | PostgreSQL 16 via Prisma 6.19 |
| Validation | zod 3 |
| Auth | `jose` HS256 JWT in an HttpOnly cookie |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` (lowlight). No raw HTML. |
| Charts | Recharts 3 (client components only) |
| DnD | `@dnd-kit` (board) |
| AI | Google Gemini over REST (no SDK). **Not Anthropic**, despite what SPEC.md says: the user chose Gemini. Brave Search for roadmap resources. |
| Tests | Vitest (`tests/`), Playwright (`e2e/`) |

## 5. Repository layout

```
app/
  (app)/            authenticated pages; layout.tsx = sidebar + header + session timer
    page.tsx        Today (home)
    projects/ notes/ postmortems/ chaos/ retros/ reading/ artifacts/
    work/ flashcards/ files/ stats/ sessions/ settings/ roadmaps/
  api/              route handlers: health, files, search, export, import, notes/[id]/export, ai/{hint,check}
  login/            login page + server action
  globals.css       design tokens (light/dark, stage colours, heat ramp, chart colour), markdown + hljs styles
components/
  ui/               primitives (Button, Dialog/drawer, Confirm, Card, Badge, Input/Field, EmptyState, PageHeader)
  shell/            sidebar, header, nav, global search (Ctrl+K), quick capture (Ctrl+J)
  <feature>/        one folder per feature (projects, sessions, notes, ai, roadmaps, …)
lib/
  actions/*.ts      server actions ("use server"), one file per feature
  ai/               Gemini client, config, prompts, streaming, stuck-flow, roadmap research
  auth/             session cookie, password check, rate limit, same-origin check
  *.ts              pure domain logic + DB read helpers per feature
prisma/
  schema.prisma
  migrations/       hand-checked SQL migrations (incl. seed data and tsvector columns)
docker/             entrypoint.sh (runs migrations), backup.sh (nightly pg_dump loop)
tests/              Vitest unit tests for lib/
e2e/                Playwright specs (zz-* run last; zz-ai/zz-roadmaps/zz-courses hit real APIs)
middleware.ts       auth gate for everything except /login, /api/health, /api/import
```

## 6. Request flow and core patterns

### Reads
Server components query Prisma directly (`import { db } from "@/lib/db"`) or call read helpers in `lib/<feature>.ts`. They run queries in parallel with `Promise.all`. Pages are dynamic, so they're fresh on navigation.

### Writes: server actions
All writes go through `lib/actions/<feature>.ts`:

```ts
"use server";
const schema = z.object({ ... });
export async function doThing(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  // enforce rules, write with db
  revalidatePath("/", "layout");   // so header timer / badges refresh
  return { ok: true };
}
```

- Actions take **typed objects**, not `FormData`, and return `ActionResult<T>` (`lib/utils.ts`): `{ ok: true, data? } | { ok: false, error, code? }`. They don't throw for expected failures. `code` carries machine-readable cases like `"exists:<id>"`.
- Dates from the browser come in as ISO strings with an offset (`z.string().datetime({ offset: true })`).
- `emptyToNull()` for optional text fields.
- `UserError` (with an HTTP status) marks messages that are safe to show. Anything else gets logged and replaced by a generic message.
- **Exception, autosaving editors:** `createNote` / `updateNote` do **not** revalidate, because a re-render would remount the editor mid-typing. Follow this pattern for any new autosaving editor.

### URL state
Filters, tabs, open drawers and highlighted rows live in **query params** (`?tab=`, `?topic=`, `?step=`, `?hl=`, `?fromNote=`, `?done=`), not client state or `#hash`. That keeps pages server-rendered and links shareable. Tab and filter strips are plain `<Link>`s with `aria-current`.

### Auth
`middleware.ts` verifies the `sb_session` JWT on every route except `/login`, `/api/health` and `/api/import`. Pages redirect to `/login?from=…`; APIs get 401. `/api/import` is left out of the matcher **on purpose** (the middleware would buffer its large body), so it checks the cookie and `Origin` itself. Login is rate-limited to 5/min (one global bucket unless `TRUST_PROXY=true`).

### Theme
`sb_theme` cookie (system/light/dark), read in the root layout so there's no flash. Colours are CSS variables in `globals.css` with light and dark values.

## 7. Domain model (Prisma)

Core: `Project` → `Topic` (has a `stage: LoopStage` and a `position`) → `TopicStageChange` (every board move is recorded). `Session` (optional project/topic; `endedAt = null` means running, and only one may run at a time). `Note` (`NOTE` | `EXPLAIN_IT`), `Postmortem` (six template fields), `ChaosExperiment`, `WeeklyRetro` (unique `weekStart` = Monday 00:00 in TZ), `ReadingItem`, `Artifact` (per `targetMonth`, optional source note/postmortem), `WorkObservation`, `FileAsset` (metadata; bytes on disk), `Tag` (many-to-many with notes, postmortems, reading, observations), `Flashcard` (SM-2 fields, optional source note), `Setting` (key/value).

Roadmaps (beyond the spec): `Roadmap` → `RoadmapStage` → `RoadmapStep` → `RoadmapResource` (+ `RoadmapEdit` prompt history), all cascading from the roadmap.

Courses (beyond the spec): `Course` → `CourseModule` → `CourseItem` / `CoursePractice` / `CourseCheckpoint`, all cascading from the course. `Course.source` keeps the imported resources file so the course can be rebuilt; `CourseItem.resourceKey` is the resource's id in that file, which is how "done" survives a rebuild.

Relations to projects/topics generally use `onDelete: SetNull`, so deleting a project doesn't silently destroy notes. The project delete flow asks the user whether to unlink or delete them.

### Migrations: hand-checked
- `searchVector` columns (on Note, Postmortem, Topic, ReadingItem, WorkObservation) are **generated `tsvector` columns** with GIN indexes, declared in Prisma as `Unsupported("tsvector")?`. The app never writes them. When you generate a migration with `prisma migrate diff`, **remove any statements that touch these columns**.
- **Seed data lives in migrations** (`0002_seed_chaos`: 21 chaos experiments), not in a seed script, so it runs exactly once and needs no extra tooling.
- The entrypoint runs `prisma migrate deploy` on every container start.

### Checklist for a new table or column
1. Schema + migration (give new optional columns a default).
2. `lib/export-format.ts`: zod schema, `TABLE_LABELS`, reference checks.
3. `lib/backup.ts`: `loadExportData()`, `replaceAll()`, `ALL_TABLES`.
4. Older exports must still import. Bump `EXPORT_VERSION` only for breaking changes.

## 8. Feature subsystems (where to look)

| Area | Key files | Notes |
|---|---|---|
| Sessions + streaks | `lib/sessions.ts`, `lib/streak.ts`, `lib/actions/sessions.ts` | Streak = consecutive counted days ending today or yesterday; minutes summed per TZ day in SQL. Forgotten-session banner after 4 h. |
| Board | `lib/board.ts`, `lib/actions/projects.ts`, `components/projects/board.tsx` | Done gate on the server; collision detection prefers `pointerWithin`. |
| Notes + files | `lib/notes.ts`, `lib/files.ts`, `lib/uploads.ts`, `app/api/files/` | Uploads go to `/data/uploads/<uuid>.<ext>`. Inline serving only for safe types; `CSP: sandbox` + `nosniff`. A note's files = the files its content links to, recomputed on save. |
| Search | `lib/search.ts` (server), `lib/search-hits.ts` (client-safe) | `websearch_to_tsquery` OR title ILIKE; snippets marked with chr(1)/chr(2), rendered by `components/search-snippet.tsx` (never as HTML). |
| Stats | `lib/stats.ts`, `components/stats/` | Each chart has an `sr-only` table inside an `sr-only` div (a bare sr-only table causes horizontal scroll on phones). |
| Flashcards | `lib/flashcards.ts` | Pure SM-2, shared by client and server; due dates at local midnight in TZ. |
| Nudges | `lib/nudges.ts` | Priority order from SPEC §7.1, max 2. |
| Export/import | `lib/zip.ts`, `lib/export-format.ts`, `lib/backup.ts`, `app/api/{export,import}` | Import replaces everything in one transaction; files are staged and moved into place only after commit. |
| AI | `lib/ai/*`, `components/ai/*`, `app/api/ai/*` | See below. |
| Roadmaps | `lib/roadmaps.ts`, `lib/actions/roadmaps.ts`, `lib/ai/{research,roadmap,brave}.ts` | Gemini plans → Brave searches → Gemini picks results **by id only**, so every link is a real search hit. Edits merge by id (`mergePlan`). |
| Courses | `lib/courses.ts`, `lib/actions/courses.ts`, `lib/ai/course.ts`, `templates/` | The user's own LLM gathers a resources file (prompt in `templates/`); the app checks it (in the browser too), then Gemini arranges it **referring to resources by id only**, or `planByTopic` groups it for free. No web search. |

### AI rules
- `lib/ai/config.ts` is **server-only**. Never import it from a client component. Pass `aiEnabled()` down as an `ai` prop.
- **Every prompt lives in `lib/ai/prompts.ts`**, and every system prompt starts with the shared `TUTOR` rules (no complete solutions). Keep it that way. Weakening these rules goes against principle 7.
- AI server actions go through `runAi()` (`lib/ai/run.ts`). Streamed answers go through `aiRoute()` + `streamText()` (`lib/ai/stream.ts`), which waits for the first chunk so early errors get a real status code.
- Structured output uses `responseSchema` and is always **re-validated with zod**. Gemini refuses schemas with nested `maxItems`, so cap sizes in the parser instead.
- Model: `gemini-3.5-flash` by default (`GEMINI_MODEL` overrides it).

## 9. Deployment

`docker-compose.yml` runs three services, all `restart: unless-stopped`:
- **app**: multi-stage Dockerfile (deps → migrator → build → slim runtime), non-root uid 1001, healthcheck on `/api/health`. The Prisma CLI is copied in from a separate `migrator` stage because the standalone output leaves it out.
- **db**: `postgres:16-alpine`, `pgdata` volume.
- **backup**: shell loop (`docker/backup.sh`), `pg_dump -Fc` daily at 02:00 TZ into `./backups`, keeps the newest 14.

Uploads live in the `uploads` volume. `next.config.ts` raises `middlewareClientMaxBodySize`, because Next 15.5's middleware silently truncates bodies over 10 MB. The real per-file limit is `MAX_UPLOAD_MB`, checked in the upload route.

Env vars beyond the spec: `COOKIE_SECURE`, `TRUST_PROXY`, `GOOGLE_GEMINI_API_KEY`, `GEMINI_MODEL`, `BRAVE_SEARCH_API_KEY`. See `.env.example`.

## 10. Working on this repo

- **No Node on the host.** Run tooling in a container:
  `docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/app -w /app node:22-alpine npx <tsc --noEmit | vitest run | eslint . | prisma …>`
- E2E runs against a throwaway compose project on port 3100 (see README → Tests). Some specs expect a fresh DB, so run `down -v` between runs. Specs that call real AI APIs run last (`zz-*`).
- A step counts as finished when typecheck, lint, unit and e2e pass and the change works in Docker, including at phone width (360–390 px, no horizontal scroll). `progress.md` records each step. Keep adding to it.
- Formatting: Prettier (`.prettierrc.json`). Match the existing style: small files, short doc comments only where something is non-obvious, named exports, `@/` imports.

## 11. Current state

Steps 1–12 of the SPEC build order are done, plus Roadmaps (an addition the user asked for). **Step 13 (tests + polish: empty states, mobile layout, final README) is still open**, and the §12 Definition of Done checklist in `progress.md` hasn't been ticked yet. Known loose end: `discardRunningSession` exists in `lib/actions/sessions.ts` but has no UI.
