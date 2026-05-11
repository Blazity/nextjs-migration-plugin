import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storybookDirName = ".storybook";
const mainFileName = "main.ts";
const previewFileName = "preview.ts";
const storybookScript = "storybook dev";
const buildStorybookScript = "storybook build";
const oldStorybookScript = "storybook dev -p 6006";
const storybookVersion = "^10.3.0";
const viteVersion = "^8.0.0";
const storybookDevDependencies = {
  storybook: storybookVersion,
  "@storybook/nextjs-vite": storybookVersion,
  vite: viteVersion,
} as const;

const mainTs = `import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
};

export default config;
`;

const previewTs = `import type { Preview } from "@storybook/nextjs-vite";

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

const oldGeneratedMainTs = `import type { StorybookConfig } from "@storybook/nextjs";

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

const oldGeneratedPreviewTs = `import type { Preview } from "@storybook/react";

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

export interface StorybookScaffoldResult {
  filesChanged: boolean;
  packageJsonChanged: boolean;
}

export function ensureStorybookScaffold(targetDir: string): StorybookScaffoldResult {
  const storybookDir = join(targetDir, storybookDirName);
  mkdirSync(storybookDir, { recursive: true });

  const filesChanged = [
    writeIfMissingOrOldGenerated(join(storybookDir, mainFileName), mainTs, oldGeneratedMainTs),
    writeIfMissingOrOldGenerated(join(storybookDir, previewFileName), previewTs, oldGeneratedPreviewTs),
  ].some(Boolean);
  const packageJsonChanged = ensurePackageScripts(join(targetDir, "package.json"));

  return { filesChanged, packageJsonChanged };
}

function writeIfMissingOrOldGenerated(path: string, contents: string, oldContents: string): boolean {
  if (!existsSync(path)) {
    writeFileSync(path, contents);
    return true;
  }

  if (readFileSync(path, "utf8") === oldContents) {
    writeFileSync(path, contents);
    return true;
  }

  return false;
}

function ensurePackageScripts(packageJsonPath: string): boolean {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  const devDependencies = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {};
  let changed = false;

  if (!("storybook" in scripts) || scripts.storybook === oldStorybookScript) {
    scripts.storybook = storybookScript;
    changed = true;
  }

  if (!("build-storybook" in scripts)) {
    scripts["build-storybook"] = buildStorybookScript;
    changed = true;
  }

  for (const [name, version] of Object.entries(storybookDevDependencies)) {
    if (devDependencies[name] !== version) {
      devDependencies[name] = version;
      changed = true;
    }
  }

  for (const name of ["@storybook/addon-essentials", "@storybook/nextjs"]) {
    if (name in devDependencies) {
      delete devDependencies[name];
      changed = true;
    }
  }

  if (!changed) return false;

  packageJson.scripts = scripts;
  packageJson.devDependencies = devDependencies;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
