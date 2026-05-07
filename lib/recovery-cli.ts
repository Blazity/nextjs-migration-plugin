export function requireRecoveryTargetArg(argv: string[] = process.argv): string {
  const targetIndex = argv.indexOf("--target");
  const targetDir = targetIndex >= 0 ? argv[targetIndex + 1] : undefined;
  if (!targetDir) {
    console.error("Recovery entry point requires --target <dir>.");
    process.exit(2);
  }
  return targetDir;
}
