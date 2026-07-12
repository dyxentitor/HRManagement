import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const FeedbackCenterPage = lazy(() => import("./pages/FeedbackCenterPage"));
const FeedbackAdminPage = lazy(() => import("./pages/FeedbackAdminPage"));

export const feedbackRoutes: RouteObject[] = [
	{ path: "feedback", element: <FeedbackCenterPage /> },
	{ path: "feedback/manage", element: <FeedbackAdminPage /> },
];
