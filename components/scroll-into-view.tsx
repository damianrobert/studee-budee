"use client";

import * as React from "react";

/** Scrolls its parent into view on mount (for list rows opened from global search). */
export function ScrollIntoView() {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    ref.current?.parentElement?.scrollIntoView({ block: "center" });
  }, []);
  return <span ref={ref} hidden />;
}
