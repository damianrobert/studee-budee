"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/input";
import { deleteFile, setFileProject } from "@/lib/actions/files";

export function DeleteFileButton({ id, name, used }: { id: string; name: string; used: number }) {
  const router = useRouter();
  return (
    <Confirm
      title={`Delete “${name}”?`}
      description={
        used
          ? `It's attached to ${used} note${used === 1 ? "" : "s"}/postmortem${used === 1 ? "" : "s"}; those links will break. The file is removed from disk.`
          : "The file is removed from disk."
      }
      onConfirm={async () => {
        await deleteFile(id);
        router.push("/files");
      }}
    >
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        <Trash2 aria-hidden /> Delete
      </Button>
    </Confirm>
  );
}

export function FileProjectSelect({
  id,
  projectId,
  projects,
}: {
  id: string;
  projectId: string | null;
  projects: { id: string; name: string }[];
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Select
      aria-label="Project"
      className="w-auto"
      disabled={pending}
      value={projectId ?? ""}
      onChange={(e) =>
        startTransition(async () => void (await setFileProject(id, e.target.value || null)))
      }
    >
      <option value="">No project</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
