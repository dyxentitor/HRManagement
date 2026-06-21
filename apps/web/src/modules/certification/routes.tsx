import { lazy } from "react";
import { Navigate, type RouteObject } from "react-router-dom";

const GrowthPage = lazy(() => import("./pages/GrowthPage"));
const AdminCertPage = lazy(() => import("./pages/AdminCertPage"));

export const certificationRoutes: RouteObject[] = [
	{ path: "growth", element: <GrowthPage /> },
	// the two pages merged into the combined Growth workspace — keep old links working
	{ path: "certifications/me", element: <Navigate to="/growth" replace /> },
	{ path: "training/me", element: <Navigate to="/growth" replace /> },
	{ path: "certifications/admin", element: <AdminCertPage /> },
];
