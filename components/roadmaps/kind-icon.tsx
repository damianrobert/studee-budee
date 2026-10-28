import type { ResourceKind } from "@prisma/client";
import {
  Book,
  BookOpen,
  FolderGit2,
  GraduationCap,
  Link as LinkIcon,
  Newspaper,
  Terminal,
  Video,
  type LucideIcon,
} from "lucide-react";
import { RESOURCE_KIND_LABEL } from "@/lib/roadmaps";

export const KIND_ICON: Record<ResourceKind, LucideIcon> = {
  DOCS: BookOpen,
  ARTICLE: Newspaper,
  VIDEO: Video,
  COURSE: GraduationCap,
  BOOK: Book,
  INTERACTIVE: Terminal,
  REPO: FolderGit2,
  OTHER: LinkIcon,
};

export function KindIcon({ kind, className }: { kind: ResourceKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon aria-label={RESOURCE_KIND_LABEL[kind]} className={className} />;
}
