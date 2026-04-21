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
  const targetDir = get("--target") ?? process.cwd();
  const mode = (get("--mode") ?? "attended") as "attended" | "unattended";
  const goal = (get("--goal") ?? "pixel-perfect") as "wireframe" | "pixel-perfect";
  const inputMode = (get("--input-mode") ?? "url-only") as "url-only" | "url-plus-repo";
  const sourceRepo = get("--source-repo");
  if (!sourceUrl) throw new Error("--url is required");
  return { sourceUrl, targetDir, mode, goal, inputMode, sourceRepo };
}
