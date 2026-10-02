"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "@/lib/commerce";

type StudioOption = {
  id: string;
  name: string;
  slug: string;
  city: string;
  priceMad: number | null;
  currency: string;
  photoUrl: string | null;
};

type Project = {
  id: string;
  name: string;
  date: string;
  durationHours: number;
  note: string;
  studioIds: string[];
  preferredStudioId: string;
  studioNotes: Record<string, string>;
};

const STORAGE_KEY = "36-shortlist-projects-v1";

function readProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Project =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Array.isArray(item.studioIds),
    );
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(projects),
  );
}

function createProject(name: string): Project {
  return {
    id:
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8),
    name: name.trim() || "Untitled project",
    date: "",
    durationHours: 1,
    note: "",
    studioIds: [],
    preferredStudioId: "",
    studioNotes: {},
  };
}

export function ShortlistProjects({
  studios,
}: {
  studios: StudioOption[];
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = readProjects();
    setProjects(stored);
    setActiveId(stored[0]?.id || "");
  }, []);

  const active =
    projects.find((project) => project.id === activeId) ||
    null;

  function persist(next: Project[]) {
    setProjects(next);
    saveProjects(next);
  }

  function addProject() {
    const project = createProject(
      newName || "New studio project",
    );
    persist([...projects, project]);
    setActiveId(project.id);
    setNewName("");
    setMessage("");
  }

  function updateActive(
    patch:
      | Partial<Project>
      | ((project: Project) => Project),
  ) {
    if (!active) return;
    persist(
      projects.map((project) => {
        if (project.id !== active.id) return project;
        return typeof patch === "function"
          ? patch(project)
          : { ...project, ...patch };
      }),
    );
  }

  function deleteActive() {
    if (!active) return;
    const next = projects.filter(
      (project) => project.id !== active.id,
    );
    persist(next);
    setActiveId(next[0]?.id || "");
    setMessage("");
  }

  function toggleStudio(studioId: string) {
    updateActive((project) => {
      const selected = project.studioIds.includes(studioId);
      const studioIds = selected
        ? project.studioIds.filter((id) => id !== studioId)
        : [...project.studioIds, studioId].slice(0, 12);

      return {
        ...project,
        studioIds,
        preferredStudioId:
          project.preferredStudioId === studioId &&
          selected
            ? ""
            : project.preferredStudioId,
      };
    });
  }

  const selectedStudios = useMemo(
    () =>
      active
        ? active.studioIds
            .map((id) =>
              studios.find((studio) => studio.id === id),
            )
            .filter(
              (studio): studio is StudioOption =>
                Boolean(studio),
            )
        : [],
    [active, studios],
  );

  const compareHref = useMemo(() => {
    if (!active || selectedStudios.length < 2) {
      return "";
    }
    const params = new URLSearchParams();
    params.set(
      "ids",
      selectedStudios
        .slice(0, 4)
        .map((studio) => studio.id)
        .join(","),
    );
    if (active.date) params.set("date", active.date);
    params.set(
      "duration",
      String(active.durationHours || 1),
    );
    return "/studios/compare?" + params.toString();
  }, [active, selectedStudios]);

  async function copyShareLink() {
    if (!active || selectedStudios.length < 2) {
      setMessage("Add at least 2 studios first.");
      return;
    }

    const params = new URLSearchParams();
    params.set(
      "ids",
      selectedStudios
        .slice(0, 4)
        .map((studio) => studio.id)
        .join(","),
    );
    if (active.date) params.set("date", active.date);
    params.set(
      "duration",
      String(active.durationHours || 1),
    );

    const url =
      window.location.origin +
      "/studios/compare?" +
      params.toString();

    try {
      await navigator.clipboard.writeText(url);
      setMessage("Share link copied.");
    } catch {
      setMessage(url);
    }
  }

  return (
    <section className="mt-10 rounded-3xl border border-[#ebebeb] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">
            Project shortlists
          </span>
          <h2 className="mt-2 text-3xl font-black">
            Plan a studio project
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#8a8a8a]">
            Organize saved studios by project, add notes, pick a
            preferred option and compare up to four at a time.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(event) =>
              setNewName(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addProject();
              }
            }}
            maxLength={80}
            placeholder="Album recording…"
            className="field w-48"
          />
          <button
            type="button"
            onClick={addProject}
            className="rounded-xl bg-acid px-4 py-2 text-xs font-black text-white"
          >
            + Project
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#dddddd] p-8 text-center">
          <b className="text-sm">No shortlist projects yet</b>
          <p className="mt-2 text-xs text-[#8a8a8a]">
            Create one above, then add studios from your
            Favorites.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[230px_1fr]">
          <aside>
            <div className="space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setActiveId(project.id);
                    setMessage("");
                  }}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (project.id === activeId
                      ? "border-acid/35 bg-acid/[0.04]"
                      : "border-[#ebebeb] bg-[#f7f7f7] hover:border-[#cfcfcf]")
                  }
                >
                  <b className="block truncate text-xs">
                    {project.name}
                  </b>
                  <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                    {project.studioIds.length} studio
                    {project.studioIds.length === 1
                      ? ""
                      : "s"}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {active && (
            <div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="xl:col-span-2">
                  <span className="label">Project name</span>
                  <input
                    className="field"
                    value={active.name}
                    maxLength={80}
                    onChange={(event) =>
                      updateActive({
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span className="label">Target date</span>
                  <input
                    className="field"
                    type="date"
                    value={active.date}
                    onChange={(event) =>
                      updateActive({
                        date: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span className="label">Duration</span>
                  <select
                    className="field"
                    value={active.durationHours}
                    onChange={(event) =>
                      updateActive({
                        durationHours: Number(
                          event.target.value,
                        ),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(
                      (hours) => (
                        <option key={hours} value={hours}>
                          {hours}h
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <span className="label">Project note</span>
                <textarea
                  className="field min-h-20"
                  value={active.note}
                  maxLength={800}
                  placeholder="Goal, budget, client requirements…"
                  onChange={(event) =>
                    updateActive({
                      note: event.target.value,
                    })
                  }
                />
              </label>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {studios.map((studio) => {
                  const selected =
                    active.studioIds.includes(studio.id);
                  const preferred =
                    active.preferredStudioId === studio.id;

                  return (
                    <div
                      key={studio.id}
                      className={
                        "overflow-hidden rounded-2xl border " +
                        (selected
                          ? "border-acid/35 bg-acid/[0.025]"
                          : "border-[#ebebeb] bg-[#f7f7f7]")
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          toggleStudio(studio.id)
                        }
                        className="flex w-full items-center gap-3 p-3 text-left"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f3f3f3]">
                          {studio.photoUrl ? (
                            <img
                              src={studio.photoUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-xs font-black text-acid">
                              36
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <b className="block truncate text-xs">
                            {studio.name}
                          </b>
                          <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                            {studio.city}
                            {studio.priceMad
                              ? " · " +
                                formatMoney(studio.priceMad, studio.currency) +
                                "/h"
                              : ""}
                          </span>
                        </div>
                        <span
                          className={
                            "grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black " +
                            (selected
                              ? "border-acid bg-acid text-white"
                              : "border-[#dddddd] text-[#a3a3a3]")
                          }
                        >
                          {selected ? "✓" : "+"}
                        </span>
                      </button>

                      {selected && (
                        <div className="border-t border-[#ebebeb] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateActive({
                                  preferredStudioId:
                                    preferred
                                      ? ""
                                      : studio.id,
                                })
                              }
                              className={
                                "text-[10px] font-black " +
                                (preferred
                                  ? "text-acid"
                                  : "text-[#8a8a8a]")
                              }
                            >
                              {preferred
                                ? "★ Preferred"
                                : "☆ Mark preferred"}
                            </button>
                            <Link
                              href={
                                "/studios/" + studio.slug
                              }
                              className="text-[10px] font-black text-[#717171] hover:text-[#222222]"
                            >
                              Open →
                            </Link>
                          </div>
                          <textarea
                            className="field mt-3 min-h-16 text-xs"
                            maxLength={400}
                            placeholder="Note about this studio…"
                            value={
                              active.studioNotes[
                                studio.id
                              ] || ""
                            }
                            onChange={(event) =>
                              updateActive(
                                (project) => ({
                                  ...project,
                                  studioNotes: {
                                    ...project.studioNotes,
                                    [studio.id]:
                                      event.target.value,
                                  },
                                }),
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ebebeb] pt-5">
                <button
                  type="button"
                  onClick={deleteActive}
                  className="text-xs font-black text-red-400/70 hover:text-red-300"
                >
                  Delete project
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {message && (
                    <span className="text-[10px] text-emerald-600">
                      {message}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={copyShareLink}
                    disabled={selectedStudios.length < 2}
                    className="button-dark disabled:opacity-40"
                  >
                    Share shortlist
                  </button>
                  {compareHref ? (
                    <Link
                      href={compareHref}
                      className="rounded-xl bg-acid px-4 py-3 text-xs font-black text-white"
                    >
                      Compare selected →
                    </Link>
                  ) : (
                    <span className="rounded-xl border border-[#ebebeb] px-4 py-3 text-xs font-black text-[#a3a3a3]">
                      Select 2+ to compare
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-3 text-[10px] leading-5 text-[#a3a3a3]">
                Project data is stored in this browser in v1.
                Favorites themselves remain synced to your 36
                account.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
