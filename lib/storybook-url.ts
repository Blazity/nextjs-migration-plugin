export function componentStorybookUrl(
  baseUrl: string,
  componentName: string,
  storyName = componentName,
): string {
  return `${baseUrl.replace(/\/$/, "")}/?path=/story/migrated-components-${kebab(componentName)}--${kebab(storyName)}`;
}

function kebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
