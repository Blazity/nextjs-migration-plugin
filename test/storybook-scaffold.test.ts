import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStorybookScaffold } from "../lib/storybook-scaffold.ts";

const createTarget = (packageJson: unknown = { name: "target-app", scripts: { dev: "next dev" } }) => {
  const dir = mkdtempSync(join(tmpdir(), "storybook-scaffold-"));
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  return dir;
};

const readText = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");
const readPackageJson = (dir: string) => JSON.parse(readText(dir, "package.json"));

describe("ensureStorybookScaffold", () => {
  it("creates Storybook 8 React-Vite files and adds missing scripts idempotently", () => {
    const dir = createTarget();

    ensureStorybookScaffold(dir);

    expect(existsSync(join(dir, ".storybook/main.ts"))).toBe(true);
    expect(existsSync(join(dir, ".storybook/preview.ts"))).toBe(true);
    expect(readText(dir, ".storybook/main.ts")).toContain('@storybook/react-vite');
    expect(readText(dir, ".storybook/preview.ts")).toContain("390");
    expect(readText(dir, ".storybook/preview.ts")).toContain("768");
    expect(readText(dir, ".storybook/preview.ts")).toContain("1440");
    expect(readPackageJson(dir)).toMatchObject({
      name: "target-app",
      scripts: {
        dev: "next dev",
        storybook: "storybook dev -p 6006",
        "build-storybook": "storybook build",
      },
      devDependencies: {
        storybook: "^8.0.0",
        "@storybook/addon-essentials": "^8.0.0",
        "@storybook/react-vite": "^8.0.0",
      },
    });

    const firstMain = readText(dir, ".storybook/main.ts");
    const firstPreview = readText(dir, ".storybook/preview.ts");
    const firstPackageJson = readText(dir, "package.json");

    ensureStorybookScaffold(dir);

    expect(readText(dir, ".storybook/main.ts")).toBe(firstMain);
    expect(readText(dir, ".storybook/preview.ts")).toBe(firstPreview);
    expect(readText(dir, "package.json")).toBe(firstPackageJson);
  });

  it("preserves existing Storybook files and script values", () => {
    const dir = createTarget({
      name: "target-app",
      private: true,
      scripts: {
        storybook: "storybook dev --port 7007",
      },
      devDependencies: {
        storybook: "^8.2.0",
      },
      dependencies: {
        next: "15.0.0",
      },
    });
    mkdirSync(join(dir, ".storybook"), { recursive: true });
    writeFileSync(join(dir, ".storybook/main.ts"), "export default { custom: true };\n");
    writeFileSync(join(dir, ".storybook/preview.ts"), "export default {};\n");

    ensureStorybookScaffold(dir);

    expect(readText(dir, ".storybook/main.ts")).toBe("export default { custom: true };\n");
    expect(readText(dir, ".storybook/preview.ts")).toBe("export default {};\n");
    expect(readPackageJson(dir)).toEqual({
      name: "target-app",
      private: true,
      scripts: {
        storybook: "storybook dev --port 7007",
        "build-storybook": "storybook build",
      },
      devDependencies: {
        storybook: "^8.2.0",
        "@storybook/addon-essentials": "^8.0.0",
        "@storybook/react-vite": "^8.0.0",
      },
      dependencies: {
        next: "15.0.0",
      },
    });
  });
});
