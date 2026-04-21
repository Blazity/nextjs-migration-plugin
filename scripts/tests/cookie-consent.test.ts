import assert from "node:assert/strict"
import test from "node:test"

import { dismissCookieBanner } from "../lib/cookie-consent.ts"

class FakeLocator {
  constructor(private readonly isVisibleFn: () => boolean) {}

  first() {
    return this
  }

  async isVisible() {
    return this.isVisibleFn()
  }
}

class FakePage {
  bannerVisible = true
  clicks: string[] = []
  evaluations: string[] = []

  locator(selector: string) {
    return new FakeLocator(() => {
      if (selector === "#onetrust-consent-sdk" || selector === "#onetrust-banner-sdk") {
        return this.bannerVisible
      }
      return false
    })
  }

  async $(selector: string) {
    if (selector === "#onetrust-consent-sdk") {
      return this.bannerVisible ? {} : null
    }
    return null
  }

  async evaluate(scriptOrFn: string | (() => unknown), arg?: string) {
    if (typeof scriptOrFn === "function") {
      if (typeof arg === "string") return false
      return []
    }

    this.evaluations.push(scriptOrFn)
    return undefined
  }

  async waitForTimeout() {
    return undefined
  }

  async click(selector: string) {
    this.clicks.push(selector)
    if (selector === "#onetrust-accept-btn-handler") {
      this.bannerVisible = false
    }
  }
}

test("dismissCookieBanner falls through to selector click when provider JS API does not remove the banner", async () => {
  const page = new FakePage()

  const detected = await dismissCookieBanner(page as unknown as Parameters<typeof dismissCookieBanner>[0])

  assert.equal(detected, "onetrust")
  assert.deepEqual(page.evaluations, ["OneTrust.AllowAll()"])
  assert.deepEqual(page.clicks, ["#onetrust-accept-btn-handler"])
  assert.equal(page.bannerVisible, false)
})
