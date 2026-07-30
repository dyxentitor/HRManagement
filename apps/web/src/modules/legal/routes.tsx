import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const LegalPage = lazy(() => import("./pages/LegalPage"))

export const legalRoutes: RouteObject[] = [
  { path: "/legal/privacy", element: <LegalPage doc="privacy" /> },
  { path: "/legal/terms", element: <LegalPage doc="terms" /> },
  { path: "/legal/security", element: <LegalPage doc="security" /> },
]
