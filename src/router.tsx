import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";

/**
 * A data router is required for `useBlocker` (the editor's unsaved-changes guard). The whole app stays one catch-all
 * route that renders the unchanged `<AppRoutes />` tree, so every existing route, guard and redirect behaves as before.
 * Tests mount `appRouteObjects` with `createMemoryRouter`.
 */
export const appRouteObjects: RouteObject[] = [{ path: "*", element: <AppRoutes /> }];

export const createAppRouter = () => createBrowserRouter(appRouteObjects);
