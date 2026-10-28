import { describe, expect, it } from "vitest";
import {
  fileExt,
  inlineContentType,
  markdownForFile,
  mimeFor,
  previewKind,
  referencedFileIds,
  sanitizeFileName,
} from "@/lib/files";
import { codeBlock } from "@/components/markdown/markdown";
import { noteToMarkdown, slugFileName } from "@/lib/markdown-export";
import { plainPreview } from "@/lib/notes";
import { normalizeTag, normalizeTags } from "@/lib/tags";

describe("sanitizeFileName", () => {
  it("drops directories (path traversal) and reserved characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\shot.png")).toBe("shot.png");
    expect(sanitizeFileName('we<i>rd:"name"?.log')).toBe("weirdname.log");
    expect(sanitizeFileName("a\u0000b\nc.txt")).toBe("abc.txt");
  });
  it("never returns an empty or hidden name", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("../")).toBe("file");
    expect(sanitizeFileName(".env")).toBe("env");
  });
  it("caps the length but keeps the extension", () => {
    const name = sanitizeFileName(`${"x".repeat(300)}.yaml`);
    expect(name).toHaveLength(200);
    expect(name.endsWith(".yaml")).toBe(true);
  });
});

describe("file types", () => {
  it("derives extensions", () => {
    expect(fileExt("Dockerfile")).toBe("dockerfile");
    expect(fileExt("main.TF")).toBe("tf");
    expect(fileExt("noext")).toBe("");
    expect(fileExt("weird.ex t")).toBe("");
  });
  it("prefers the extension over the browser's type", () => {
    expect(mimeFor("shot.PNG", "application/octet-stream")).toBe("image/png");
    expect(mimeFor("deploy.yaml", "application/x-yaml")).toBe("text/plain");
    expect(mimeFor("blob.bin", "application/x-thing")).toBe("application/x-thing");
    expect(mimeFor("blob.bin", "not a mime")).toBe("application/octet-stream");
  });
  it("only serves safe types inline", () => {
    expect(inlineContentType("image/png", "a.png")).toBe("image/png");
    expect(inlineContentType("application/pdf", "a.pdf")).toBe("application/pdf");
    expect(inlineContentType("text/plain", "a.sh")).toBe("text/plain; charset=utf-8");
    expect(inlineContentType("image/svg+xml", "a.svg")).toBeNull();
    expect(inlineContentType("text/html", "a.html")).toBeNull();
    expect(inlineContentType("application/zip", "a.zip")).toBeNull();
  });
  it("classifies previews", () => {
    expect(previewKind("image/jpeg", "a.jpg")).toBe("image");
    expect(previewKind("text/plain", "main.go")).toBe("text");
    expect(previewKind("application/octet-stream", "x.bin")).toBe("none");
  });
});

describe("attachments in markdown", () => {
  it("embeds images and links other files, escaping brackets", () => {
    const id = "cmabcdefghijklmnopqrstuvw";
    expect(markdownForFile({ id, originalName: "a.png", mimeType: "image/png" })).toBe(
      `![a.png](/api/files/${id})`,
    );
    expect(markdownForFile({ id, originalName: "[x].log", mimeType: "text/plain" })).toBe(
      `[\\[x\\].log](/api/files/${id})`,
    );
  });
  it("finds referenced file ids once each", () => {
    const a = "cmaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "cmbbbbbbbbbbbbbbbbbbbbbbb";
    const md = `![](/api/files/${a}) and [log](/api/files/${b}?download=1) and /api/files/${a}`;
    expect(referencedFileIds(md)).toEqual([a, b]);
  });
  it("fences code longer than any backtick run inside it", () => {
    expect(codeBlock("echo hi", "bash")).toBe("```bash\necho hi\n```");
    expect(codeBlock("a ```` b", "")).toBe("`````\na ```` b\n`````");
  });
});

describe("tags", () => {
  it("normalizes to lower-case kebab words", () => {
    expect(normalizeTag("  AI Infra ")).toBe("ai-infra");
    expect(normalizeTag("#Kubernetes")).toBe("kubernetes");
    expect(normalizeTag("c++")).toBe("c++");
    expect(normalizeTag("!!")).toBe("");
  });
  it("dedupes and drops empties", () => {
    expect(normalizeTags(["Docker", "docker ", "", "k8s"])).toEqual(["docker", "k8s"]);
  });
});

describe("markdown export", () => {
  it("writes front matter and the note body", () => {
    const md = noteToMarkdown({
      title: 'Docker "volumes"',
      content: "They persist data.\n",
      type: "EXPLAIN_IT",
      createdAt: new Date("2026-01-02T03:04:05Z"),
      updatedAt: new Date("2026-01-03T03:04:05Z"),
      project: { name: "Homelab" },
      topic: null,
      tags: [{ name: "docker" }],
    });
    expect(md).toBe(
      [
        "---",
        'title: "Docker \\"volumes\\""',
        "type: explain-it",
        'project: "Homelab"',
        'tags: ["docker"]',
        "created: 2026-01-02T03:04:05.000Z",
        "updated: 2026-01-03T03:04:05.000Z",
        "---",
        "",
        '# Docker "volumes"',
        "",
        "They persist data.",
        "",
      ].join("\n"),
    );
  });
  it("slugifies file names", () => {
    expect(slugFileName("Café: How DNS works?")).toBe("cafe-how-dns-works.md");
    expect(slugFileName("???")).toBe("untitled.md");
  });
});

describe("plainPreview", () => {
  it("keeps link labels and drops markdown syntax", () => {
    expect(
      plainPreview(
        "# Title\n\nSee ![shot](/api/files/abc) and [docs](https://x.y).\n```bash\nls\n```",
      ),
    ).toBe("Title See shot and docs. ls");
  });
});
