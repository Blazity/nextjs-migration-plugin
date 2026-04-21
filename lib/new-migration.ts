import { SiteFrontmatterSchema } from "../schemas/site.ts";
import { bootstrapMigration } from "./bootstrap.ts";

export interface NewMigrationArgs {
  sourceUrl: string;
  targetDir: string;
  mode: "attended" | "unattended";
  goal: "wireframe" | "pixel-perfect";
  inputMode: "url-only" | "url-plus-repo";
  sourceRepo?: string;
}

export async function runNewMigration(args: NewMigrationArgs): Promise<void> {
  // `target` is always "./" — the .migration/ directory IS the migration root, so
  // `target` is the path to code output relative to `.migration/`'s parent.
  // Multi-target layouts (e.g., apps/web, packages/ui) are a v2 concern.
  const site = SiteFrontmatterSchema.parse({
    sourceUrl: args.sourceUrl,
    target: "./",
    mode: args.mode,
    goal: args.goal,
    inputMode: args.inputMode,
    sourceRepo: args.sourceRepo,
  });

  await bootstrapMigration({ targetDir: args.targetDir, site });
}

// CLI shim: allow invocation via `tsx lib/new-migration.ts --url ... --target ...`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  runNewMigration(args).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

function parseArgs(argv: string[]): NewMigrationArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceUrl = get("--url");
  if (!sourceUrl) throw new Error("--url is required");

  // Cast to literals is safe because `runNewMigration` passes these straight
  // into `SiteFrontmatterSchema.parse`, which validates the enum values and
  // throws a structured ZodError on mismatch.
  return {
    sourceUrl,
    targetDir: get("--target") ?? process.cwd(),
    mode: (get("--mode") ?? "attended") as NewMigrationArgs["mode"],
    goal: (get("--goal") ?? "pixel-perfect") as NewMigrationArgs["goal"],
    inputMode: (get("--input-mode") ?? "url-only") as NewMigrationArgs["inputMode"],
    sourceRepo: get("--source-repo"),
  };
}
