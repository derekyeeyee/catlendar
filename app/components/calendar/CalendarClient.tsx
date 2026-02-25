"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  addMonths,
} from "date-fns";

type EventDTO = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
};

function dayKey(d: Date) {
  // local-day key for grouping in UI
  return format(d, "yyyy-MM-dd");
}

function eventStartLocalDayKey(e: EventDTO) {
  return dayKey(new Date(e.start));
}

export default function CalendarClient() {
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);

  // 6-week grid range (Month view)
  const gridStart = useMemo(
    () => startOfWeek(monthStart, { weekStartsOn: 0 }),
    [monthStart]
  );
  const gridEnd = useMemo(
    () => endOfWeek(monthEnd, { weekStartsOn: 0 }),
    [monthEnd]
  );

  // Build 42 cells
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 35; i++) out.push(addDays(gridStart, i));
    return out;
  }, [gridStart]);

  // Group events by day for quick rendering
  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventDTO[]>();
    for (const e of events) {
      const k = eventStartLocalDayKey(e);
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    // sort each day
    for (const [k, list] of map) {
      list.sort((a, b) => a.start.localeCompare(b.start));
      map.set(k, list);
    }
    return map;
  }, [events]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const url = new URL("/api/events/range", window.location.origin);
        url.searchParams.set("start", gridStart.toISOString());
        url.searchParams.set("end", gridEnd.toISOString());

        const res = await fetch(url.toString(), { signal: controller.signal });
        const data = await res.json();
        setEvents(data.events ?? []);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [gridStart, gridEnd]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div>
          <div className="text-xl font-semibold">{format(cursor, "MMMM yyyy")}</div>
          <div className="text-sm text-slate-400">
            {loading ? "Loading…" : `${events.length} events`}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800"
            onClick={() => setCursor(new Date())}
          >
            Today
          </button>
          <button
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800"
            onClick={() => setCursor((d) => subMonths(d, 1))}
          >
            ←
          </button>
          <button
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800"
            onClick={() => setCursor((d) => addMonths(d, 1))}
          >
            →
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-slate-800 text-slate-400 text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} className="p-3 border-r border-slate-800 last:border-r-0">
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const isToday = isSameDay(d, new Date());

          return (
            <div
              key={key}
              className={[
                "min-h-[140px] p-2 border-r border-b border-slate-800 last:border-r-0",
                inMonth ? "bg-slate-950" : "bg-slate-950/30",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <div
                  className={[
                    "text-sm font-medium",
                    inMonth ? "text-slate-200" : "text-slate-500",
                  ].join(" ")}
                >
                  {format(d, "d")}
                </div>
                {isToday && (
                  <div className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
                    Today
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1">
                {dayEvents.slice(0, 4).map((e) => (
                  <button
                    key={e.id}
                    className="w-full text-left text-xs px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 truncate"
                    title={e.title}
                    onClick={() => {
                      // later: open edit modal
                      alert(`${e.title}\n${e.start} → ${e.end}`);
                    }}
                  >
                    {e.title}
                  </button>
                ))}
                {dayEvents.length > 4 && (
                  <div className="text-xs text-slate-400 px-2">
                    +{dayEvents.length - 4} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}