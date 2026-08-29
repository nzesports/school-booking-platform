import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");

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

function syncLocalEnv() {
  const status = parseEnv(runSupabase(["status", "--output", "env"], { capture: true }));
  const apiUrl = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;

  if (!apiUrl || !publishableKey || !serviceRoleKey) {
    console.error("Could not read the local API keys from `supabase status`.");
    process.exit(1);
  }

  const envPath = join(root, ".env.local");
  const examplePath = join(root, ".env.example");
  let contents = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : readFileSync(examplePath, "utf8");

  contents = setEnvValue(contents, "NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  contents = setEnvValue(contents, "NEXT_PUBLIC_SUPABASE_URL", apiUrl);
  contents = setEnvValue(
    contents,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    publishableKey
  );
  contents = setEnvValue(contents, "SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  writeFileSync(envPath, contents, "utf8");

  console.log("Updated .env.local with the local Supabase URL and keys.");
}

function seed() {
  syncLocalEnv();
  run(process.execPath, ["scripts/seed-local-users.mjs"]);
  run(process.execPath, ["scripts/seed-demo-data.mjs"]);
}

const action = process.argv[2] ?? "start";

switch (action) {
  case "start":
    runSupabase(["start"]);
    seed();
    console.log("\nLocal platform data is ready. Run `npm run dev`.");
    break;
  case "reset":
    runSupabase(["db", "reset"]);
    seed();
    console.log("\nLocal database reset and demo data are complete.");
    break;
  case "seed":
    seed();
    break;
  default:
    console.error(`Unknown action: ${action}`);
    console.error("Use start, reset, or seed.");
    process.exit(1);
}
