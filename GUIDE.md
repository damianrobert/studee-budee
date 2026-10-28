# How to use studee-budee

studee-budee is a study companion for learning DevOps / AI infrastructure on top of a full-time job. It doesn't hold course content. Its job is to keep you studying a little every day, to stop you hoarding tutorials, and to make you produce proof that you learned something. The whole app is built around this loop for every topic:

> **Pain → Build → Break → Explain**
> 1. **Pain:** do it by hand first, so you feel the problem.
> 2. **Build:** solve it properly with the tool.
> 3. **Break:** break it on purpose and debug it.
> 4. **Explain:** write it up in plain words.

## Getting started

```sh
cp .env.example .env     # set APP_PASSWORD, SESSION_SECRET, POSTGRES_PASSWORD
docker compose up -d
```

Open http://localhost:3000 and log in with `APP_PASSWORD`.

## A typical routine

**1. Set up a project (once).** Go to **Projects** and create one, for example "Deploy a Postgres-backed app on k8s". Give it a goal that says what "done" looks like. Only **one project can be active at a time**, on purpose, so you don't spread yourself thin. Add **topics** to its board (e.g. "Persistent volumes", "Ingress", "Health checks").

**2. Every day (10+ minutes counts).**
- Open **Today** (the home page). It shows the "next step" you wrote last time, so you never wonder where to start.
- Click **Start session**. A timer runs in the header.
- Work through your current topic and drag it across the board as you go (Pain → Build → Break → Explain → Done).
- Click **Stop**. You record what you did, whether you produced something (a commit link, a note) and, **required**, what's next. That becomes tomorrow's starting point.
- Your streak goes up for every day with at least 10 minutes of sessions.

**3. While you work:**
- **Notes**: markdown notes with tags, search and attachments. The **Explain-it** note type is your write-up for the Explain step. A topic **can't move to Done without one**.
- **Chaos Lab**: about 20 ready-made "break it" experiments (e.g. kill the DB container mid-write). Use **Pick one for me** to get a random one. When you finish it, the app asks you to write a postmortem.
- **Postmortems**: a template for what broke, symptoms, how you investigated, root cause, fix and lessons. Use one for real failures too. These are your best learning material.
- **Flashcards**: spaced repetition (SM-2). A badge shows how many cards are due for review.
- **Reading**: an inbox for links. When you mark one read, you write a one-line takeaway, so you don't just collect tabs.
- **Ctrl/Cmd+J** quickly captures a thought. **Ctrl/Cmd+K** searches everything.

**4. Weekly:** a **Retro** asks what you shipped, what slowed you down, your main bottleneck (time, energy, tutorial hell, …) and one goal for next week.

**5. Monthly:** **Artifacts** tracks public output like blog posts, diagrams and talks, from idea to draft to published. **Work log** is for things you notice at your day job that connect to what you're studying.

**6. Check in:** **Stats** shows your activity heatmap, streaks, sessions per week against your target, the share of sessions that produced output, and whether you skip the Break or Explain steps.

## How it actually helps

- **Small daily sessions plus a required next step** take away the "where was I?" friction that kills studying after work.
- **One active project** stops you jumping between tools.
- **The Done gate (you must explain it)** and **Break/Chaos** make you go past "I followed the tutorial and it worked." Breaking and explaining something is where the real understanding comes from.
- **It measures output, not hours watched.** Commits, postmortems and artifacts become a portfolio you can show.
- **Retros** surface what's really blocking you.

## AI tutor (optional)

With `GOOGLE_GEMINI_API_KEY` set in `.env`, a Gemini-powered tutor appears. It gives hints and questions, never full answers:

- **I'm stuck**: during a session, press the lifebuoy next to the timer. Write down what you're trying to do, what you tried and what happened, then keep working for 15 minutes. Only then can you ask for a hint, up to 3 per problem, each a bit stronger. Often you'll solve it before the timer runs out; press **I figured it out** and note what fixed it. Everything is saved as a note tagged `stuck`.
- **Quiz me**: on a project page or in a topic's drawer. Five questions from your own notes; answer in your own words and get them graded. Missed questions can become flashcards.
- **Check my explanation**: on an explain-it note. Points out errors, gaps and vague parts and asks one follow-up question, but doesn't rewrite your note.
- **Suggest cards with AI**: in the Flashcards dialog of a note. You edit or remove the suggestions before anything is saved.

Final polish (build step 13) isn't done yet.

## First steps

Create one small project, add 3–5 topics, and do a 15-minute Pain session today.
