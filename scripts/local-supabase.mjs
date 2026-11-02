import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");
const dockerDesktopBin = "/Applications/Docker.app/Contents/Resources/bin";

// Docker Desktop can be installed successfully on macOS before its CLI
// symlink has been added to the shell PATH. Supabase invokes `docker`
// internally, so make the bundled CLI discoverable for this local command.
if (
  process.platform === "darwin" &&
  existsSync(join(dockerDesktopBin, "docker")) &&
  !(process.env.PATH ?? "")
    .split(delimiter)
    .some((entry) => entry && existsSync(join(entry, "docker")))
) {
  process.env.PATH = [dockerDesktopBin, process.env.PATH].filter(Boolean).join(delimiter);
}

if (!existsSync(cli)) {
  console.error("Supabase CLI is missing. Run `npm install` first.");
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: false
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

function runSupabase(args, options) {
  return run(process.execPath, [cli, ...args], options);
}

function parseEnv(output) {
  const values = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }

  return values;
}

function setEnvValue(contents, name, value) {
  const line = `${name}=${value}`;
  const matcher = new RegExp(`^${name}=.*$`, "m");

  if (matcher.test(contents)) return contents.replace(matcher, line);
  return `${contents.trimEnd()}\n${line}\n`;
}

const localEnvPath = join(root, ".env.development.local");
const LIVE_ONLY_ENV_NAMES = [
  "BREVO_API_KEY",
  "MICROSOFT_GRAPH_TENANT_ID",
  "MICROSOFT_GRAPH_CLIENT_ID",
  "MICROSOFT_GRAPH_CLIENT_SECRET",
  "MICROSOFT_GRAPH_CALENDAR_ID",
  "MICROSOFT_GRAPH_USER_ID"
];

function syncLocalEnv() {
  const status = parseEnv(runSupabase(["status", "--output", "env"], { capture: true }));
  const apiUrl = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;

  if (!apiUrl || !publishableKey || !serviceRoleKey) {
    console.error("Could not read the local API keys from `supabase status`.");
    process.exit(1);
  }

  // Local settings live in .env.development.local, which `next dev` reads
  // before .env.local. .env.local (the hosted/live project) is never touched,
  // and the live email and Microsoft keys are blanked here so the local site
  // can't send real emails or create real Teams meetings/calendar events.
  let contents = existsSync(localEnvPath) ? readFileSync(localEnvPath, "utf8") : "";

  contents = setEnvValue(contents, "NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  contents = setEnvValue(contents, "NEXT_PUBLIC_SUPABASE_URL", apiUrl);
  contents = setEnvValue(
    contents,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    publishableKey
  );
  contents = setEnvValue(contents, "SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);

  for (const name of LIVE_ONLY_ENV_NAMES) {
    contents = setEnvValue(contents, name, "");
  }

  // With TEST_EMAIL_REDIRECT_TO set in this file, emails are sent for real
  // through Brevo, but the app delivers every one to that single inbox. The
  // Brevo key is copied from .env.local only in that case.
  const redirectTo = parseEnv(contents).TEST_EMAIL_REDIRECT_TO ?? "";
  const liveEnvPath = join(root, ".env.local");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(redirectTo) && existsSync(liveEnvPath)) {
    const brevoKey = parseEnv(readFileSync(liveEnvPath, "utf8")).BREVO_API_KEY ?? "";
    contents = setEnvValue(contents, "BREVO_API_KEY", brevoKey);
    console.log(
      brevoKey
        ? `Test emails will be sent for real, all to ${redirectTo}.`
        : "TEST_EMAIL_REDIRECT_TO is set but .env.local has no BREVO_API_KEY; emails go to the local inbox."
    );
  }

  // Lets the hourly session sweep (/api/cron/complete-sessions) be run by hand.
  if (!parseEnv(contents).CRON_SECRET) {
    contents = setEnvValue(contents, "CRON_SECRET", randomBytes(24).toString("base64url"));
  }

  // Emails go to the stack's Mailpit inbox (the INBUCKET_URL / Mailpit URL)
  // so email flows can be tested without sending anything for real.
  const inboxUrl = status.INBUCKET_URL ?? status.MAILPIT_URL;
  if (inboxUrl) {
    contents = setEnvValue(contents, "LOCAL_MAIL_API_URL", inboxUrl);
  }

  writeFileSync(localEnvPath, contents, "utf8");
  console.log("Updated .env.development.local with the local Supabase URL and keys.");
}

function seed() {
  syncLocalEnv();
  // The seed scripts read their Supabase keys from this file; refuse to seed
  // anything that isn't this machine's Docker database.
  const seedUrl = parseEnv(readFileSync(localEnvPath, "utf8")).NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(seedUrl)) {
    console.error("Refusing to seed: the Supabase URL is not a local address.");
    process.exit(1);
  }
  process.env.SEED_ENV_FILE = ".env.development.local";
  run(process.execPath, ["scripts/seed-local-users.mjs"]);
  run(process.execPath, ["scripts/seed-demo-data.mjs"]);
  run(process.execPath, ["scripts/seed-ambassador-showcase.mjs"]);
  run(process.execPath, ["scripts/seed-double-sessions.mjs"]);
}

function applyPendingMigrations() {
  console.log("Applying pending local database migrations…");
  runSupabase(["migration", "up", "--local"]);
}

const action = process.argv[2] ?? "start";

switch (action) {
  case "start":
    runSupabase(["start"]);
    applyPendingMigrations();
    seed();
    console.log("\nLocal platform data is ready.");
    break;
  case "reset":
    runSupabase(["db", "reset"]);
    seed();
    console.log("\nLocal database reset and demo data are complete.");
    break;
  case "seed":
    applyPendingMigrations();
    seed();
    break;
  case "status":
    runSupabase(["status"]);
    break;
  case "stop":
    runSupabase(["stop"]);
    break;
  default:
    console.error(`Unknown action: ${action}`);
    console.error("Use start, reset, seed, status, or stop.");
    process.exit(1);
}
