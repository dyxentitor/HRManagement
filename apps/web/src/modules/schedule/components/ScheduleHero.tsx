import { useEffect, useState } from "react"

import { StatusPill } from "@/components/hrms"
import type { ClockState } from "@/components/hrms/ClockInOutWidget"
import { Button } from "@/components/ui/button"

import type { DayModel } from "../lib/day-model"

interface Props {
  today: DayModel | null
  clockState: ClockState
  statusLabel: string
  canClock: boolean
  busy: boolean
  onClockIn: () => void
  onClockOut: () => void
}

function fmtElapsed(sinceIso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function headline(today: DayModel | null): string {
  if (today?.shift) {
    return today.shift.timeRange
      ? `${today.shift.name} · ${today.shift.timeRange}`
      : today.shift.name
  }
  if (today?.leaveTypeCode) return `On leave · ${today.leaveTypeCode}`
  return "No shift scheduled"
}

/**
 * Aurora hero. Absorbs the clock widget's job — a live HH:MM plus elapsed time,
 * re-rendered on a 60s tick (same cadence as ClockInOutWidget).
 */
export function ScheduleHero({
  today,
  clockState,
  statusLabel,
  canClock,
  busy,
  onClockIn,
  onClockOut,
}: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const now = new Date()
  const dateLabel = now.toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const clockLabel = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return (
    <section className="relative rounded-2xl overflow-hidden border border-border-subtle min-h-[140px]">
      <div className="hero-aurora absolute inset-0" aria-hidden />
      <div className="relative z-10 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label text-accent-200">Schedule · {dateLabel}</p>
            <h1 className="text-[26px] font-extrabold tracking-tight mt-1 text-text-primary">
              {headline(today)}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusPill tone="sky" label={statusLabel} />
              {today?.holidayName && <StatusPill tone="peach" label={today.holidayName} />}
              {today?.shift && today.leaveTypeCode && (
                <StatusPill tone="lavender" label={`On leave · ${today.leaveTypeCode}`} />
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-label text-text-tertiary">Now</p>
              <p
                data-testid="hero-clock"
                className="font-mono text-h2 text-text-primary leading-none mt-0.5"
              >
                {clockLabel}
              </p>
            </div>
            {canClock && clockState.status !== "out" && (
              <Button
                type="button"
                disabled={busy}
                onClick={clockState.status === "in" ? onClockOut : onClockIn}
                className="soft-glow rounded-xl bg-accent-500 text-white"
              >
                {clockState.status === "in" ? "Clock out" : "Clock in"}
              </Button>
            )}
          </div>
        </div>

        <p className="text-small text-text-secondary mt-4">
          {clockState.status === "in" ? (
            <span className="text-mint">● Clocked in · {fmtElapsed(clockState.since)} elapsed</span>
          ) : clockState.status === "out" ? (
            <span>
              Clocked in {clockState.clockedIn} · clocked out {clockState.clockedOut}
            </span>
          ) : (
            <span>Not clocked in yet today.</span>
          )}
        </p>
      </div>
    </section>
  )
}
