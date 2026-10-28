// Minimal zip writer/reader for the export/import, on node:zlib (no dependencies).
// Writer: sizes and CRCs are known before each entry is written (no data descriptors), so
// every unzip tool reads it; zip64 records are added only when offsets/counts need them.
// Reader: central-directory based, stored + deflate, zip64, CRC and size checked on read.

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable, Transform, type TransformCallback } from "node:stream";
import zlib from "node:zlib";
import { UserError } from "./utils";

const U32 = 0xffffffff;
const U16 = 0xffff;
const FLAG_UTF8 = 0x0800;

export type ZipInput =
  | { name: string; data: Buffer | string; mtime?: Date }
  | { name: string; path: string; mtime?: Date };

type CentralRecord = {
  name: Buffer;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
  time: number;
  date: number;
};

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function checkName(name: string) {
  if (!name || name.startsWith("/") || name.split("/").some((p) => p === ".." || p === ""))
    throw new UserError(`Invalid zip entry name: ${name}`);
}

async function fileCrc(path: string): Promise<number> {
  let crc = 0;
  for await (const chunk of createReadStream(path)) crc = zlib.crc32(chunk as Buffer, crc);
  return crc;
}

function localHeader(r: Omit<CentralRecord, "offset">): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // version needed
  h.writeUInt16LE(FLAG_UTF8, 6);
  h.writeUInt16LE(r.method, 8);
  h.writeUInt16LE(r.time, 10);
  h.writeUInt16LE(r.date, 12);
  h.writeUInt32LE(r.crc >>> 0, 14);
  h.writeUInt32LE(r.compressedSize, 18);
  h.writeUInt32LE(r.size, 22);
  h.writeUInt16LE(r.name.length, 26);
  h.writeUInt16LE(0, 28);
  return Buffer.concat([h, r.name]);
}

function centralHeader(r: CentralRecord): Buffer {
  const zip64 = r.offset >= U32;
  const extra = zip64 ? Buffer.alloc(12) : Buffer.alloc(0);
  if (zip64) {
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(8, 2);
    extra.writeBigUInt64LE(BigInt(r.offset), 4);
  }
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE((3 << 8) | 45, 4); // made by: Unix, spec 4.5
  h.writeUInt16LE(zip64 ? 45 : 20, 6);
  h.writeUInt16LE(FLAG_UTF8, 8);
  h.writeUInt16LE(r.method, 10);
  h.writeUInt16LE(r.time, 12);
  h.writeUInt16LE(r.date, 14);
  h.writeUInt32LE(r.crc >>> 0, 16);
  h.writeUInt32LE(r.compressedSize, 20);
  h.writeUInt32LE(r.size, 24);
  h.writeUInt16LE(r.name.length, 28);
  h.writeUInt16LE(extra.length, 30);
  h.writeUInt16LE(0, 32); // comment
  h.writeUInt16LE(0, 34); // disk
  h.writeUInt16LE(0, 36); // internal attrs
  h.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file, rw-r--r--
  h.writeUInt32LE(zip64 ? U32 : r.offset, 42);
  return Buffer.concat([h, r.name, extra]);
}

function endRecords(count: number, cdOffset: number, cdSize: number): Buffer {
  const parts: Buffer[] = [];
  const zip64 = count >= U16 || cdOffset >= U32 || cdSize >= U32;
  if (zip64) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0);
    z.writeBigUInt64LE(44n, 4);
    z.writeUInt16LE(45, 12);
    z.writeUInt16LE(45, 14);
    z.writeBigUInt64LE(BigInt(count), 24);
    z.writeBigUInt64LE(BigInt(count), 32);
    z.writeBigUInt64LE(BigInt(cdSize), 40);
    z.writeBigUInt64LE(BigInt(cdOffset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    loc.writeUInt32LE(1, 16);
    parts.push(z, loc);
  }
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(Math.min(count, U16), 8);
  e.writeUInt16LE(Math.min(count, U16), 10);
  e.writeUInt32LE(Math.min(cdSize, U32), 12);
  e.writeUInt32LE(Math.min(cdOffset, U32), 16);
  parts.push(e);
  return Buffer.concat(parts);
}

/**
 * Streams a zip of the given entries. In-memory data is deflated; files on disk are stored
 * as-is (uploads are mostly compressed already) and read twice: once for the CRC.
 */
export async function* zipStream(
  inputs: AsyncIterable<ZipInput> | Iterable<ZipInput>,
): AsyncGenerator<Buffer> {
  const records: CentralRecord[] = [];
  let offset = 0;
  for await (const input of inputs) {
    checkName(input.name);
    const name = Buffer.from(input.name, "utf8");
    const { time, date } = dosDateTime(input.mtime ?? new Date());
    if ("data" in input) {
      const raw = typeof input.data === "string" ? Buffer.from(input.data, "utf8") : input.data;
      const deflated = zlib.deflateRawSync(raw);
      const useDeflate = deflated.length < raw.length;
      const body = useDeflate ? deflated : raw;
      if (body.length >= U32 || raw.length >= U32) throw new UserError("Zip entry too large");
      const rec = {
        name,
        method: useDeflate ? 8 : 0,
        crc: zlib.crc32(raw),
        compressedSize: body.length,
        size: raw.length,
        offset,
        time,
        date,
      };
      const header = localHeader(rec);
      yield header;
      yield body;
      offset += header.length + body.length;
      records.push(rec);
    } else {
      const { size } = await fs.stat(input.path);
      if (size >= U32) throw new UserError("Zip entry too large");
      const rec = {
        name,
        method: 0,
        crc: await fileCrc(input.path),
        compressedSize: size,
        size,
        offset,
        time,
        date,
      };
      const header = localHeader(rec);
      yield header;
      let written = 0;
      for await (const chunk of createReadStream(input.path)) {
        written += (chunk as Buffer).length;
        yield chunk as Buffer;
      }
      if (written !== size) throw new UserError(`File changed while zipping: ${input.name}`);
      offset += header.length + size;
      records.push(rec);
    }
  }
  const cdOffset = offset;
  let cdSize = 0;
  for (const r of records) {
    const h = centralHeader(r);
    cdSize += h.length;
    yield h;
  }
  yield endRecords(records.length, cdOffset, cdSize);
}

// --- reader -------------------------------------------------------------------------

export type ZipEntry = {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
};

/** Passes data through, failing if it exceeds `size` or ends with a different size/CRC. */
class CheckStream extends Transform {
  private crc = 0;
  private seen = 0;
  constructor(private readonly entry: ZipEntry) {
    super();
  }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.seen += chunk.length;
    if (this.seen > this.entry.size)
      return cb(new UserError(`Zip entry too long: ${this.entry.name}`));
    this.crc = zlib.crc32(chunk, this.crc);
    cb(null, chunk);
  }
  _flush(cb: TransformCallback) {
    if (this.seen !== this.entry.size || this.crc >>> 0 !== this.entry.crc >>> 0)
      return cb(new UserError(`Zip entry is corrupt: ${this.entry.name}`));
    cb();
  }
}

function readBig(buf: Buffer, at: number): number {
  const n = buf.readBigUInt64LE(at);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new UserError("Zip is too large");
  return Number(n);
}

export class ZipReader {
  private constructor(
    private readonly path: string,
    private readonly fh: fs.FileHandle,
    readonly entries: ZipEntry[],
  ) {}

  static async open(path: string): Promise<ZipReader> {
    const fh = await fs.open(path, "r");
    try {
      return new ZipReader(path, fh, await ZipReader.readDirectory(fh));
    } catch (e) {
      await fh.close();
      throw e;
    }
  }

  private static async read(fh: fs.FileHandle, position: number, length: number) {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, position);
    if (bytesRead !== length) throw new UserError("Not a valid zip file");
    return buf;
  }

  private static async readDirectory(fh: fs.FileHandle): Promise<ZipEntry[]> {
    const { size } = await fh.stat();
    if (size < 22) throw new UserError("Not a valid zip file");
    const tailLen = Math.min(size, 22 + U16);
    const tail = await ZipReader.read(fh, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new UserError("Not a valid zip file");
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
      const z64At = readBig(tail, eocd - 20 + 8);
      const z = await ZipReader.read(fh, z64At, 56);
      if (z.readUInt32LE(0) !== 0x06064b50) throw new UserError("Not a valid zip file");
      count = readBig(z, 32);
      cdSize = readBig(z, 40);
      cdOffset = readBig(z, 48);
    }
    if (cdOffset + cdSize > size) throw new UserError("Not a valid zip file");
    const cd = await ZipReader.read(fh, cdOffset, cdSize);
    const entries: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50)
        throw new UserError("Not a valid zip file");
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const crc = cd.readUInt32LE(p + 16);
      let compressedSize = cd.readUInt32LE(p + 20);
      let entrySize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let offset = cd.readUInt32LE(p + 42);
      const name = cd.toString(flags & FLAG_UTF8 ? "utf8" : "latin1", p + 46, p + 46 + nameLen);
      // zip64 extra: only the fields that are 0xFFFFFFFF in the header, in this order.
      let x = p + 46 + nameLen;
      const xEnd = x + extraLen;
      while (x + 4 <= xEnd) {
        const id = cd.readUInt16LE(x);
        const len = cd.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (entrySize === U32) {
            entrySize = readBig(cd, q);
            q += 8;
          }
          if (compressedSize === U32) {
            compressedSize = readBig(cd, q);
            q += 8;
          }
          if (offset === U32) offset = readBig(cd, q);
        }
        x += 4 + len;
      }
      p = xEnd + commentLen;
      if (flags & 1) throw new UserError("Encrypted zip files aren't supported");
      if (name.endsWith("/")) continue; // directory
      if (method !== 0 && method !== 8)
        throw new UserError(`Unsupported compression in zip entry: ${name}`);
      entries.push({ name, method, crc, compressedSize, size: entrySize, offset });
    }
    return entries;
  }

  find(name: string): ZipEntry | undefined {
    return this.entries.find((e) => e.name === name);
  }

  async stream(entry: ZipEntry): Promise<Readable> {
    const h = await ZipReader.read(this.fh, entry.offset, 30);
    if (h.readUInt32LE(0) !== 0x04034b50) throw new UserError("Not a valid zip file");
    const start = entry.offset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
    const raw: Readable =
      entry.compressedSize === 0
        ? Readable.from([])
        : createReadStream(this.path, { start, end: start + entry.compressedSize - 1 });
    const check = new CheckStream(entry);
    const forward = (e: Error) => check.destroy(e);
    if (entry.method === 8) {
      const inflate = zlib.createInflateRaw();
      raw.on("error", forward);
      inflate.on("error", forward);
      return raw.pipe(inflate).pipe(check);
    }
    raw.on("error", forward);
    return raw.pipe(check);
  }

  async readBuffer(entry: ZipEntry, maxBytes: number): Promise<Buffer> {
    if (entry.size > maxBytes) throw new UserError(`${entry.name} is too large`);
    const chunks: Buffer[] = [];
    for await (const c of await this.stream(entry)) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  close() {
    return this.fh.close();
  }
}
