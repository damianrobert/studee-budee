import { DIFFICULTY_LABEL } from "@/lib/chaos";
import { cn } from "@/lib/utils";

export function DifficultyDots({ value }: { value: number }) {
  const label = DIFFICULTY_LABEL[value as 1 | 2 | 3] ?? "Easy";
  return (
    <span className="inline-flex items-center gap-0.5" title={label}>
      <span className="sr-only">Difficulty: {label}</span>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            i <= value ? "bg-foreground/70" : "border border-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
