import { AsyncLocalStorage } from "node:async_hooks";
import type { EmailEventInput } from "./email";

// Server-only, scoped to a single call; never accept delivery policy from a form.
export const emailDeliveryContext = new AsyncLocalStorage<{
  preview?: EmailEventInput[];
  manualBookingId?: string;
  statusChangeBookingId?: string;
}>();
