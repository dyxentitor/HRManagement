import { Outlet } from "react-router-dom"

import { HelpNav } from "./HelpNav"

export default function HelpShell() {
  return (
    <div className="flex min-h-[calc(100vh-32px)] gap-3">
      <HelpNav />
      <main className="flex-1 overflow-auto rounded-lg bg-surface p-6">
        <Outlet />
      </main>
    </div>
  )
}
