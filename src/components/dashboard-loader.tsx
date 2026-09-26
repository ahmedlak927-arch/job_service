"use client";

import dynamic from "next/dynamic";

export const DashboardLoader = dynamic(
  () => import("./dashboard").then((mod) => mod.Dashboard),
  {
    ssr: false,
    loading: () => (
      <div className="page-shell">
        <p className="lede">Opening WorkSignal…</p>
      </div>
    ),
  },
);
