// Every prompt the app sends to the model lives here. The tutor rules are part of each
// system prompt: the AI gives hints and questions, never complete solutions.

import { ITEM_TYPE_LABEL, fmtTimestamp, type Library } from "@/lib/courses";
import { IDEA_COUNT, type MentorFacts, type MentorTurn } from "./mentor";
import { PICKS_MAX } from "./roadmap";
import { MAX_HINTS, type StuckState } from "./stuck";

const TUTOR = `You are the tutor inside studee-budee, a study app for one person learning DevOps and AI infrastructure alongside a full-time job. They learn every topic through the loop Pain → Build → Break → Explain.

You are a tutor, not a crutch:
- Give hints, questions and pointers. Never give a complete solution: no full fix, no finished config file or command sequence that solves it, no rewritten version of their work.
- Be brief, concrete and plain. No filler, no flattery, no motivational padding.
- Use markdown sparingly (short lists, \`inline code\` for commands, flags and file names).`;

export type NoteForPrompt = {
  id: string;
  title: string;
  type: "NOTE" | "EXPLAIN_IT";
  content: string;
};
export type PromptContext = {
  project?: string | null;
  topic?: string | null;
  topicDescription?: string | null;
};

/** Total characters of notes sent with a quiz (roughly 25k tokens). */
export const NOTES_BUDGET = 100_000;
const NOTE_MAX = 20_000;

function contextLines(ctx: PromptContext): string {
  const lines = [
    ctx.project && `Project: ${ctx.project}`,
    ctx.topic && `Topic: ${ctx.topic}`,
    ctx.topicDescription && `Topic description: ${ctx.topicDescription}`,
  ].filter(Boolean);
  return lines.length ? `${lines.join("\n")}\n\n` : "";
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[…cut]` : text;
}

/** The notes as tagged blocks, explain-it notes first, within the character budget. */
export function notesBlock(notes: NoteForPrompt[], budget = NOTES_BUDGET): string {
  const sorted = [...notes].sort(
    (a, b) => Number(b.type === "EXPLAIN_IT") - Number(a.type === "EXPLAIN_IT"),
  );
  const out: string[] = [];
  let left = budget;
  for (const n of sorted) {
    if (left <= 500) break;
    const body = cut(n.content.trim(), Math.min(NOTE_MAX, left));
    left -= body.length;
    const type = n.type === "EXPLAIN_IT" ? "explain-it" : "note";
    const title = n.title.replace(/"/g, "'");
    out.push(`<note id="${n.id}" title="${title}" type="${type}">\n${body}\n</note>`);
  }
  return out.join("\n\n");
}

// --- I'm stuck

const HINT_LEVELS = [
  "Hint 1 of 3, the gentlest: 1–2 sentences. One question that points their attention at the right place (a word in the error, an assumption they made, a piece of state they haven't looked at). Don't explain anything, don't name the cause or the concept behind it.",
  "Hint 2 of 3, stronger: at most 4 sentences. Name the concept or area involved and suggest one command, log or piece of state to inspect, and what to look for in it. Don't state the cause outright and don't say what the fix is.",
  "Hint 3 of 3, the strongest: at most 5 sentences. Name the most likely cause as a hypothesis and how to confirm it. Leave working out and applying the fix to them: don't write the corrected command, config or code.",
];

export const STUCK_SYSTEM = `${TUTOR}

The learner pressed "I'm stuck" after working on a problem on their own for 15 minutes. They get at most 3 hints, each a bit stronger than the last, so hold back: a hint that gives away more than its level asks for robs them of the chance to figure it out. Give only the hint asked for, building on earlier hints without repeating them. End with one question they should try to answer next.`;

export function hintPrompt(state: StuckState, ctx: PromptContext): string {
  const level = state.hints.length;
  const earlier = state.hints.length
    ? `\n\nHints you already gave:\n${state.hints.map((h, i) => `Hint ${i + 1}: ${h}`).join("\n\n")}`
    : "";
  return `${contextLines(ctx)}What I'm trying to do:
${state.goal}

What I've tried:
${state.tried}

What happened:
${state.happened}${earlier}

Give ${HINT_LEVELS[Math.min(level, MAX_HINTS - 1)]}`;
}

// --- Check my explanation

export const CHECK_SYSTEM = `${TUTOR}

You review an "explain-it" note: the learner's own explanation of a concept, written as if teaching a colleague who has never seen it. A good one says what problem the concept solves, how it works, and when you would not use it, in about 5 sentences.

Point out what needs work. Do not rewrite the note and do not write replacement sentences or a corrected explanation: say what is wrong or missing and where to look, and let them fix it.

Answer in markdown with exactly these sections:
### Errors
Statements that are wrong or misleading, quoting a few words of each.
### Gaps
What's missing (problem it solves, how it works, when not to use it, or anything important).
### Vague
Phrases that hide understanding behind buzzwords or hand-waving, quoting a few words of each.
### Follow-up question
Exactly one question that probes whether they really understand it.

Write "None." for an empty section. Keep the whole review under 250 words.`;

export function checkPrompt(note: { title: string; content: string }, ctx: PromptContext): string {
  return `${contextLines(ctx)}Concept: ${note.title}

<explanation>
${cut(note.content.trim(), NOTE_MAX)}
</explanation>`;
}

// --- Quiz me

export const QUIZ_COUNT = 5;

export const QUIZ_SYSTEM = `${TUTOR}

Write exactly ${QUIZ_COUNT} quiz questions that test whether the learner understands their own notes. Use what the notes cover (and concepts they directly imply), not unrelated trivia. Prefer "why", "what happens if", "how would you check" and "compare" questions over recall of exact syntax. Each must be answerable in 1–3 sentences. Don't include the answers. For each question give the id of the note it's mainly based on.`;

export function quizPrompt(notes: NoteForPrompt[], ctx: PromptContext): string {
  return `${contextLines(ctx)}My notes:\n\n${notesBlock(notes)}`;
}

export const GRADE_SYSTEM = `${TUTOR}

Grade the learner's quiz answers, using their notes and correct technical knowledge. For every question, in order:
- verdict: "correct", "partial" or "wrong". A blank answer or "I don't know" is wrong. Be fair: different wording that shows the right understanding is correct.
- feedback: one or two sentences. If correct, say briefly what made it right. Otherwise say what's missing or wrong as a pointer; don't write out the full answer here.
- answer: a concise correct answer (1–3 sentences), only used as the back of a flashcard if they choose to make one after seeing their grade.`;

export function gradePrompt(
  notes: NoteForPrompt[],
  ctx: PromptContext,
  items: { question: string; answer: string }[],
): string {
  const qa = items
    .map(
      (it, i) =>
        `<question n="${i + 1}">\n${it.question}\n</question>\n<my-answer n="${i + 1}">\n${it.answer.trim() || "(blank)"}\n</my-answer>`,
    )
    .join("\n\n");
  return `${contextLines(ctx)}My notes:\n\n${notesBlock(notes)}\n\nThe quiz and my answers:\n\n${qa}`;
}

// --- Flashcards from a note

export const CARDS_MIN = 3;
export const CARDS_MAX = 8;

export const CARDS_SYSTEM = `${TUTOR}

Make ${CARDS_MIN}–${CARDS_MAX} flashcards from the learner's note (fewer for a short note). Rules:
- One idea per card. The front is a specific question; the back is short (at most 3 sentences or a short code snippet).
- Take the facts from the note. Don't add facts the note doesn't contain.
- Prefer understanding (why, when, what happens if) over trivia, but do include the key commands, flags and ports the note mentions.
- Markdown is fine; put commands and code in backticks.`;

export function cardsPrompt(note: { title: string; content: string }): string {
  return `Note title: ${note.title}\n\n<note>\n${cut(note.content.trim(), NOTES_BUDGET)}\n</note>`;
}

// --- Roadmaps

export type RoadmapForPrompt = {
  title: string;
  summary: string | null;
  prompt: string;
  stages: {
    id: string;
    title: string;
    description: string | null;
    steps: {
      id: string;
      title: string;
      description: string | null;
      practice: string | null;
      status: string;
      resources: { title: string; url: string }[];
    }[];
  }[];
};

export type StepForResearch = {
  key: string;
  title: string;
  description: string | null;
  stage: string;
  /** Links the step already has, so the model doesn't pick them again. */
  existing: { title: string; url: string }[];
  results: { id: string; title: string; url: string; description: string }[];
};

const PLANNER = `${TUTOR}

Here you plan learning roadmaps: an ordered path from where the learner is to the goal they describe.
- Stages are the big phases, in the order they should be learned. Steps are concrete topics inside a stage, each small enough to learn in a few evening sessions.
- Size it to the goal and don't compress: cover everything needed to actually reach it. A broad goal ("from zero to running X in production") needs about 5–8 stages of 3–6 steps; a narrow one ("Docker volumes") can be 2–3 stages. Follow the learner if they ask for a size.
- Fit the learner: about an hour a day around a full-time job, learning by doing. Skip basics they say they already know.
- Every step gets one hands-on practice task in the spirit of the loop: do it by hand first, build it, or break it on purpose and debug it. Describe the task, never its solution.
- Every step gets 1–2 precise web search queries that would surface the best resources for it (official docs, well-known tutorials, talks, labs): name the technology and the specific concept, e.g. "kubernetes network policies tutorial", not "learn networking".
- Don't put links in the plan; resources are found separately.`;

export const ROADMAP_SYSTEM = `${PLANNER}

Plan a new roadmap from the learner's request. Give it a short title (≤ 6 words) and a 1–2 sentence summary.`;

export function roadmapPrompt(request: string): string {
  return `What I want to learn:\n${request.trim()}`;
}

function roadmapBlock(r: RoadmapForPrompt): string {
  return JSON.stringify(
    {
      title: r.title,
      summary: r.summary,
      originalRequest: r.prompt,
      stages: r.stages.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        steps: s.steps.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          practice: t.practice,
          status: t.status,
          resources: t.resources.map((x) => x.title),
        })),
      })),
    },
    null,
    1,
  );
}

export const ROADMAP_REVISE_SYSTEM = `${PLANNER}

Revise an existing roadmap as the learner asks, and return the whole roadmap as it should be afterwards.
- Keep the "id" of every stage and step you keep, even when you rename, rewrite or move it. Leave "id" out for new stages and steps. Leave out what should be removed.
- Change only what the request asks for; everything else comes back as it was (same order, same text). Never remove steps whose status is DONE or DOING unless asked to.
- Set "findResources" to true on existing steps that should get more or different resources (e.g. "find more resources for stage 2", "add videos"), and give search queries that match the request, e.g. add "video" or "interactive lab". New steps always get resources.
- "changeSummary" says in 1–2 sentences what you changed.`;

export function roadmapRevisePrompt(
  r: RoadmapForPrompt,
  request: string,
  focus: { title: string } | null,
): string {
  const scope = focus ? `\n\nThe request is about the stage "${focus.title}".` : "";
  return `The roadmap now:\n${roadmapBlock(r)}${scope}\n\nWhat I want changed:\n${request.trim()}`;
}

export const STEP_REVISE_SYSTEM = `${PLANNER}

Revise one step of a roadmap as the learner asks. Return the step's title, description and practice task (unchanged unless the request is about them). Set "findResources" to true when the request asks for more or different resources, with 1–3 search queries matching it (e.g. add "video" when they want videos, "beginner" when they want something easier). "changeSummary" says in 1–2 sentences what you changed or will look for.`;

export function stepRevisePrompt(
  r: { title: string; summary: string | null },
  stage: string,
  step: RoadmapForPrompt["stages"][number]["steps"][number],
  request: string,
): string {
  const resources = step.resources.length
    ? step.resources.map((x) => `- ${x.title} (${x.url})`).join("\n")
    : "(none yet)";
  return `Roadmap: ${r.title}${r.summary ? ` — ${r.summary}` : ""}
Stage: ${stage}

Step: ${step.title}
Description: ${step.description ?? ""}
Practice: ${step.practice ?? ""}
Resources it has:
${resources}

What I want:
${request.trim()}`;
}

const PICK_RULES = `Pick the best resources for each step: up to ${PICKS_MAX}, usually 3–4, fewer when nothing is good.
- Prefer official documentation, well-known authors and projects, hands-on tutorials and labs, and talks from conferences. Prefer free and current material.
- Skip SEO content farms, thin listicles, paywalled pages, outdated material (old major versions), forum threads and duplicates of something already picked or already on the step.
- Mix kinds when the material allows it (docs + a tutorial + a video), unless the learner asked for one kind.
- "title" is a clean, short name for the resource. "note" is one sentence on what it covers and how to use it for this step.`;

export const PICK_SYSTEM = `${PLANNER}

You get the steps of a roadmap with web search results for each. ${PICK_RULES}
- Only pick from the search results given for that step, referring to them by their id. Never invent a result.`;

export const SUGGEST_SYSTEM = `${PLANNER}

You get the steps of a roadmap. ${PICK_RULES}
- Web search isn't available, so only suggest resources you're certain exist at that exact URL (official docs and long-standing, well-known pages). Fewer is better than a broken link.`;

export function pickPrompt(steps: StepForResearch[], request: string | null): string {
  const blocks = steps.map((s) => {
    const existing = s.existing.length
      ? `\nAlready on this step:\n${s.existing.map((x) => `- ${x.title} (${x.url})`).join("\n")}`
      : "";
    const results = s.results.length
      ? `\nSearch results:\n${s.results.map((x) => `[${x.id}] ${x.title} — ${x.url}\n    ${x.description.slice(0, 300)}`).join("\n")}`
      : "";
    return `<step key="${s.key}">\nStage: ${s.stage}\nStep: ${s.title}\n${s.description ?? ""}${existing}${results}\n</step>`;
  });
  const wish = request ? `\n\nWhat the learner asked for:\n${request.trim()}` : "";
  return `${blocks.join("\n\n")}${wish}`;
}

// --- Project mentor

const STAGE_ORDER = ["PAIN", "BUILD", "BREAK", "EXPLAIN", "DONE"] as const;
const STAGE_LABEL: Record<string, string> = {
  PAIN: "Pain",
  BUILD: "Build",
  BREAK: "Break",
  EXPLAIN: "Explain",
  DONE: "Done",
};
const one = (s: string, max = 300) => cut(s.replace(/\s+/g, " ").trim(), max);

/** Everything the app knows about a project, as the mentor sees it. */
export function mentorContextBlock(f: MentorFacts): string {
  const topics = [...f.topics]
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    .map((t) => {
      const counts = [
        t.notes && `${t.notes} note${t.notes === 1 ? "" : "s"}`,
        t.postmortems && `${t.postmortems} postmortem${t.postmortems === 1 ? "" : "s"}`,
      ].filter(Boolean);
      const desc = t.description ? ` — ${one(t.description, 200)}` : "";
      return `- [${STAGE_LABEL[t.stage]}] ${t.title}${desc}${counts.length ? ` (${counts.join(", ")})` : ""}`;
    });
  const sessions = f.sessions.map((s) => {
    const parts = [
      s.day,
      s.stage && STAGE_LABEL[s.stage],
      s.topic && `topic: ${s.topic}`,
      s.durationMin != null && `${s.durationMin} min`,
      s.summary && `did: ${one(s.summary, 200)}`,
      s.nextStep && `next: ${one(s.nextStep, 200)}`,
      s.producedOutput && "produced output",
    ].filter(Boolean);
    return `- ${parts.join(" · ")}`;
  });
  const notes = f.notes.map(
    (n) =>
      `- "${n.title}"${n.explainIt ? " (explain-it)" : ""}${n.topic ? ` · topic: ${n.topic}` : ""}${n.excerpt ? `: ${one(n.excerpt)}` : ""}`,
  );
  const postmortems = f.postmortems.map(
    (p) =>
      `- "${p.title}" (${p.deliberate ? "broke it on purpose" : "real incident"})${p.topic ? ` · topic: ${p.topic}` : ""} · root cause: ${one(p.rootCause, 200)} · lessons: ${one(p.lessons, 200)}`,
  );
  const section = (title: string, lines: string[], empty: string) =>
    `${title}:\n${lines.length ? lines.join("\n") : empty}`;
  return [
    `Name: ${f.name}`,
    `Status: ${f.status.toLowerCase()}`,
    f.goal && `Goal: ${f.goal.trim()}`,
    f.repoUrl && `Repository: ${f.repoUrl}`,
    f.description && `Description:\n${cut(f.description.trim(), 6_000)}`,
    section("Topics (Pain → Build → Break → Explain → Done)", topics, "(none yet)"),
    section("Recent sessions, newest first", sessions, "(none yet)"),
    section("Notes, newest first", notes, "(none yet)"),
    section("Postmortems", postmortems, "(none yet)"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mentorKnowledge(f: MentorFacts): string {
  const memory = f.memory?.trim()
    ? `<memory>\n${f.memory.trim()}\n</memory>`
    : "<memory>\n(empty: this is the first conversation)\n</memory>";
  return `What the app knows about the project right now (always current):
<project>
${mentorContextBlock(f)}
</project>

Your own notes from earlier conversations (may be a little behind the facts above; the facts win):
${memory}`;
}

const MENTOR_ROLE = `You are the mentor for one project inside studee-budee, a study app for one person learning DevOps and AI infrastructure alongside a full-time job. They learn by building this project end to end, topic by topic, through the loop Pain → Build → Break → Explain. You know the project from the facts and notes below and from the conversation so far.`;

export const MENTOR_NUDGE_RULES = `How you help: nudge them in the right direction; never hand them the solution.
- Find out where they are: what they're trying, what they've tried, what they expect versus what happens. Ask when it isn't clear.
- Then give the smallest useful push: a question that makes them think, the concept or area to look at, the doc page or man page to read, one command or log to inspect and what to look for, or the next small step.
- No code, config files, manifests or command sequences that do the work for them, and no corrected version of theirs. Naming a command, flag or setting to look up is fine; writing the solution with it is not.
- If they ask for the code or the full solution, don't give it. Tell them they can tick "Give me the solution" for that message when they really want it, and give them the next nudge now.
- Ground it in the project: the topics and their stages, what the last sessions say is next, their notes and postmortems. Nudge them along the loop: feel the pain before building, break it on purpose once it works, explain it in their own words.
- Short: usually under 150 words. End with a question or one concrete next step.`;

export const MENTOR_SOLUTION_RULES = `This time the learner ticked "Give me the solution": they explicitly asked for it, so give it.
- Give the working answer: the code, config or commands, complete enough to use in their project, in fenced code blocks.
- Explain briefly why it works and what to watch out for. Fit it to what you know about their project.
- End with one way to make it theirs: something to break, change or explain about it.
- This only applies to this message. Their next message gets nudges again unless they tick it again.`;

export function mentorSystem(f: MentorFacts, solution: boolean): string {
  const rules = solution
    ? `${MENTOR_ROLE}\n\nBe concrete and plain. No filler, no flattery.\n\n${MENTOR_SOLUTION_RULES}`
    : `${TUTOR}\n\n${MENTOR_ROLE}\n\n${MENTOR_NUDGE_RULES}`;
  return `${rules}\n\n${mentorKnowledge(f)}`;
}

/** Earlier turns, marked so the model knows which answers were unlocked solutions. */
export function mentorTurnText(m: MentorTurn): string {
  return m.role === "USER" && m.solution ? `[Asked for the solution]\n${m.content}` : m.content;
}

export const MEMORY_SYSTEM = `You keep the notes a project mentor uses to remember one learner's project between conversations. The learner is studying DevOps and AI infrastructure by building the project through the loop Pain → Build → Break → Explain.

You get the current notes, what the app knows about the project, and the latest conversation. Return the updated notes, in markdown, with exactly these sections:
## Where it stands
1–3 sentences: the current focus and state.
## Done
What they've built, figured out or understood.
## Next
What they said they'll do next, or what's clearly next.
## Decisions
Choices made about the project (tools, scope, design) and why, when known.
## Struggles and open questions
Where they got stuck, misconceptions you noticed, questions still open. Note when they asked for a full solution and what it was about, so the mentor can later check they understood it.

Rules:
- Short bullets, facts only, at most about 300 words in total. Write "None yet." for an empty section.
- Keep what's still true, update what changed, drop what's stale or contradicted by the app's facts.
- Never put code, configs or solutions in the notes; describe them in a few words instead.
- Output only the notes.`;

export function memoryPrompt(f: MentorFacts, turns: MentorTurn[]): string {
  const conversation = turns.length
    ? turns
        .map((m) => {
          const who = m.role === "USER" ? "Learner" : "Mentor";
          return `<${who.toLowerCase()}>\n${cut(mentorTurnText(m), 6_000)}\n</${who.toLowerCase()}>`;
        })
        .join("\n")
    : "(no conversation yet: build the notes from the app's facts)";
  return `Current notes:
<memory>
${f.memory?.trim() || "(empty)"}
</memory>

What the app knows about the project:
<project>
${mentorContextBlock(f)}
</project>

Latest conversation:
${conversation}`;
}

// --- Project ideas and starter topics

const STARTER_TOPIC_RULES = `Starter topics are the concepts or problems they'll work through, in learning order, each one card on their Pain → Build → Break → Explain board. Title at most 8 words; the description says in 1–2 sentences what to figure out, phrased as the problem to feel or the question to answer, never the answer or the steps.`;

export const IDEAS_SYSTEM = `${TUTOR}

Suggest ${IDEA_COUNT} project ideas the learner could build to learn by doing.
- Each must be real and useful (something they or a team would actually run), runnable on a homelab or free tiers, and finishable in 2–6 weeks at about an hour a day.
- Fit their wishes and what they've already done; don't repeat their existing projects. Vary the ideas in area and difficulty.
- name: at most 6 words. pitch: one sentence. goal: what "done" looks like, something they can show or check.
- description: markdown, 3–6 sentences or bullets: what to build, what it should do and where the scope ends. Name the main tools, but don't say how to build it: no steps, no architecture walkthrough, no code.
- skills: 3–6 short tags (e.g. "kubernetes", "prometheus", "terraform").
- topics: 3–6 starter topics. ${STARTER_TOPIC_RULES}`;

export function ideasPrompt(input: {
  wish: string;
  projects: { name: string; goal: string | null }[];
  doneTopics: string[];
  roadmaps: string[];
  exclude: string[];
}): string {
  const list = (items: string[], empty: string) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : empty;
  return `What I want to practice or build:
${input.wish.trim() || "(no preference: surprise me)"}

My projects so far:
${list(
  input.projects.map((p) => (p.goal ? `${p.name} — ${one(p.goal, 200)}` : p.name)),
  "(none yet)",
)}

Topics I've finished:
${list(input.doneTopics, "(none yet)")}

Roadmaps I'm following:
${list(input.roadmaps, "(none)")}${
    input.exclude.length
      ? `\n\nIdeas you already suggested (suggest different ones):\n${list(input.exclude, "")}`
      : ""
  }`;
}

export const TOPICS_SYSTEM = `${TUTOR}

The learner has their own project idea. Suggest 3–6 starter topics for it. ${STARTER_TOPIC_RULES} Base them on their description; don't change the project.`;

export function topicsPrompt(p: { name: string; goal: string; description: string }): string {
  return `Project: ${p.name.trim()}
Goal: ${p.goal.trim() || "(not set)"}

Description:
${cut(p.description.trim(), 10_000) || "(none)"}`;
}

// --- Courses from a resources file

export const COURSE_SYSTEM = `${TUTOR}

Here you design a self-study course for the learner, who studies in short daily sessions after work. You get a list of learning resources that were already researched. Your job is to arrange them into a course, not to find new ones.

Every module follows the learning loop:
1. Pain: a practice task done the manual way first, to feel the problem.
2. Build: a task that solves it properly with the tool.
3. Break: a task that deliberately breaks it and has the learner debug it.
4. Explain: checkpoint questions the learner answers in their own words.

Rules:
- Use only resources from the list, referenced by their id exactly as given. Never invent a resource, title or link. When a module needs something the list doesn't have, say so in gaps.
- Follow the topic order of the file unless another order is clearly better for learning. A module usually covers one or two topics.
- Size each module to about one week at the learner's weekly time. Split big topics and merge tiny ones. Usually 3–8 items per module.
- Order items inside a module from overview to detail: a short overview first, then reference docs, then hands-on tutorials.
- Mark an item required: false when it repeats what a required item already covers, or when it's background or extra reading. Every module needs at least one required item.
- Use each resource in one module only, unless it clearly covers different parts in different modules; then give each use its own sections.
- Leave out resources that don't fit the goal or the learner.
- Practice: 2–3 tasks per module (Pain, Build, Break). They must run in the learner's environment, with no cloud accounts or VMs unless the environment says so. Describe the task and how to check it's done (doneWhen), never the solution.
- Checkpoint: 3–5 questions per module with short answers. Ask about understanding and debugging ("why…", "what would you check if…"), not trivia.
- Respect the learner's focus when given.`;

function resourceLine(r: Library["resources"][number]): string {
  const facts = [
    ITEM_TYPE_LABEL[r.type],
    r.minutes && `${r.minutes} min`,
    r.level,
    r.author,
    r.startSec != null && `from ${fmtTimestamp(r.startSec)}`,
    r.endSec != null && `to ${fmtTimestamp(r.endSec)}`,
  ].filter(Boolean);
  const topics = r.topics.length ? ` [topics: ${r.topics.join(", ")}]` : "";
  const why = r.why ? `\n    ${cut(r.why, 300)}` : "";
  return `- ${r.key}: ${cut(r.title, 200)} (${facts.join(", ")})${topics}${why}`;
}

export function coursePrompt(
  lib: Library,
  options: { weeklyMinutes: number; focus: string | null },
): string {
  const about = [
    `Subject: ${lib.subject}`,
    lib.learner && `Learner: ${lib.learner}`,
    lib.goal && `Goal: ${lib.goal}`,
    lib.environment && `Practice environment: ${lib.environment}`,
    `Time per week: about ${options.weeklyMinutes} minutes`,
    options.focus && `Focus: ${options.focus.trim()}`,
  ].filter(Boolean);
  const topics = lib.topics.length
    ? `\n\nTopics, in learning order:\n${lib.topics.map((t) => `- ${t.key}: ${t.title}${t.level ? ` (${t.level})` : ""}`).join("\n")}`
    : "";
  const gaps = lib.gaps.length
    ? `\n\nAlready known gaps (nothing good was found):\n${lib.gaps.map((g) => `- ${g}`).join("\n")}`
    : "";
  return `${about.join("\n")}${topics}\n\nResources (id: title (facts) [topics]):\n${lib.resources.map(resourceLine).join("\n")}${gaps}`;
}
