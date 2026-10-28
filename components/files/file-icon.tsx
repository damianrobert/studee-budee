import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
} from "lucide-react";
import { fileExt, previewKind } from "@/lib/files";

export function FileIcon({
  mimeType,
  name,
  className,
}: {
  mimeType: string;
  name: string;
  className?: string;
}) {
  const kind = previewKind(mimeType, name);
  const Icon =
    kind === "image" || mimeType === "image/svg+xml"
      ? FileImage
      : kind === "video"
        ? FileVideo
        : kind === "audio"
          ? FileAudio
          : kind === "pdf"
            ? FileText
            : kind === "text"
              ? ["txt", "log", "md", "csv"].includes(fileExt(name))
                ? FileText
                : FileCode
              : /zip|gzip|tar/.test(mimeType)
                ? FileArchive
                : File;
  return <Icon className={className} aria-hidden />;
}
