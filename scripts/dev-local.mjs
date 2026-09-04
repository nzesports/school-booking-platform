import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localSupabaseScript = join(root, "scripts", "local-supabase.mjs");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const appOrigin = "http://localhost:3000";

const setup = spawnSync(process.execPath, [localSupabaseScript, "start"], {
  cwd: root,
  encoding: "utf8",
  stdio: "inherit",
  shell: false
});

if (setup.error) {
  throw setup.error;
}

if (setup.status !== 0) {
  console.error(
    "\nLocal setup stopped before the Next.js server could start, so there is no app link yet."
  );
  console.error("Resolve the error shown above, then run `npm run dev:local` again.\n");
  process.exit(setup.status ?? 1);
}

console.log("\nStarting the local web app on port 3000…\n");

const next = spawn(
  process.execPath,
  [nextCli, "dev", "--hostname", "localhost", "--port", "3000"],
  {
    cwd: root,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: false
  }
);

let accessDetailsPrinted = false;

function printAccessDetails(output) {
  if (accessDetailsPrinted || !/Ready in|ready - started server/i.test(output)) {
    return;
  }

  accessDetailsPrinted = true;
  console.log("\nLocal seeded platform is ready:\n");
  console.log(`  Home:       ${appOrigin}`);
  console.log(`  Sign in:    ${appOrigin}/?auth=login`);
  console.log(`  Admin:      ${appOrigin}/admin`);
  console.log(`  Staff:      ${appOrigin}/staff`);
  console.log(`  Ambassador: ${appOrigin}/ambassador`);
  console.log(`  School:     ${appOrigin}/school`);
  console.log("\nUse the seeded account details printed above or listed in README.md.");
  console.log("Press Ctrl+C when you want to stop the web server.\n");
}

next.stdout.on("data", (chunk) => {
  const output = chunk.toString();
  process.stdout.write(chunk);
  printAccessDetails(output);
});

next.stderr.on("data", (chunk) => {
  const output = chunk.toString();
  process.stderr.write(chunk);
  printAccessDetails(output);
});

next.on("error", (error) => {
  console.error("Could not start the local Next.js server:", error.message);
  process.exitCode = 1;
});

next.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 0;
    return;
  }

  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    next.kill(signal);
  });
}
