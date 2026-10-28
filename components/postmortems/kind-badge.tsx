import { Badge } from "@/components/ui/badge";

export function PostmortemKindBadge({ deliberate }: { deliberate: boolean }) {
  return (
    <Badge variant={deliberate ? "warning" : "destructive"}>{deliberate ? "Chaos" : "Real"}</Badge>
  );
}
