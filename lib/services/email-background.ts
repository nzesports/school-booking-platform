import { after } from "next/server";

// Register the entire operation (including template loading and email_logs)
// before redirecting. A detached promise can be stopped when Vercel returns
// the response. This keeps the operation alive within the function time limit.
export function scheduleEmail(send: () => Promise<unknown>) {
  after(async () => {
    try {
      await send();
    } catch {
      // Do not log email bodies, recipients, tokens, or provider credentials.
      console.error("[email] Background notification failed unexpectedly.");
    }
  });
}
