import { describe, expect, it } from "vitest"
import { PEOPLE_NAV_ITEMS } from "./people-nav-config"

describe("people-nav-config", () => {
  it("exposes the Organization Chart tab gated on employee:read:org", () => {
    const item = PEOPLE_NAV_ITEMS.find((i) => i.to === "/admin/people/org-chart")
    expect(item).toBeDefined()
    expect(item?.label).toBe("Organization Chart")
    expect(item?.perm).toBe("employee:read:org")
  })

  it("keeps Directory as the first tab", () => {
    expect(PEOPLE_NAV_ITEMS[0]?.to).toBe("/admin/people")
  })
})
