import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyCertificationsPage = lazy(() => import("./pages/MyCertificationsPage"));
const MyTrainingPage = lazy(() => import("./pages/MyTrainingPage"));
const AdminCertPage = lazy(() => import("./pages/AdminCertPage"));

export const certificationRoutes: RouteObject[] = [
	{ path: "certifications/me", element: <MyCertificationsPage /> },
	{ path: "training/me", element: <MyTrainingPage /> },
	{ path: "certifications/admin", element: <AdminCertPage /> },
];
