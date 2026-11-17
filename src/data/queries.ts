import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { data } from ".";

/** Pages refresh themselves while open; B2's self-refreshing SDK hook replaces this interval. */
const REFRESH_MS = 15_000;

export const itemKey = (kind: string, token: string) => ["item", kind, token] as const;

export function useCounter(token: string) {
  return useQuery({ queryKey: itemKey("counter", token), queryFn: () => data.getCounter(token), refetchInterval: REFRESH_MS });
}

export function useProject(token: string) {
  return useQuery({ queryKey: itemKey("project", token), queryFn: () => data.getProject(token), refetchInterval: REFRESH_MS });
}

export function useDashboard(token: string) {
  return useQuery({ queryKey: itemKey("dashboard", token), queryFn: () => data.getDashboard(token), refetchInterval: REFRESH_MS });
}

export function useSignInState() {
  return useQuery({ queryKey: ["sign-in"], queryFn: () => data.getSignInState() });
}

export function useMyItems() {
  return useQuery({ queryKey: ["my-items"], queryFn: () => data.listMyItems() });
}

/** A write to one item that refreshes it afterwards. */
export function useItemMutation<TInput>(kind: string, token: string, write: (input: TInput) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => client.invalidateQueries({ queryKey: itemKey(kind, token) }),
  });
}
