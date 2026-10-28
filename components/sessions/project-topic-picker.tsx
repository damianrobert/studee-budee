"use client";

import { Field, Select } from "@/components/ui/input";
import type { ProjectOption } from "@/lib/sessions";

export type ProjectTopic = { projectId: string | null; topicId: string | null };

export function ProjectTopicPicker({
  projects,
  value,
  onChange,
  idPrefix,
}: {
  projects: ProjectOption[];
  value: ProjectTopic;
  onChange: (v: ProjectTopic) => void;
  idPrefix: string;
}) {
  const topics = projects.find((p) => p.id === value.projectId)?.topics ?? [];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Project" htmlFor={`${idPrefix}-project`}>
        <Select
          id={`${idPrefix}-project`}
          value={value.projectId ?? ""}
          onChange={(e) => onChange({ projectId: e.target.value || null, topicId: null })}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status === "ACTIVE" ? " (active)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Topic" htmlFor={`${idPrefix}-topic`}>
        <Select
          id={`${idPrefix}-topic`}
          value={value.topicId ?? ""}
          disabled={!topics.length}
          onChange={(e) => onChange({ ...value, topicId: e.target.value || null })}
        >
          <option value="">{topics.length ? "No specific topic" : "—"}</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
