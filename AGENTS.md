# Repository Agent Instructions

## Verification scope

- By default, verify changes with `npm run typecheck` and `npm run lint` only.
- Keep verification isolated to the files and behavior changed in the current task.
- Do not automatically run production builds, full test suites, smoke tests, end-to-end tests, browser or visual checks, dev-server verification, or Supabase resets/seeding.
- The user will manually test application behavior. Only perform deeper or broader testing when the user explicitly asks for it.
- If a task cannot be responsibly verified with lint and typecheck alone, explain the narrow additional check that would be needed and wait for the user's approval before running it.
