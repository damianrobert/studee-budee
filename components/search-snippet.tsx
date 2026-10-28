const HL_START = "\u0001";
const HL_STOP = "\u0002";

/** Renders a ts_headline snippet, highlighting the \u0001…\u0002 marked matches. */
export function SearchSnippet({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${HL_START}[^${HL_STOP}]*${HL_STOP})`));
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith(HL_START) ? (
          <mark key={i} className="rounded-sm bg-warning/25 px-0.5 text-foreground">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
