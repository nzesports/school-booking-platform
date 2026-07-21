import type { ReactNode } from "react";

import { ConfigGate } from "@/components/dashboard/config-gate";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ConfigGate portal="admin" showIntegrationWarnings>
      {children}
    </ConfigGate>
  );
}
