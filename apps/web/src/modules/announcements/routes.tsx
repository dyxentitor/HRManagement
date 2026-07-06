import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const AnnouncementsFeedPage = lazy(() => import("./AnnouncementsFeedPage"))
const AnnouncementsManagePage = lazy(() => import("./AnnouncementsManagePage"))
const AnnouncementForm = lazy(() => import("./AnnouncementForm"))
const AnnouncementDetailPage = lazy(() => import("./AnnouncementDetailPage"))

export const announcementsRoutes: RouteObject[] = [
  { path: "announcements", element: <AnnouncementsFeedPage /> },
  { path: "announcements/manage", element: <AnnouncementsManagePage /> },
  { path: "announcements/new", element: <AnnouncementForm /> },
  { path: "announcements/:id/edit", element: <AnnouncementForm /> },
  // Detail is registered last so `manage`/`new` win over `:id`.
  { path: "announcements/:id", element: <AnnouncementDetailPage /> },
]
