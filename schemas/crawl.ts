import { z } from "zod";

export const CrawledPageSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  title: z.string(),
  depth: z.number().int().nonnegative(),
  discoveredVia: z.enum(["seed", "sitemap", "link"]),
  status: z.number().int(),
  outboundLinks: z.array(z.string().url()).default([]),
});

export const CrawlErrorSchema = z.object({
  url: z.string(),
  reason: z.string(),
});

export const CrawlSchema = z.object({
  sourceUrl: z.string().url(),
  requestedSourceUrl: z.string().url().optional(),
  crawledAt: z.string().datetime(),
  limits: z.object({
    maxPages: z.number().int().positive(),
    maxDepth: z.number().int().nonnegative(),
  }),
  robotsTxt: z.object({
    fetched: z.boolean(),
    disallowedPaths: z.array(z.string()).default([]),
  }).optional(),
  sitemapUrls: z.array(z.string().url()).default([]),
  pages: z.array(CrawledPageSchema).min(1),
  errors: z.array(CrawlErrorSchema).default([]),
});

export type Crawl = z.infer<typeof CrawlSchema>;
export type CrawledPage = z.infer<typeof CrawledPageSchema>;
