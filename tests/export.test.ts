import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EXPORT_FORMAT,
  checkReferences,
  markdownFiles,
  parseExport,
  rewriteFileLinks,
} from "@/lib/export-format";
import { slugify } from "@/lib/markdown-export";
import { ZipReader, zipStream, type ZipInput } from "@/lib/zip";

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-zip-"));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeZip(name: string, inputs: ZipInput[]): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of zipStream(inputs)) chunks.push(c);
  const p = path.join(dir, name);
  await fs.writeFile(p, Buffer.concat(chunks));
  return p;
}

async function readAll(zip: ZipReader, name: string): Promise<Buffer> {
  return zip.readBuffer(zip.find(name)!, 1e9);
}

describe("zip", () => {
  it("round-trips text, binary and files on disk, with UTF-8 names", async () => {
    const onDisk = path.join(dir, "blob.bin");
    const blob = Buffer.alloc(300_000);
    for (let i = 0; i < blob.length; i++) blob[i] = (i * 7919) % 251;
    await fs.writeFile(onDisk, blob);
    const text = "hello ".repeat(10_000);
    const p = await writeZip("a.zip", [
      { name: "data.json", data: text },
      { name: "markdown/café/notes/ünïcode.md", data: "# Ünïcode\n" },
      { name: "empty.txt", data: "" },
      { name: "files/blob.bin", path: onDisk },
    ]);
    const zip = await ZipReader.open(p);
    try {
      expect(zip.entries.map((e) => e.name)).toEqual([
        "data.json",
        "markdown/café/notes/ünïcode.md",
        "empty.txt",
        "files/blob.bin",
      ]);
      // Repetitive text is deflated, the file from disk is stored.
      expect(zip.find("data.json")!.method).toBe(8);
      expect(zip.find("data.json")!.compressedSize).toBeLessThan(text.length / 10);
      expect(zip.find("files/blob.bin")!.method).toBe(0);
      expect((await readAll(zip, "data.json")).toString()).toBe(text);
      expect((await readAll(zip, "markdown/café/notes/ünïcode.md")).toString()).toBe("# Ünïcode\n");
      expect((await readAll(zip, "empty.txt")).length).toBe(0);
      expect((await readAll(zip, "files/blob.bin")).equals(blob)).toBe(true);
    } finally {
      await zip.close();
    }
  });

  it("detects corrupted data and garbage files", async () => {
    const p = await writeZip("b.zip", [{ name: "x.txt", data: "abcdefghij-not-compressible" }]);
    const buf = await fs.readFile(p);
    const zipOk = await ZipReader.open(p);
    const entry = zipOk.find("x.txt")!;
    await zipOk.close();
    buf[entry.offset + 30 + "x.txt".length + 2] ^= 0xff; // flip a byte of the stored data
    await fs.writeFile(p, buf);
    const zip = await ZipReader.open(p);
    await expect(readAll(zip, "x.txt")).rejects.toThrow(/corrupt/);
    await zip.close();

    const junk = path.join(dir, "junk.zip");
    await fs.writeFile(junk, "definitely not a zip file at all");
    await expect(ZipReader.open(junk)).rejects.toThrow(/Not a valid zip/);
  });

  it("refuses unsafe entry names when writing", async () => {
    await expect(writeZip("c.zip", [{ name: "../evil", data: "x" }])).rejects.toThrow();
    await expect(writeZip("d.zip", [{ name: "/abs", data: "x" }])).rejects.toThrow();
  });

  it("enforces a size limit when reading into memory", async () => {
    const p = await writeZip("e.zip", [{ name: "big.txt", data: "x".repeat(1000) }]);
    const zip = await ZipReader.open(p);
    await expect(zip.readBuffer(zip.find("big.txt")!, 10)).rejects.toThrow(/too large/);
    await zip.close();
  });
});

// --- export format ------------------------------------------------------------------

const T = "2026-10-20T08:00:00.000Z";
const FILE_ID = "cfile0000000000000000001";
const STORED = "0b6c6f5e-1c1a-4f7e-9a63-2b8d1f0c9e11.png";

function sample() {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: T,
    data: {
      projects: [
        {
          id: "p1",
          name: "Homelab K8s",
          status: "ACTIVE",
          createdAt: T,
          updatedAt: T,
        },
        { id: "p2", name: "Homelab k8s!", status: "PAUSED", createdAt: T, updatedAt: T },
      ],
      topics: [
        {
          id: "t1",
          projectId: "p1",
          title: "Ingress",
          stage: "BUILD",
          position: 0,
          createdAt: T,
          updatedAt: T,
        },
      ],
      notes: [
        {
          id: "n1",
          title: "How ingress works",
          content: `See ![diagram](/api/files/${FILE_ID}) and [raw](/api/files/${FILE_ID}?download=1).`,
          type: "EXPLAIN_IT",
          projectId: "p1",
          topicId: "t1",
          pinned: false,
          createdAt: T,
          updatedAt: T,
          tagIds: ["g2", "g1"],
          fileIds: [FILE_ID],
        },
        {
          id: "n2",
          title: "How ingress works",
          content: "Second note with the same title.",
          type: "NOTE",
          pinned: false,
          createdAt: T,
          updatedAt: T,
          projectId: "p1",
        },
        {
          id: "n3",
          title: "Loose thought",
          content: "No project.",
          type: "NOTE",
          pinned: true,
          createdAt: T,
          updatedAt: T,
        },
      ],
      postmortems: [
        {
          id: "pm1",
          title: "DNS died",
          occurredAt: T,
          whatBroke: "CoreDNS",
          symptoms: "",
          investigation: `Logs: [log](/api/files/${FILE_ID})`,
          rootCause: "Bad ConfigMap",
          fix: "Reverted",
          lessons: "",
          wasDeliberate: true,
          projectId: "p2",
          chaosExperimentId: "c1",
          createdAt: T,
          updatedAt: T,
        },
      ],
      chaosExperiments: [{ id: "c1", title: "Break DNS", difficulty: 2, createdAt: T }],
      files: [
        {
          id: FILE_ID,
          originalName: "diagram.png",
          storedName: STORED,
          mimeType: "image/png",
          sizeBytes: 10,
          projectId: "p1",
          createdAt: T,
        },
      ],
      tags: [
        { id: "g1", name: "networking" },
        { id: "g2", name: "k8s" },
      ],
      settings: [{ key: "weeklyTarget", value: "4" }],
    },
  };
}

describe("parseExport", () => {
  it("accepts an export, filling defaults and converting dates", () => {
    const f = parseExport(sample());
    expect(f.data.sessions).toEqual([]);
    expect(f.data.projects[0]!.description).toBeNull();
    expect(f.data.notes[1]!.tagIds).toEqual([]);
    expect(f.data.notes[0]!.createdAt).toEqual(new Date(T));
  });

  it("rejects other files and newer versions", () => {
    expect(() => parseExport({ hello: 1 })).toThrow(/isn't a studee-budee export/);
    expect(() => parseExport({ ...sample(), version: 99 })).toThrow(/newer version/);
  });

  it("reports where a field is invalid", () => {
    const s = sample();
    (s.data.topics[0] as { stage: string }).stage = "SLEEP";
    expect(() => parseExport(s)).toThrow(/data\.topics\.0\.stage/);
  });

  it("rejects unsafe stored file names", () => {
    const s = sample();
    s.data.files[0]!.storedName = "../../etc/passwd";
    expect(() => parseExport(s)).toThrow(/Invalid stored file name/);
  });

  it("checks references and duplicates", () => {
    const dangling = sample();
    dangling.data.notes[0]!.tagIds!.push("missing");
    expect(() => parseExport(dangling)).toThrow(/note n1 points to missing missing/);

    const topic = sample();
    topic.data.topics[0]!.projectId = "nope";
    expect(() => parseExport(topic)).toThrow(/topic t1 points to missing nope/);

    const dupe = sample();
    dupe.data.tags[1]!.name = "networking";
    expect(() => parseExport(dupe)).toThrow(/duplicate tag "networking"/);

    const dupeId = parseExport(sample());
    dupeId.data.notes.push(dupeId.data.notes[0]!);
    expect(() => checkReferences(dupeId.data)).toThrow(/duplicate id n1 in notes/);
  });
});

describe("markdown files", () => {
  it("puts notes and postmortems in a folder per project with unique names", () => {
    const files = markdownFiles(parseExport(sample()).data, "Europe/Bucharest");
    expect(files.map((f) => f.name)).toEqual([
      "markdown/homelab-k8s/notes/how-ingress-works.md",
      "markdown/homelab-k8s/notes/how-ingress-works-2.md",
      "markdown/_no-project/notes/loose-thought.md",
      "markdown/homelab-k8s-2/postmortems/dns-died.md",
    ]);
  });

  it("rewrites file links into the archive and keeps metadata", () => {
    const [note, , , pm] = markdownFiles(parseExport(sample()).data, "Europe/Bucharest");
    expect(note!.content).toContain(`![diagram](../../../files/${STORED})`);
    expect(note!.content).toContain(`[raw](../../../files/${STORED})`);
    expect(note!.content).toContain('project: "Homelab K8s"');
    expect(note!.content).toContain('topic: "Ingress"');
    expect(note!.content).toContain('tags: ["k8s", "networking"]');
    expect(note!.content).toContain("type: explain-it");
    expect(pm!.content).toContain("kind: deliberate");
    expect(pm!.content).toContain("# Postmortem: DNS died");
    expect(pm!.content).toContain("chaos experiment: Break DNS");
    expect(pm!.content).toContain(`[log](../../../files/${STORED})`);
    // Empty sections are left out.
    expect(pm!.content).not.toContain("## Symptoms");
  });

  it("leaves links to unknown files alone", () => {
    const link = "/api/files/cunknown00000000000000001";
    expect(rewriteFileLinks(`[x](${link})`, () => undefined)).toBe(`[x](${link})`);
  });

  it("slugifies names", () => {
    expect(slugify("  Café: How DNS works?  ")).toBe("cafe-how-dns-works");
    expect(slugify("!!!")).toBe("");
  });
});
