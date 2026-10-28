# studee-budee

A single-user, self-hosted web app for studying DevOps / AI infrastructure alongside a full-time job: small daily sessions, one project at a time, and every topic taken through **Pain → Build → Break → Explain**. See [SPEC.md](SPEC.md) for the full design and [progress.md](progress.md) for build status.

## Quick start

```sh
cp .env.example .env      # then set APP_PASSWORD, SESSION_SECRET and POSTGRES_PASSWORD
docker compose up -d
```

Open <http://localhost:3000> and sign in with `APP_PASSWORD`.

`POSTGRES_PASSWORD` must match the password inside `DATABASE_URL`. Generate a session secret with `openssl rand -hex 32`.

## Services

| Service | What it does |
|---|---|
| `app` | Next.js app on port `APP_PORT` (default 3000). Applies DB migrations on start. Health: `GET /api/health` |
| `db` | PostgreSQL 16, data in the `pgdata` volume |
| `backup` | Runs `pg_dump` daily at 02:00 (`TZ`) into `./backups`, keeping the newest 14 dumps |

Uploaded files live in the `uploads` volume. `docker compose down` / `up -d` keeps all data; `down -v` **deletes it**.

## AI tutor (optional)

Set `GOOGLE_GEMINI_API_KEY` in `.env` (get one at <https://aistudio.google.com/apikey>) and run `docker compose up -d`. Without a key, all AI buttons are hidden. The model is `gemini-3.5-flash` by default; set `GEMINI_MODEL` to use another (e.g. `gemini-2.5-flash`). Settings shows the status and the model in use.

**Roadmaps** (`/roadmaps`) plan a learning path from a prompt and find resources for every step. Set `BRAVE_SEARCH_API_KEY` (<https://brave.com/search/api/>) so resources come from real web search results; without it the AI suggests links from memory, marked as unchecked. Creating a roadmap uses one Brave search per step query (roughly 20–40 for a full roadmap).

**Courses** (`/courses`) are built from a resources file you gather with your own LLM subscription, so the app's API key does very little. Copy the prompt from **Prompt for your LLM** on the Courses page (also in `templates/prompt-1-gather-resources.md`), paste it into ChatGPT/Claude/Gemini with web search on, and save the answer as a `.yaml` file (`templates/resources-template.yaml` is an example). **New course** checks the file, then either lets Gemini arrange it into modules with practice tasks and checkpoint questions (one request, no web search) or groups it by topic with no AI at all. Rebuilding from an updated file keeps what you've marked done.

The AI gives hints and questions, not answers:

- **I'm stuck** (header, during a session): write down what you're trying to do, what you tried and what happened, then keep working. A hint unlocks after 15 minutes, and you get up to 3, each a bit stronger. The exchange is saved as a note tagged `stuck`.
- **Quiz me** (project page and topic drawer): 5 questions from your own notes, your answers graded, missed ones turned into flashcards if you want.
- **Check my explanation** (explain-it notes): errors, gaps and vague parts, plus one follow-up question. It never rewrites the note.
- **Suggest cards with AI** (Flashcards button on a note): 3–8 cards to edit or drop before saving.

Prompts live in `lib/ai/prompts.ts`.

## Backups

Take one right now:

```sh
docker compose exec backup /backup.sh now
```

Restore a dump (this replaces the current data):

```sh
docker compose stop app
docker compose exec -T db pg_restore -U studee -d studee --clean --if-exists --no-owner \
  < backups/studee-YYYY-MM-DD_HHMMSS.dump
docker compose start app
```

Use your `POSTGRES_USER` / `POSTGRES_DB` values if you changed them. Note that database dumps don't include uploaded files; back up the `uploads` volume separately, or use the in-app export below.

## Export and import

**Settings → Export** downloads `studee-budee-export-YYYY-MM-DD.zip`:

- `data.json`: every table, for importing
- `markdown/<project>/notes/*.md` and `markdown/<project>/postmortems/*.md` (`_no-project/` for the rest), with file links pointing into `files/`
- `files/`: the uploaded files (untick "Include uploaded files" for a small archive)

**Settings → Import** takes that zip (or just its `data.json`) and **replaces all data** with it, e.g. to move to a new machine: `docker compose up -d` there, sign in, import. The file is checked before anything changes, and the database part runs in one transaction. Files are unpacked first and moved into place only after it commits. Uploads that no file record points to any more are removed.

## Tests

Node isn't needed on the host; run tooling in containers.

```sh
# Unit tests (streaks, week boundaries in TZ, Done gate, file handling, postmortem export, chaos picker,
# retro weeks, reading titles, artifact months, stats, SM-2 scheduling, search links, zip + export format,
# AI: stuck notes, prompts, model output parsing, Gemini client)
docker run --rm -v "$PWD":/app -w /app node:22-alpine npx vitest run

# End-to-end, against a fresh throwaway stack on port 3100 (your real data is untouched)
APP_PORT=3100 docker compose -p studee-e2e up -d db app
docker run --rm --network host -e E2E_BASE_URL=http://localhost:3100 -e APP_PASSWORD=<your password> \
  -v "$PWD":/app -w /app mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test
docker compose -p studee-e2e down -v
```

`e2e/zz-roadmaps.spec.ts` generates a tiny roadmap with the real Gemini API (and Brave Search when `BRAVE_SEARCH_API_KEY` is set: ~10 searches per run).

`e2e/zz-courses.spec.ts` builds a course from the example file without AI, plus one tiny course with the real Gemini API when there's a key.

`e2e/zz-mentor.spec.ts` asks Gemini for project ideas, starter topics and a few mentor answers.

`e2e/zz-ai.spec.ts` makes a handful of small requests to the real Gemini API when `.env` has a key; without one it checks that the AI UI is hidden.

## Updating

```sh
git pull && docker compose up -d --build
```
