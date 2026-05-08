import { describe, expect, it } from "vitest";
import {
  componentStorybookReviewUrl,
  componentStorybookUrl,
} from "../lib/storybook-url.ts";

describe("storybook URL helpers", () => {
  it("builds iframe URLs for screenshot capture", () => {
    expect(componentStorybookUrl(
      "http://127.0.0.1:6006",
      "Hero",
      "HeroVariant2",
    )).toBe(
      "http://127.0.0.1:6006/iframe.html?id=migrated-components-hero--hero-variant2&viewMode=story",
    );
  });

  it("builds manager URLs for human review links", () => {
    expect(componentStorybookReviewUrl(
      "http://127.0.0.1:6006/",
      "PricingCard",
    )).toBe(
      "http://127.0.0.1:6006/?path=/story/migrated-components-pricing-card--pricing-card",
    );
  });
});
