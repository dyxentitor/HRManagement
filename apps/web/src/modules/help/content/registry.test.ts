import { describe, expect, it } from "vitest"

import { ARTICLES, articlesByCategory, getArticle, searchArticles } from "./registry"

describe("help registry", () => {
  it("has at least one article per seeded category", () => {
    for (const cat of ["getting-started", "faqs", "release-notes", "contact"] as const) {
      expect(articlesByCategory(cat).length).toBeGreaterThan(0)
    }
  })

  it("search matches title, keyword, or summary (case-insensitive)", () => {
    const hits = searchArticles("leave")
    expect(hits.length).toBeGreaterThan(0)
    expect(searchArticles("ZZZ-no-match")).toHaveLength(0)
  })

  it("getArticle resolves by slug", () => {
    expect(getArticle(ARTICLES[0].slug)?.slug).toBe(ARTICLES[0].slug)
    expect(getArticle("does-not-exist")).toBeUndefined()
  })
})
