import { existsSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

/**
 * Where the host project's App Router lives. Detected once per migration
 * so DSF emits globals into the layout that actually renders, components
 * land next to their stories, and Storybook's preview imports the right
 * stylesheet. See docs/issues/008.
 */
export interface AppRouterRoot {
  /** Path of the App Router dir relative to `targetDir`, e.g. `src/app` or `app`. */
  appDir: string;
  /** Path of the components dir, e.g. `src/components` or `components`. */
  componentsDir: string;
  /** Path of the globals.css the layout imports, relative to `targetDir`. */
  globalsCssPath: string;
  /** Whether the project already has a layout.tsx at the detected location. */
  detected: boolean;
}

/**
 * Detection precedence:
 *
 * 1. `src/app/layout.tsx` exists → use `src/app` + `src/components`.
 * 2. `app/layout.tsx` exists → use `app` + `components`.
 * 3. Fall back to `src/app` + `src/components` (the plugin's historical
 *    default). The caller can still scaffold a project in that shape.
 *
 * When both exist, prefer `src/app` because that's the convention Next.js
 * picks. A future revision can fail loudly instead.
 */
export function detectAppRouterRoot(targetDir: string): AppRouterRoot {
  const srcAppLayout = existsSync(join(targetDir, "src/app/layout.tsx"));
  const rootAppLayout = existsSync(join(targetDir, "app/layout.tsx"));

  if (srcAppLayout) {
    return {
      appDir: "src/app",
      componentsDir: "src/components",
      globalsCssPath: "src/app/globals.css",
      detected: true,
    };
  }
  if (rootAppLayout) {
    return {
      appDir: "app",
      componentsDir: "components",
      globalsCssPath: "app/globals.css",
      detected: true,
    };
  }
  return {
    appDir: "src/app",
    componentsDir: "src/components",
    globalsCssPath: "src/app/globals.css",
    detected: false,
  };
}

/**
 * Path from `<targetDir>/.storybook/<preview.ts>` to `<targetDir>/<globalsCssPath>`,
 * normalized to POSIX slashes for the import literal.
 */
export function storybookGlobalsImportSpecifier(globalsCssPath: string): string {
  const fromStorybook = relative(".storybook", globalsCssPath);
  const posixPath = fromStorybook.split(sep).join(posix.sep);
  return posixPath.startsWith(".") ? posixPath : `./${posixPath}`;
}
