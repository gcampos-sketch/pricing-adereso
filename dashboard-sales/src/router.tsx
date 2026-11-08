import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { HubLoading } from "./components/HubLoading";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingComponent: HubLoading,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
