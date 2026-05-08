export function componentStorybookUrl(
  baseUrl: string,
  componentName: string,
  storyName = componentName,
): string {
  return `${normalizeBaseUrl(baseUrl)}/iframe.html?id=${storyId(componentName, storyName)}&viewMode=story`;
}

export function componentStorybookReviewUrl(
  baseUrl: string,
  componentName: string,
  storyName = componentName,
): string {
  return `${normalizeBaseUrl(baseUrl)}/?path=/story/${storyId(componentName, storyName)}`;
}

function storyId(componentName: string, storyName: string): string {
  return `migrated-components-${kebab(componentName)}--${kebab(storyName)}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function kebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
