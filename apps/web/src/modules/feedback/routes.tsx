import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const FeedbackCenterPage = lazy(() => import("./pages/FeedbackCenterPage"));

export const feedbackRoutes: RouteObject[] = [
	{ path: "feedback", element: <FeedbackCenterPage /> },
	// /feedback/manage is added in Task 8 (admin page)
];
