import { SiteFrontmatterSchema } from "../schemas/site.ts";
import { bootstrapMigration } from "./bootstrap.ts";

export interface NewMigrationArgs {
  sourceUrl: string;
  targetDir: string;
  inputMode: "url-only" | "url-plus-repo";
  sourceRepo?: string;
  initialPageSelection?: string[];
}

export async function runNewMigration(args: NewMigrationArgs): Promise<void> {
  // `target` is always "./" — the .migration/ directory IS the migration root, so
  // `target` is the path to code output relative to `.migration/`'s parent.
  // Multi-target layouts (e.g., apps/web, packages/ui) are a v2 concern.
  const site = SiteFrontmatterSchema.parse({
    sourceUrl: args.sourceUrl,
    target: "./",
    inputMode: args.inputMode,
    sourceRepo: args.sourceRepo,
    initialPageSelection: args.initialPageSelection,
  });

  await bootstrapMigration({ targetDir: args.targetDir, site });
}

// CLI shim: allow invocation via `tsx lib/new-migration.ts --url ... --target ...`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseNewMigrationArgs(process.argv.slice(2));
  runNewMigration(args).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

export function parseNewMigrationArgs(argv: string[]): NewMigrationArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceUrl = get("--url");
  if (!sourceUrl) throw new Error("--url is required");

  return {
    sourceUrl,
    targetDir: get("--target") ?? process.cwd(),
    inputMode: (get("--input-mode") ?? "url-only") as NewMigrationArgs["inputMode"],
    sourceRepo: get("--source-repo"),
    initialPageSelection: parseInitialPageSelection(get("--initial-page-selection")),
  };
}

function parseInitialPageSelection(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const entries = raw.split(",").map(s => s.trim()).filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}
