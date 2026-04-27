import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const ClaimSubmitPage = lazy(() => import("./pages/ClaimSubmitPage"));
const MyClaimsPage = lazy(() => import("./pages/MyClaimsPage"));
const FinanceQueuePage = lazy(() => import("./pages/FinanceQueuePage"));

export const claimsRoutes: RouteObject[] = [
	{ path: "claims/submit", element: <ClaimSubmitPage /> },
	{ path: "claims/me", element: <MyClaimsPage /> },
	{ path: "claims/finance", element: <FinanceQueuePage /> },
];
