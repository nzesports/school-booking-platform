import type { ReactNode } from "react";

import { ConfigGate } from "@/components/dashboard/config-gate";

export default function SchoolLayout({ children }: { children: ReactNode }) {
  return <ConfigGate portal="school">{children}</ConfigGate>;
}
