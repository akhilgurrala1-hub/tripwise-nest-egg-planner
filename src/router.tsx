import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Load a page's code as soon as the traveler points at or touches its link, so the
    // switch itself is instant (AppShell also warms every tab once the first page is idle).
    defaultPreload: "intent",
    defaultPreloadDelay: 20,
    defaultPreloadStaleTime: 0,
    defaultViewTransition: { types: ["route"] },
  });

  return router;
};
