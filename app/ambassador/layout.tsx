import type { ReactNode } from "react";

import { ConfigGate } from "@/components/dashboard/config-gate";

export default function AmbassadorLayout({ children }: { children: ReactNode }) {
  return <ConfigGate portal="ambassador">{children}</ConfigGate>;
}
