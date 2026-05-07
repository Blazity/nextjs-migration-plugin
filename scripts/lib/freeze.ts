import type { Page } from "@playwright/test"
import type { AdapterLocalSite } from "./adapter-loader.ts"
import { dismissCookieBanner } from "./cookie-consent.ts"

interface FreezeOptions {
  localSite?: AdapterLocalSite
  // When true, skip steps that mutate the DOM in ways that break section
  // discovery (iframe overlays, dev-tools hiding). Used by extraction scripts
  // (extract-images, extract-styles) — they need tab activation and lazy-image
  // scroll, but appending overlay <div>s pollutes body-level section selectors.
  extractionSafe?: boolean
}

export async function freezeDynamicContent(page: Page, opts?: FreezeOptions) {
  // Scroll full page to trigger lazy images + animations
  const height = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
    await page.waitForTimeout(200)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)

  // Freeze all CSS animations and transitions
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-play-state: paused !important;
        animation-delay: -1ms !important;
        animation-duration: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `
  })

  // Click first tab on any tab component
  const firstTabs = await page.$$('[role="tab"]:first-child, .w-tab-link:first-child')
  for (const tab of firstTabs) {
    await tab.click().catch(() => {})
  }
  await page.waitForTimeout(500)

  // Mask YouTube iframes with solid overlay (skipped in extraction mode —
  // appending overlay divs to <body> pollutes top-level section discovery).
  if (!opts?.extractionSafe) {
    await page.evaluate(() => {
      document.querySelectorAll("iframe").forEach(iframe => {
        const rect = iframe.getBoundingClientRect()
        const overlay = document.createElement("div")
        overlay.style.cssText = `position:absolute;top:${rect.top + window.scrollY}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;background:#121418;z-index:99999;`
        document.body.appendChild(overlay)
      })
    })
  }

  // Wait for typing effects to complete
  const h1 = await page.$("h1")
  if (h1) {
    let lastText = ""
    for (let i = 0; i < 25; i++) {
      const text = await h1.evaluate(el => el.textContent || "")
      if (text === lastText && text.length > 10) break
      lastText = text
      await page.waitForTimeout(200)
    }
  }

  // Hide dev tools overlay (skipped in extraction mode — only relevant when
  // verifying the local Next.js site, not when extracting from the reference).
  if (!opts?.extractionSafe) {
    const hideScript = opts?.localSite?.devToolsHideScript
    if (hideScript) {
      await page.evaluate(hideScript).catch(() => {})
    } else {
      // Default: hide Next.js Dev Tools
      await page.evaluate(() => {
        const devToolsBtn = document.querySelector('button[data-nextjs-dev-tools-button]') ||
          Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Next.js Dev Tools'));
        if (devToolsBtn) (devToolsBtn as HTMLElement).style.display = 'none';
        document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }).catch(() => {})
    }
  }

  // Some CMPs appear lazily after scroll or layout stabilization.
  await dismissCookieBanner(page)
  await page.waitForTimeout(500)
}

export async function dismissCookies(page: Page, _opts?: FreezeOptions) {
  await dismissCookieBanner(page)

  // Dismiss local site cookie banner via cookie
  await page.evaluate(() => {
    document.cookie = "cookie-consent=" + JSON.stringify({necessary:true,analytics:true,marketing:true}) + ";path=/;max-age=31536000"
  }).catch(() => {})
  await page.waitForTimeout(500)
}
