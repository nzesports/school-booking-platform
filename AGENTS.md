# Repository Agent Instructions

## Verification scope

- By default, verify changes with `npm run typecheck` and `npm run lint` only.
- Keep verification isolated to the files and behavior changed in the current task.
- Do not automatically run production builds, full test suites, smoke tests, end-to-end tests, browser or visual checks, dev-server verification, or Supabase resets/seeding.
- The user will manually test application behavior. Only perform deeper or broader testing when the user explicitly asks for it.
- If a task cannot be responsibly verified with lint and typecheck alone, explain the narrow additional check that would be needed and wait for the user's approval before running it.

## Design vocabulary

- “Secondary tab style” means the shared `components/ui/secondary-tabs.tsx` pattern: an icon, a compact text label, and a short underline indicating the active tab. Reuse that component instead of recreating the style locally.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
