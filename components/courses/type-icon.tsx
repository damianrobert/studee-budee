import type { CourseItemType } from "@prisma/client";
import {
  Book,
  BookOpen,
  Compass,
  Link as LinkIcon,
  ListVideo,
  Newspaper,
  Terminal,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ITEM_TYPE_LABEL } from "@/lib/courses";

export const TYPE_ICON: Record<CourseItemType, LucideIcon> = {
  VIDEO: Video,
  PLAYLIST: ListVideo,
  ARTICLE: Newspaper,
  DOCS: BookOpen,
  GUIDE: Compass,
  TUTORIAL: Terminal,
  TOOL: Wrench,
  BOOK: Book,
  OTHER: LinkIcon,
};

export function TypeIcon({ type, className }: { type: CourseItemType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon aria-label={ITEM_TYPE_LABEL[type]} className={className} />;
}
