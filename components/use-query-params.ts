"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Read and update URL search params (filters live in the URL so pages stay server-rendered). */
export function useQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );
  return { params, update };
}

/** A search box that updates `?q=` after a short pause. */
export function useDebouncedQuery(
  update: (c: Record<string, string | null>) => void,
  current: string,
) {
  const [q, setQ] = React.useState(current);
  const updateRef = React.useRef(update);
  updateRef.current = update;
  React.useEffect(() => {
    if (q.trim() === current) return;
    const t = setTimeout(() => updateRef.current({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [q, current]);
  return [q, setQ] as const;
}
