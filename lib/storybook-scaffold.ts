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
const legacyStorybookDependencyNames = [
  "@storybook/addon-essentials",
  "@storybook/nextjs",
] as const;

const mainTs = `import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  staticDirs: [
    { from: "../.migration/references", to: "/migration-references" },
  ],
  addons: [],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
};

export default config;
`;

const previewTs = `import React from "react";
import type { Preview } from "@storybook/nextjs-vite";

interface ReferenceParameters {
  sectionInstanceId?: string;
}

const referenceViewportByName: Record<string, 390 | 768 | 1440> = {
  mobile: 390,
  tablet: 768,
  desktop: 1440,
};

const ReferenceOverlayDecorator: NonNullable<Preview["decorators"]>[number] = (Story, context) => {
  const reference = context.parameters.reference as ReferenceParameters | undefined;
  const opacity = Number(context.globals.refOpacity ?? 0);
  if (!reference?.sectionInstanceId || opacity <= 0) {
    return React.createElement(Story);
  }

  const viewportName = String(context.globals.viewport ?? "desktop");
  const viewport = referenceViewportByName[viewportName] ?? 1440;

  return React.createElement(
    "div",
    {
      style: {
        position: "relative",
        isolation: "isolate",
      },
    },
    React.createElement(Story),
    React.createElement("img", {
      "aria-hidden": true,
      alt: "",
      "data-reference-overlay": reference.sectionInstanceId,
      src: \`/migration-references/components/\${reference.sectionInstanceId}-\${viewport}.png\`,
      style: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "auto",
        opacity,
        pointerEvents: "none",
        zIndex: 2147483647,
        mixBlendMode: "difference",
      },
    }),
  );
};

const preview: Preview = {
  globalTypes: {
    refOpacity: {
      name: "Reference overlay",
      description: "Opacity for the source reference screenshot overlay.",
      defaultValue: 0,
      toolbar: {
        icon: "photo",
        items: [
          { value: 0, title: "Off" },
          { value: 0.35, title: "35%" },
          { value: 0.65, title: "65%" },
          { value: 1, title: "100%" },
        ],
      },
    },
  },
  decorators: [ReferenceOverlayDecorator],
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

interface StorybookFileSyncResult {
  changed: boolean;
  pluginOwned: boolean;
}

type StorybookDependencyMode = "upgrade-to-vite" | "preserve-custom-legacy";

export function ensureStorybookScaffold(
  targetDir: string,
): StorybookScaffoldResult {
  const storybookDir = join(targetDir, storybookDirName);
  mkdirSync(storybookDir, { recursive: true });

  const mainResult = syncStorybookFile(
    join(storybookDir, mainFileName),
    mainTs,
    oldGeneratedMainTs,
  );
  const previewResult = syncStorybookFile(
    join(storybookDir, previewFileName),
    previewTs,
    oldGeneratedPreviewTs,
  );
  const pluginOwnedScaffold =
    mainResult.pluginOwned && previewResult.pluginOwned;
  const filesChanged = mainResult.changed || previewResult.changed;
  const packageJsonChanged = ensurePackageScripts(
    join(targetDir, "package.json"),
    {
      dependencyMode:
        !pluginOwnedScaffold &&
        storybookFilesReferenceLegacyDependencies(storybookDir)
          ? "preserve-custom-legacy"
          : "upgrade-to-vite",
      removeLegacyDependencies: pluginOwnedScaffold,
    },
  );

  return { filesChanged, packageJsonChanged };
}

function syncStorybookFile(
  path: string,
  contents: string,
  oldContents: string,
): StorybookFileSyncResult {
  if (!existsSync(path)) {
    writeFileSync(path, contents);
    return { changed: true, pluginOwned: true };
  }

  const existingContents = readFileSync(path, "utf8");
  if (existingContents === oldContents) {
    writeFileSync(path, contents);
    return { changed: true, pluginOwned: true };
  }

  return {
    changed: false,
    pluginOwned: existingContents === contents,
  };
}

function ensurePackageScripts(
  packageJsonPath: string,
  options: {
    dependencyMode: StorybookDependencyMode;
    removeLegacyDependencies: boolean;
  },
): boolean {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  const devDependencies = isRecord(packageJson.devDependencies)
    ? packageJson.devDependencies
    : {};
  let changed = false;

  if (!("storybook" in scripts) || scripts.storybook === oldStorybookScript) {
    scripts.storybook = storybookScript;
    changed = true;
  }

  if (!("build-storybook" in scripts)) {
    scripts["build-storybook"] = buildStorybookScript;
    changed = true;
  }

  if (options.dependencyMode === "upgrade-to-vite") {
    for (const [name, version] of Object.entries(storybookDevDependencies)) {
      if (devDependencies[name] !== version) {
        devDependencies[name] = version;
        changed = true;
      }
    }
  }

  if (options.removeLegacyDependencies) {
    for (const name of legacyStorybookDependencyNames) {
      if (name in devDependencies) {
        delete devDependencies[name];
        changed = true;
      }
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

function storybookFilesReferenceLegacyDependencies(
  storybookDir: string,
): boolean {
  return [mainFileName, previewFileName].some((fileName) =>
    storybookFileReferencesLegacyDependencies(join(storybookDir, fileName)),
  );
}

function storybookFileReferencesLegacyDependencies(path: string): boolean {
  if (!existsSync(path)) return false;
  const contents = readFileSync(path, "utf8");
  return legacyStorybookDependencyNames.some((name) => contents.includes(name));
}
