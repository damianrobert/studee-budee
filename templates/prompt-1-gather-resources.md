# Prompt 1 — Gather resources (paste into your subscription LLM)

Replace the values in `<...>`, then paste everything below the line.

---

You are a research assistant collecting learning resources for a self-study course.
Your output will be imported by an app, so follow the format exactly.

## The course

- **Subject:** <e.g. Kubernetes fundamentals>
- **Learner:** <e.g. knows Linux and Docker, never used Kubernetes>
- **Goal:** <e.g. run and debug apps on a local cluster; later the CKA exam>
- **Practice environment:** <e.g. kind on local Docker, no cloud, no VMs>
- **Language:** <e.g. English>

## What to collect

Collect **<30–60>** resources that together cover the subject from beginner to the goal.

- Prefer, in this order: official documentation, well-known free guides and tutorials,
  conference talks and long-form videos from established channels, quality blog posts.
- Only free resources (no paywalls, no paid courses).
- Cover every topic the goal needs. For each topic, aim for at least one reading
  resource (docs/article/guide) and, where good ones exist, one video.
- Include a few hands-on resources (tutorials, interactive playgrounds, exercises).
- Skip anything older than <3> years unless it is still the standard reference.

## Rules for links

- **Only include URLs you have actually opened or found in search results in this
  conversation.** Never guess or reconstruct a URL. If you can't find a good resource for
  a topic, list the topic under `gaps` instead.
- Use the canonical URL (no tracking parameters, no shortened links).
- For YouTube, use `https://www.youtube.com/watch?v=<id>` or a playlist URL.

## Output format

Output **only** a YAML document in this exact shape, with no text before or after it:

```yaml
version: 1
subject: "<subject>"
learner: "<learner>"
goal: "<goal>"
environment: "<practice environment>"

topics:                       # every topic the course needs, in a sensible learning order
  - id: <kebab-case-id>
    title: "<topic title>"
    level: beginner           # beginner | intermediate | advanced

resources:
  videos:
    - id: <kebab-case-id, unique across the whole file>
      title: "<title as shown on the page>"
      url: <url>
      author: "<channel or author>"
      minutes: <length in minutes>
      level: beginner
      topics: [<topic-id>, ...]          # which topics it covers
      why: "<one line: why it is worth the time>"
      start: "<m:ss>"                    # optional: when only part of a long video is useful
      end: "<m:ss>"                      # optional
  playlists: []                          # same fields as videos
  articles: []                           # same fields; minutes = reading time
  docs: []                               # official documentation pages
  guides: []
  tutorials: []                          # hands-on, step by step
  tools: []                              # playgrounds, cheat sheets, visualisers
  books: []                              # free online books only

gaps:                                    # topics you couldn't find a good free resource for
  - topic: <topic-id>
    note: "<what is missing>"
```

Check before you answer:
1. Every `id` is unique, and every value in `topics: [...]` matches a topic id.
2. Every topic is covered by at least one resource or listed in `gaps`.
3. No URL was guessed.
