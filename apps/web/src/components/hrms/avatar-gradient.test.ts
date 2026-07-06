import { describe, expect, it } from "vitest"
import { employeeStatusTone, gradientFromName } from "./avatar-gradient"

describe("avatar-gradient", () => {
  it("gradientFromName is deterministic and returns a pair", () => {
    const a = gradientFromName("Jane Doe")
    expect(a).toHaveLength(2)
    expect(gradientFromName("Jane Doe")).toEqual(a)
  })

  it("maps known statuses to tones + labels", () => {
    expect(employeeStatusTone("active")).toEqual({ tone: "mint", label: "Active" })
    expect(employeeStatusTone("probation").tone).toBe("yellow")
    expect(employeeStatusTone("on_leave").label).toBe("On leave")
    expect(employeeStatusTone("resigned").tone).toBe("peach")
    expect(employeeStatusTone("terminated").tone).toBe("lavender")
  })

  it("defaults to Active when status is missing", () => {
    expect(employeeStatusTone(undefined)).toEqual({ tone: "mint", label: "Active" })
  })

  it("humanises unknown statuses", () => {
    expect(employeeStatusTone("some_custom")).toEqual({ tone: "lavender", label: "Some Custom" })
  })
})
