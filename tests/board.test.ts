import { describe, expect, it } from "vitest";
import { checkStageMove } from "@/lib/board";

describe("Done gate", () => {
  it("blocks Done without an explain-it note", () => {
    expect(checkStageMove("EXPLAIN", "DONE", { explainNotes: 0, postmortems: 2 })).toEqual({
      allowed: false,
      reason: "NEEDS_EXPLAIN_NOTE",
    });
  });

  it("allows Done with an explain-it note, from any stage", () => {
    expect(checkStageMove("EXPLAIN", "DONE", { explainNotes: 1, postmortems: 0 }).allowed).toBe(
      true,
    );
    expect(checkStageMove("PAIN", "DONE", { explainNotes: 1, postmortems: 0 }).allowed).toBe(true);
  });

  it("allows reordering within Done", () => {
    expect(checkStageMove("DONE", "DONE", { explainNotes: 0, postmortems: 0 }).allowed).toBe(true);
  });

  it("hints (doesn't block) moving to Explain without a postmortem", () => {
    expect(checkStageMove("BUILD", "EXPLAIN", { explainNotes: 0, postmortems: 0 })).toEqual({
      allowed: true,
      hint: "BREAK_FIRST",
    });
    expect(checkStageMove("BREAK", "EXPLAIN", { explainNotes: 0, postmortems: 1 })).toEqual({
      allowed: true,
    });
  });
});
