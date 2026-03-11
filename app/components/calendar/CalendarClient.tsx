"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

type PlannerView = "month" | "week" | "day";

type EventDTO = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
};

type TaskDTO = {
  id: string;
  title: string;
  dueAt: string | null;
  completed: boolean;
};

type ReminderDTO = {
  id: string;
  remindAt: string;
  eventId: string | null;
  taskId: string | null;
};

type NotificationDTO = {
  id: string;
  reminderId: string;
  sentAt: string | null;
  readAt: string | null;
};

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAY_CODES)[number], string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};

function toDayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function dayFromIso(iso: string) {
  return toDayKey(new Date(iso));
}

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function weekdayCodeForDate(date: Date) {
  return WEEKDAY_CODES[date.getDay()];
}

function splitLocalInput(localDateTime: string) {
  const [datePart, timePartRaw] = localDateTime.split("T");
  const timePart = (timePartRaw ?? "09:00").slice(0, 5);
  return { date: datePart, time: timePart };
}

function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function addMinutesToTime(time: string, minutesToAdd: number) {
  const [h, m] = time.split(":").map((n) => Number(n));
  const total = h * 60 + m + minutesToAdd;
  const normalized = ((total % 1440) + 1440) % 1440;
  const outH = String(Math.floor(normalized / 60)).padStart(2, "0");
  const outM = String(normalized % 60).padStart(2, "0");
  return `${outH}:${outM}`;
}

function toAmPmLabel(time24: string) {
  const [hRaw, mRaw] = time24.split(":");
  const hour24 = Number(hRaw);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${mRaw} ${suffix}`;
}

function viewRange(cursor: Date, view: PlannerView) {
  if (view === "month") {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    return {
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
    };
  }
  if (view === "week") {
    const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
    return {
      start: startOfDay(weekStart),
      end: endOfDay(addDays(weekStart, 6)),
    };
  }
  return { start: startOfDay(cursor), end: endOfDay(cursor) };
}

function useVisibleDays(cursor: Date, view: PlannerView) {
  return useMemo(() => {
    const { start } = viewRange(cursor, view);
    if (view === "month") return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return [start];
  }, [cursor, view]);
}

export default function CalendarClient() {
  const [now, setNow] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [view, setView] = useState<PlannerView>("week");
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [reminders, setReminders] = useState<ReminderDTO[]>([]);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDate, setCreateDate] = useState(() => splitLocalInput(toLocalInputValue(new Date())).date);
  const [createStartTime, setCreateStartTime] = useState(() => splitLocalInput(toLocalInputValue(new Date())).time);
  const [createEndTime, setCreateEndTime] = useState(() => addMinutesToTime(splitLocalInput(toLocalInputValue(new Date())).time, 60));
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatDays, setRepeatDays] = useState<string[]>(() => []);
  const [repeatUntil, setRepeatUntil] = useState(() => format(addMonths(new Date(), 4), "yyyy-MM-dd"));
  const [createError, setCreateError] = useState("");
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const range = useMemo(() => viewRange(cursor, view), [cursor, view]);
  const visibleDays = useVisibleDays(cursor, view);

  const byDay = useMemo(() => {
    const eventsByDay = new Map<string, EventDTO[]>();
    const tasksByDay = new Map<string, TaskDTO[]>();
    const remindersByDay = new Map<string, ReminderDTO[]>();

    for (const e of events) {
      const key = dayFromIso(e.start);
      const list = eventsByDay.get(key) ?? [];
      list.push(e);
      eventsByDay.set(key, list);
    }
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const key = dayFromIso(t.dueAt);
      const list = tasksByDay.get(key) ?? [];
      list.push(t);
      tasksByDay.set(key, list);
    }
    for (const r of reminders) {
      const key = dayFromIso(r.remindAt);
      const list = remindersByDay.get(key) ?? [];
      list.push(r);
      remindersByDay.set(key, list);
    }
    for (const list of eventsByDay.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return { eventsByDay, tasksByDay, remindersByDay };
  }, [events, tasks, reminders]);

  const loadPlanner = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const url = new URL("/api/planner/range", window.location.origin);
        url.searchParams.set("start", range.start.toISOString());
        url.searchParams.set("end", range.end.toISOString());
        const response = await fetch(url.toString(), { signal });
        const payload = await response.json();

        setEvents(payload.events ?? []);
        setTasks(payload.tasks ?? []);
        setReminders(payload.reminders ?? []);
        setNotifications(payload.notifications ?? []);
      } finally {
        setLoading(false);
      }
    },
    [range.end, range.start]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadPlanner(controller.signal);
    return () => controller.abort();
  }, [loadPlanner]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!repeatWeekly) return;
    if (repeatDays.length > 0) return;
    setRepeatDays([weekdayCodeForDate(combineDateAndTime(createDate, createStartTime))]);
  }, [repeatDays.length, repeatWeekly, createDate, createStartTime]);

  const selectedKey = toDayKey(selectedDay);
  const selectedEvents = byDay.eventsByDay.get(selectedKey) ?? [];
  const selectedTasks = byDay.tasksByDay.get(selectedKey) ?? [];
  const selectedReminders = byDay.remindersByDay.get(selectedKey) ?? [];

  const miniMonthStart = startOfMonth(cursor);
  const miniGridStart = startOfWeek(miniMonthStart, { weekStartsOn: 0 });
  const miniDays = Array.from({ length: 42 }, (_, i) => addDays(miniGridStart, i));

  const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
  const nowLineTop = `${(minutesIntoDay / (24 * 60)) * 100}%`;
  const showNowLine = view !== "month" && visibleDays.some((day) => isSameDay(day, now));
  const timeOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        options.push({ value, label: toAmPmLabel(value) });
      }
    }
    return options;
  }, []);

  function jumpToday() {
    const current = new Date();
    setCursor(current);
    setSelectedDay(current);
    setCreateDate(format(current, "yyyy-MM-dd"));
  }

  function stepBackward() {
    if (view === "month") setCursor((d) => subMonths(d, 1));
    if (view === "week") setCursor((d) => subWeeks(d, 1));
    if (view === "day") setCursor((d) => subDays(d, 1));
  }

  function stepForward() {
    if (view === "month") setCursor((d) => addMonths(d, 1));
    if (view === "week") setCursor((d) => addWeeks(d, 1));
    if (view === "day") setCursor((d) => addDays(d, 1));
  }

  async function createEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating) return;
    setCreateError("");
    setActionError("");
    setCreating(true);
    try {
      const start = combineDateAndTime(createDate, createStartTime);
      const end = combineDateAndTime(createDate, createEndTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        setCreateError("Please pick a valid date and time.");
        return;
      }
      if (end <= start) {
        setCreateError("End time must be after start time.");
        return;
      }
      if (repeatWeekly && repeatDays.length === 0) {
        setCreateError("Select at least one weekday for weekly recurrence.");
        return;
      }
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle,
          description: createDescription,
          start: start.toISOString(),
          end: end.toISOString(),
          recurrence: repeatWeekly
            ? {
                frequency: "weekly",
                interval: 1,
                byWeekday: repeatDays,
                until: new Date(`${repeatUntil}T23:59:59`).toISOString(),
              }
            : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setCreateError(payload.error ?? "Could not create event");
        return;
      }
      setCreateTitle("");
      setCreateDescription("");
      setRepeatWeekly(false);
      setRepeatDays([weekdayCodeForDate(start)]);
      setCreateDate(format(start, "yyyy-MM-dd"));
      setCreateStartTime(format(start, "HH:mm"));
      setCreateEndTime(format(end, "HH:mm"));
      setSelectedDay(start);
      setCursor(start);
      await loadPlanner();
    } catch {
      setCreateError("Could not create event");
    } finally {
      setCreating(false);
    }
  }

  async function deleteEvent(
    occurrenceId: string,
    deleteMode: "occurrence" | "series" = "occurrence"
  ) {
    if (deletingId) return;
    setActionError("");
    setDeletingId(occurrenceId);
    try {
      const response = await fetch("/api/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurrenceId, deleteMode }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error ?? "Could not remove event");
        return;
      }
      await loadPlanner();
    } catch {
      setActionError("Could not remove event");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleRepeatDay(code: string) {
    setRepeatDays((days) =>
      days.includes(code) ? days.filter((d) => d !== code) : [...days, code]
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 shadow-2xl">
      <div className="flex h-[80vh] min-h-[680px] flex-row">
        <aside className="w-[320px] shrink-0 overflow-y-auto border-r border-slate-800 p-4">
          <form onSubmit={createEvent} className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Create event</div>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="mb-2 w-full rounded-md bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              placeholder="Event title"
              required
            />
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              className="mb-2 h-16 w-full rounded-md bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              placeholder="Description (optional)"
            />
            <label className="mb-1 block text-[11px] text-slate-400">Date</label>
            <input
              type="date"
              value={createDate}
              onChange={(e) => setCreateDate(e.target.value)}
              className="mb-2 w-full rounded-md bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              required
            />
            <div className="mb-1 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-400">Start time</label>
              <label className="text-[11px] text-slate-400">End time</label>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <select
                value={createStartTime}
                onChange={(e) => setCreateStartTime(e.target.value)}
                className="rounded-md bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              >
                {timeOptions.map((t) => (
                  <option key={`start-${t.value}`} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select
                value={createEndTime}
                onChange={(e) => setCreateEndTime(e.target.value)}
                className="rounded-md bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              >
                {timeOptions.map((t) => (
                  <option key={`end-${t.value}`} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-2 flex gap-1">
              {[30, 60, 90].map((m) => (
                <button
                  key={`dur-${m}`}
                  type="button"
                  onClick={() => setCreateEndTime(addMinutesToTime(createStartTime, m))}
                  className="rounded bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                >
                  +{m}m
                </button>
              ))}
            </div>
            <label className="mb-2 flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={repeatWeekly}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRepeatWeekly(checked);
                  setRepeatDays(
                    checked
                      ? [weekdayCodeForDate(combineDateAndTime(createDate, createStartTime))]
                      : []
                  );
                }}
              />
              Repeat weekly
            </label>
            {repeatWeekly && (
              <div className="mb-2 rounded-md border border-slate-800 bg-slate-950/60 p-2">
                <div className="mb-1 text-[11px] text-slate-400">Repeats on</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {WEEKDAY_CODES.map((code) => (
                    <label
                      key={code}
                      className={[
                        "cursor-pointer rounded px-2 py-1 text-[11px]",
                        repeatDays.includes(code)
                          ? "bg-sky-600 text-white"
                          : "bg-slate-900 text-slate-300",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={repeatDays.includes(code)}
                        onChange={() => toggleRepeatDay(code)}
                        className="mr-1 align-middle"
                      />
                      {WEEKDAY_LABELS[code]}
                    </label>
                  ))}
                </div>
                <label className="mb-1 block text-[11px] text-slate-400">Repeat until</label>
                <input
                  type="date"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  className="w-full rounded-md bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  required
                />
              </div>
            )}
            {createError && <p className="mb-2 text-xs text-red-400">{createError}</p>}
            {actionError && <p className="mb-2 text-xs text-red-400">{actionError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-md bg-emerald-600 px-2 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {creating ? "Creating..." : "Add event"}
            </button>
          </form>

          <button
            type="button"
            onClick={jumpToday}
            className="mb-4 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Today
          </button>

          <div className="mb-3 text-sm font-semibold text-slate-200">{format(cursor, "MMMM yyyy")}</div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
              <div key={`${d}-${idx}`}>{d}</div>
            ))}
            {miniDays.map((day) => {
              const inMonth = isSameMonth(day, miniMonthStart);
              const selected = isSameDay(day, selectedDay);
              return (
                <button
                  type="button"
                  key={`mini-${toDayKey(day)}`}
                  onClick={() => {
                    setSelectedDay(day);
                    setCursor(day);
                  }}
                  className={[
                    "rounded-md px-1 py-1 text-[11px]",
                    inMonth ? "text-slate-200" : "text-slate-500",
                    selected ? "bg-sky-600 text-white" : "hover:bg-slate-900",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <div className="mt-5 border-t border-slate-800 pt-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Agenda</div>
            <div className="mt-2 text-sm text-slate-200">{format(selectedDay, "EEEE, MMM d")}</div>
            <div className="mt-2 space-y-2 text-xs text-slate-300">
              {selectedEvents.slice(0, 5).map((e) => (
                <div key={`agenda-event-${e.id}`} className="rounded-md bg-slate-900 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{e.title}</div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => deleteEvent(e.id, "occurrence")}
                        disabled={deletingId === e.id}
                        className="rounded bg-slate-800 px-1.5 text-[10px] text-red-300 disabled:opacity-40"
                        title="Delete this occurrence"
                      >
                        One
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvent(e.id, "series")}
                        disabled={deletingId === e.id}
                        className="rounded bg-red-900/60 px-1.5 text-[10px] text-red-100 disabled:opacity-40"
                        title="Delete all recurring occurrences"
                      >
                        All
                      </button>
                    </div>
                  </div>
                  <div className="text-slate-400">{format(new Date(e.start), "p")}</div>
                </div>
              ))}
              {selectedTasks.slice(0, 3).map((t) => (
                <div key={`agenda-task-${t.id}`} className="rounded-md bg-emerald-900/30 px-2 py-1">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="text-slate-400">{t.completed ? "Completed" : "Open task"}</div>
                </div>
              ))}
              {selectedReminders.slice(0, 3).map((r) => (
                <div key={`agenda-reminder-${r.id}`} className="rounded-md bg-amber-900/30 px-2 py-1">
                  <div className="truncate font-medium">Reminder</div>
                  <div className="text-slate-400">{format(new Date(r.remindAt), "p")}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={stepBackward}>
                Prev
              </button>
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={stepForward}>
                Next
              </button>
              <h2 className="ml-2 text-lg font-semibold text-slate-100">
                {view === "month" && format(cursor, "MMMM yyyy")}
                {view === "week" && `${format(range.start, "MMM d")} - ${format(range.end, "MMM d, yyyy")}`}
                {view === "day" && format(cursor, "EEEE, MMMM d, yyyy")}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {(["day", "week", "month"] as PlannerView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={v === view ? "rounded-md bg-sky-600 px-3 py-2 text-sm text-white" : "rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 text-sm text-slate-400">
            {loading
              ? "Loading planner data..."
              : `${events.length} events, ${tasks.length} tasks, ${reminders.length} reminders, ${notifications.length} notifications`}
          </div>

          {view === "month" && (
            <>
              <div className="grid grid-cols-7 border-y border-slate-800 text-xs text-slate-400">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => (
                  <div key={name} className="border-r border-slate-800 p-2 last:border-r-0">
                    {name}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {visibleDays.map((day) => {
                  const key = toDayKey(day);
                  const dayEvents = byDay.eventsByDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, cursor);
                  const selected = isSameDay(day, selectedDay);
                  return (
                    <button
                      type="button"
                      key={`m-${key}`}
                      onClick={() => setSelectedDay(day)}
                      className={[
                        "min-h-[132px] border-b border-r border-slate-800 p-2 text-left align-top last:border-r-0",
                        inMonth ? "bg-slate-950" : "bg-slate-950/40",
                        selected ? "ring-1 ring-sky-500" : "",
                      ].join(" ")}
                    >
                      <div className="mb-2">
                        <span className={isToday(day) ? "rounded-full bg-sky-600 px-2 py-0.5 text-xs text-white" : "text-xs text-slate-300"}>
                          {format(day, "d")}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div key={e.id} className="truncate rounded bg-sky-900/40 px-2 py-1 text-xs text-slate-100">
                            {format(new Date(e.start), "p")} {e.title}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view !== "month" && (
            <div className="relative">
              {showNowLine && (
                <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: nowLineTop }}>
                  <div className="relative border-t border-red-400/90">
                    <span className="absolute -top-2 left-2 h-3 w-3 rounded-full bg-red-400" />
                  </div>
                </div>
              )}
              <div
                className="grid min-h-[640px] border-t border-slate-800"
                style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))` }}
              >
                {visibleDays.map((day) => {
                  const key = toDayKey(day);
                  const dayEvents = byDay.eventsByDay.get(key) ?? [];
                  return (
                    <button
                      type="button"
                      key={`d-${key}`}
                      onClick={() => setSelectedDay(day)}
                      className={[
                        "border-r border-slate-800 p-2 text-left last:border-r-0",
                        isSameDay(day, selectedDay) ? "bg-slate-900/30" : "bg-slate-950",
                      ].join(" ")}
                    >
                      <div className="mb-2 border-b border-slate-800 pb-2">
                        <div className="text-xs uppercase tracking-wide text-slate-400">{format(day, "EEE")}</div>
                        <div className={isToday(day) ? "text-sky-300" : "text-slate-100"}>{format(day, "MMM d")}</div>
                      </div>
                      <div className="space-y-2">
                        {dayEvents.map((e) => (
                          <div key={e.id} className="rounded-md bg-sky-900/40 px-2 py-1 text-xs text-slate-100">
                            <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">{e.title}</div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    deleteEvent(e.id, "occurrence");
                                  }}
                                  disabled={deletingId === e.id}
                                  className="rounded bg-slate-800 px-1.5 text-[10px] text-red-300 disabled:opacity-40"
                                  title="Delete this occurrence"
                                >
                                  One
                                </button>
                                <button
                                  type="button"
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    deleteEvent(e.id, "series");
                                  }}
                                  disabled={deletingId === e.id}
                                  className="rounded bg-red-900/60 px-1.5 text-[10px] text-red-100 disabled:opacity-40"
                                  title="Delete all recurring occurrences"
                                >
                                  All
                                </button>
                              </div>
                            </div>
                            <div className="text-slate-300">{format(new Date(e.start), "p")}</div>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
