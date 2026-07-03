import { describe, expect, it } from "vitest"

import { type EmailConfigForm, validate, warnings } from "./email-config-validation"

const base: EmailConfigForm = {
  enabled: false,
  smtp_host: "",
  smtp_port: 587,
  encryption: "starttls",
  use_auth: true,
  smtp_username: "",
  smtp_password: "",
  sender_name: "",
  sender_email: "",
  reply_to: "",
  connection_timeout: 10,
  rate_limit_per_minute: 60,
  max_retry_attempts: 3,
  retry_interval_seconds: 60,
  signature: "",
  provider_preset: "",
}

describe("validate", () => {
  it("requires host + sender when enabled", () => {
    const errs = validate({ ...base, enabled: true }, false)
    expect(errs.smtp_host).toBeDefined()
    expect(errs.sender_email).toBeDefined()
  })

  it("allows blank password when one is already stored", () => {
    const errs = validate(
      {
        ...base,
        enabled: true,
        smtp_host: "h",
        sender_email: "s@e.com",
        use_auth: true,
        smtp_username: "u",
        smtp_password: "",
      },
      true,
    )
    expect(errs.smtp_password).toBeUndefined()
  })

  it("requires a password when auth is on and none is stored", () => {
    const errs = validate(
      {
        ...base,
        enabled: true,
        smtp_host: "h",
        sender_email: "s@e.com",
        use_auth: true,
        smtp_username: "u",
      },
      false,
    )
    expect(errs.smtp_password).toBeDefined()
  })

  it("rejects out-of-range port", () => {
    expect(validate({ ...base, smtp_port: 70000 }, false).smtp_port).toBeDefined()
  })

  it("allows an incomplete draft while disabled", () => {
    expect(Object.keys(validate({ ...base, enabled: false }, false))).toHaveLength(0)
  })
})

describe("warnings", () => {
  it("flags port 465 without SSL", () => {
    expect(warnings({ ...base, smtp_port: 465, encryption: "starttls" })).toContain(
      "Port 465 usually requires SSL/TLS encryption.",
    )
  })
})
