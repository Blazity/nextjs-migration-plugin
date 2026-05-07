import { runMigrationStart, type OutcomeReadyForReview, type RunMigrationStartArgs } from "./migration-start.ts";

export interface NewMigrationArgs {
  sourceUrl: string;
  targetDir: string;
  inputMode: "url-only" | "url-plus-repo";
  sourceRepo?: string;
  initialPageSelection?: string[];
  migrationStartRunner?: (args: RunMigrationStartArgs) => Promise<OutcomeReadyForReview>;
}

export async function runNewMigration(args: NewMigrationArgs): Promise<OutcomeReadyForReview> {
  const migrationStartRunner = args.migrationStartRunner ?? runMigrationStart;
  return migrationStartRunner({
    sourceUrl: args.sourceUrl,
    targetDir: args.targetDir,
    inputMode: args.inputMode,
    sourceRepo: args.sourceRepo,
    initialPageSelection: args.initialPageSelection,
  });
}

// CLI shim: allow invocation via `tsx lib/new-migration.ts --url ... --target ...`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseNewMigrationArgs(process.argv.slice(2));
  runNewMigration(args)
    .then((outcome) => {
      console.log(JSON.stringify(outcome, null, 2));
    })
    .catch((err) => {
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
