import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const HelpShell = lazy(() => import("./HelpShell"))
const HelpHomePage = lazy(() => import("./pages/HelpHomePage"))
const HelpCategoryPage = lazy(() => import("./pages/HelpCategoryPage"))
const HelpArticlePage = lazy(() => import("./pages/HelpArticlePage"))

export const helpRoutes: RouteObject[] = [
  {
    path: "/help",
    element: <HelpShell />,
    children: [
      { index: true, element: <HelpHomePage /> },
      { path: "article/:slug", element: <HelpArticlePage /> },
      { path: "getting-started", element: <HelpCategoryPage /> },
      { path: "guides", element: <HelpCategoryPage /> },
      { path: "faqs", element: <HelpCategoryPage /> },
      { path: "troubleshooting", element: <HelpCategoryPage /> },
      { path: "release-notes", element: <HelpCategoryPage /> },
      { path: "contact", element: <HelpCategoryPage /> },
    ],
  },
]
