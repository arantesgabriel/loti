"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { costRequest } from "@/components/packages/package-cost-client";

export function LogisticsQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 300_000, retry: false } },
  }));
  useEffect(() => {
    // TanStack revalidates on visibility changes; also support focus without a tab change.
    const onFocus = () => void client.refetchQueries({ type: "active", stale: true });
    const onDomainCommit = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "purchase.finalize") {
        void client.invalidateQueries({ predicate: query => query.queryKey[2] === "orders" });
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("loti:domain-committed", onDomainCommit);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("loti:domain-committed", onDomainCommit);
      void client.cancelQueries();
      client.clear();
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function useInvalidateLogistics(userId: string, workspaceId: string) {
  const client = useQueryClient();
  return (resources = ["orders", "order-items", "destinations", "packages"]) => {
    for (const resource of resources) void client.invalidateQueries({ queryKey: [userId, workspaceId, resource] });
  };
}

export function orderItemsParams(ids: string[]) {
  return new URLSearchParams({ itemIds: [...ids].sort().join(","), pageSize: "100", packageOptions: "exclude" }).toString();
}

export function packageDestinationsParams(accountId: string, search: string, page: number) {
  return new URLSearchParams({ packageOptions: "only", packagePage: String(page), packageSearch: search.trim(), packageAccountId: accountId }).toString();
}

export function logisticsQuery<T>(userId: string, workspaceId: string, resource: string, path: string, params: string, error: string) {
  return {
    queryKey: [userId, workspaceId, resource, params] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const result = await costRequest<T>(params ? `${path}?${params}` : path, undefined, workspaceId, signal);
      if (!result.ok || !result.data) throw new Error(result.error ?? error);
      return result.data;
    },
  };
}
