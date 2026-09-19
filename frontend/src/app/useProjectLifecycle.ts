import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DTO } from "../api/client";

const LAST_PROJECT = "concord:last-project";
const RECENT_PROJECTS = "concord:recent-projects";
export const DEMO_PROJECT_ID = "harbor-east";

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function recentIds(): string[] {
  try {
    return JSON.parse(
      localStorage.getItem(RECENT_PROJECTS) ?? "[]",
    ) as string[];
  } catch {
    return [];
  }
}

/** Client preference only; all project facts still come from the backend. */
export function useProjectLifecycle() {
  const cache = useQueryClient();
  const [project, setProject] = useState(() => read(LAST_PROJECT));
  const [recent, setRecent] = useState(recentIds);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects,
    retry: 1,
  });

  function openProject(id: string) {
    setProject(id);
    const next = [id, ...recent.filter((item) => item !== id)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem(LAST_PROJECT, id);
      localStorage.setItem(RECENT_PROJECTS, JSON.stringify(next));
    } catch {
      // Storage is a convenience. A blocked preference must not block the project.
    }
  }

  useEffect(() => {
    if (!projects.data) return;
    if (projects.data.some((item) => item.id === project)) return;
    const available = new Set(projects.data.map((item) => item.id));
    const remembered = recent.find((id) => available.has(id));
    const firstReal = projects.data.find((item) => item.id !== DEMO_PROJECT_ID);
    if (remembered) openProject(remembered);
    else if (firstReal) openProject(firstReal.id);
    else setProject("");
    // Reconcile only when the authoritative catalog changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data]);

  const create = useMutation({
    mutationFn: (input: DTO<"CreateProject">) => api.createProject(input),
    onSuccess: async (created) => {
      await cache.invalidateQueries({ queryKey: ["projects"] });
      openProject(created.id);
    },
  });

  const demo = useMutation({
    mutationFn: async () => {
      const existing = projects.data?.find(
        (item) => item.id === DEMO_PROJECT_ID,
      );
      if (existing) return existing;
      await api.reset();
      await cache.invalidateQueries({ queryKey: ["projects"] });
      return { id: DEMO_PROJECT_ID };
    },
    onSuccess: (item) => openProject(item.id),
  });

  return {
    project,
    projects,
    recent: recent
      .map((id) => projects.data?.find((item) => item.id === id))
      .filter((item): item is DTO<"Project"> => !!item),
    openProject,
    create,
    openDemo: demo,
  };
}
