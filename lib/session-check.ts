export interface CheckArgs {
  installedPlugins: string[];
  required: string[];
}

export type CheckResult =
  | { ok: true }
  | { ok: false; missing: string[]; message: string };

export function checkPluginDependencies(args: CheckArgs): CheckResult {
  const missing = args.required.filter(r => !args.installedPlugins.includes(r));
  if (missing.length === 0) return { ok: true };
  const list = missing.map(m => `'${m}'`).join(", ");
  return {
    ok: false,
    missing,
    message: `nextjs-migration-plugin requires the following plugins to be installed: ${list}. Run: claude plugin install ${missing.join(" ")}`,
  };
}
