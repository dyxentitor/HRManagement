import { describe, expect, it } from "vitest"

import { friendlyActionError } from "./action-errors"

describe("friendlyActionError", () => {
  it("maps an already-resolved claim to a stale-queue message", () => {
    expect(friendlyActionError(new Error("Cannot act on status='cancelled'"))).toMatch(
      /already actioned/i,
    )
  })

  it("maps a wrong-stage 403 to a moved-stage message", () => {
    expect(
      friendlyActionError(new Error("User x lacks claim:approve:finance for pool level 2")),
    ).toMatch(/moved to a stage/i)
  })

  it("passes through an unrelated message", () => {
    expect(friendlyActionError(new Error("Network down"))).toBe("Network down")
  })
})
