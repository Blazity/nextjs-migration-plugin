import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storybookDirName = ".storybook";
const mainFileName = "main.ts";
const previewFileName = "preview.ts";
const storybookScript = "storybook dev -p 6006";
const buildStorybookScript = "storybook build";
const storybookVersion = "^8.0.0";
const storybookDevDependencies = {
  storybook: storybookVersion,
  "@storybook/addon-essentials": storybookVersion,
  "@storybook/nextjs": storybookVersion,
} as const;

const mainTs = `import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
};

export default config;
`;

const previewTs = `import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    viewport: {
      viewports: {
        mobile: {
          name: "Mobile",
          styles: {
            width: "390px",
            height: "844px",
          },
        },
        tablet: {
          name: "Tablet",
          styles: {
            width: "768px",
            height: "1024px",
          },
        },
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      },
    },
  },
};

export default preview;
`;

export function ensureStorybookScaffold(targetDir: string): void {
  const storybookDir = join(targetDir, storybookDirName);
  mkdirSync(storybookDir, { recursive: true });

  writeIfMissing(join(storybookDir, mainFileName), mainTs);
  writeIfMissing(join(storybookDir, previewFileName), previewTs);
  ensurePackageScripts(join(targetDir, "package.json"));
}

function writeIfMissing(path: string, contents: string): void {
  if (!existsSync(path)) writeFileSync(path, contents);
}

function ensurePackageScripts(packageJsonPath: string): void {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  const devDependencies = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {};
  let changed = false;

  if (!("storybook" in scripts)) {
    scripts.storybook = storybookScript;
    changed = true;
  }

  if (!("build-storybook" in scripts)) {
    scripts["build-storybook"] = buildStorybookScript;
    changed = true;
  }

  for (const [name, version] of Object.entries(storybookDevDependencies)) {
    if (!(name in devDependencies)) {
      devDependencies[name] = version;
      changed = true;
    }
  }

  if (!changed) return;

  packageJson.scripts = scripts;
  packageJson.devDependencies = devDependencies;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
