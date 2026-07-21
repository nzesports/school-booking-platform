import type { ReactNode } from "react";

import { ConfigGate } from "@/components/dashboard/config-gate";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <ConfigGate portal="staff" showIntegrationWarnings>
      {children}
    </ConfigGate>
  );
}
