import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Holiday } from "../api"

const mocks = vi.hoisted(() => ({
  can: (): boolean => true,
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  syncPreview: vi.fn(),
  getOrg: vi.fn(),
  patchOrg: vi.fn(),
}))

vi.mock("@/lib/perm", () => ({ useCan: () => mocks.can() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("../api", () => ({
  holidayApi: {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    remove: mocks.remove,
    confirm: mocks.confirm,
    syncPreview: mocks.syncPreview,
  },
}))
vi.mock("@/modules/admin/settings/settings-api", () => ({
  settingsApi: { getOrg: mocks.getOrg, patchOrg: mocks.patchOrg },
}))

import AdminHolidaysPage from "./AdminHolidaysPage"

const ORG = {
  id: "org1",
  name: "Provintell",
  slug: "provintell",
  country_code: "MY",
  default_subdivision_code: "MY-10",
  default_currency: "MYR",
  default_timezone: "Asia/Kuala_Lumpur",
  default_locale: "en-MY",
  settings: {},
  status: "active",
  logo_url: null,
}

function holiday(overrides: Partial<Holiday> & Pick<Holiday, "id" | "date" | "name">): Holiday {
  return {
    type: "federal",
    applies_to_country_code: "MY",
    applies_to_state_code: "",
    applies_to_subdivision_code: "",
    source: "import",
    source_provider: "nager",
    source_version: "2026.1",
    imported_at: "2026-01-02T00:00:00Z",
    observed: false,
    provisional: false,
    is_protected: false,
    external_id: "",
    occurrence: 1,
    published: true,
    confirmed_at: null,
    confirmed_by: null,
    excluded: false,
    notes: "",
    ...overrides,
  }
}

const ROWS: Holiday[] = [
  holiday({
    id: "h1",
    date: "2026-08-25",
    name: "Founders Day",
    type: "company",
    source: "company",
    is_protected: true,
  }),
  holiday({ id: "h2", date: "2026-08-31", name: "Merdeka Day", source: "import" }),
  holiday({
    id: "h3",
    date: "2026-09-16",
    name: "Malaysia Day (office closed)",
    source: "override",
    observed: true,
  }),
  holiday({
    id: "h4",
    date: "2026-12-25",
    name: "Christmas Day",
    source: "legacy",
    provisional: true,
    excluded: true,
    published: false,
  }),
]

beforeEach(() => {
  mocks.can = () => true
  for (const fn of [
    mocks.list,
    mocks.create,
    mocks.update,
    mocks.remove,
    mocks.confirm,
    mocks.syncPreview,
    mocks.getOrg,
    mocks.patchOrg,
  ]) {
    fn.mockReset()
  }
  mocks.list.mockResolvedValue(ROWS)
  mocks.getOrg.mockResolvedValue(ORG)
})

function renderPage() {
  return render(<AdminHolidaysPage />)
}

describe("AdminHolidaysPage", () => {
  it("renders one row per holiday with its source badge", async () => {
    renderPage()
    await screen.findByText("Founders Day")

    expect(screen.getByText("Company")).toBeInTheDocument()
    expect(screen.getByText("Imported")).toBeInTheDocument()
    expect(screen.getByText("Override")).toBeInTheDocument()
    expect(screen.getByText("Legacy")).toBeInTheDocument()
  })

  it("marks observed, provisional and protected rows", async () => {
    renderPage()
    await screen.findByText("Founders Day")

    expect(screen.getByText("Observed")).toBeInTheDocument()
    expect(screen.getByText("Provisional")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /protected: founders day/i })).toHaveAttribute(
      "title",
      expect.stringContaining("import will not overwrite"),
    )
  })

  it("renders excluded holidays struck through", async () => {
    renderPage()
    const name = await screen.findByText("Christmas Day")
    expect(name.className).toContain("line-through")

    const active = screen.getByText("Merdeka Day")
    expect(active.className).not.toContain("line-through")
  })

  it("hides every write control without schedule:holiday:write", async () => {
    mocks.can = () => false
    renderPage()
    await screen.findByText("Founders Day")

    expect(screen.queryByRole("button", { name: /add company holiday/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /preview sync/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /edit founders day/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /exclude merdeka day/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /delete merdeka day/i })).toBeNull()
  })

  it("toggles the excluded flag from the row action", async () => {
    const user = userEvent.setup()
    mocks.update.mockResolvedValue(ROWS[1])
    renderPage()
    await user.click(await screen.findByRole("button", { name: /exclude merdeka day/i }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("h2", { excluded: true }))
  })

  it("creates a company holiday from the add dialog", async () => {
    const user = userEvent.setup()
    mocks.create.mockResolvedValue(ROWS[0])
    renderPage()
    await user.click(await screen.findByRole("button", { name: /add company holiday/i }))
    await user.clear(screen.getByLabelText(/^name$/i))
    await user.type(screen.getByLabelText(/^name$/i), "Team Day")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Team Day", type: "company" }),
      ),
    )
  })

  it("shows the sync preview counts and states that it is read-only", async () => {
    const user = userEvent.setup()
    mocks.syncPreview.mockResolvedValue({
      year: 2026,
      counts: { added: 2, updated: 1, unchanged: 12, withdrawn: 0, skipped: 3, conflicted: 1 },
      changes: ["add 2026-05-01 Labour Day"],
      conflicts: ["2026-09-16 Malaysia Day — locally overridden"],
    })
    renderPage()
    await user.click(await screen.findByRole("button", { name: /preview sync/i }))

    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("add 2026-05-01 Labour Day")
    expect(within(dialog).getByText(/2026-09-16 Malaysia Day/)).toBeInTheDocument()
    expect(within(dialog).getByText(/read-only preview/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: /^apply/i })).toBeNull()
    // The page defaults to the current (local) year.
    expect(mocks.syncPreview).toHaveBeenCalledWith(new Date().getFullYear())
  })
})

describe("AdminHolidaysPage publication state", () => {
  it("flags a provisional row as hidden from employees and offers Confirm", async () => {
    renderPage()
    await screen.findByText("Christmas Day")

    expect(screen.getByText(/provisional — hidden from employees/i)).toBeInTheDocument()
    const confirm = screen.getByRole("button", { name: /confirm christmas day/i })
    expect(confirm).toHaveAttribute("title", expect.stringContaining("publishes this date"))
  })

  it("confirms the provisional holiday and reloads the list", async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue({ ...ROWS[3], provisional: false, published: true })
    renderPage()

    await user.click(await screen.findByRole("button", { name: /confirm christmas day/i }))

    // holidayApi.confirm POSTs /api/v1/schedule/holidays/{id}/confirm/.
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith("h4"))
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
  })

  it("shows a confirmed row as confirmed and drops its Confirm button", async () => {
    mocks.list.mockResolvedValue([
      holiday({
        id: "h5",
        date: "2026-05-01",
        name: "Labour Day",
        confirmed_at: "2026-08-25T06:00:00Z",
        confirmed_by: "u1",
      }),
    ])
    renderPage()
    await screen.findByText("Labour Day")

    expect(screen.getByText(/^confirmed /i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /confirm labour day/i })).toBeNull()
  })

  it("hides the Confirm button without schedule:holiday:write", async () => {
    mocks.can = () => false
    renderPage()
    await screen.findByText("Christmas Day")

    expect(screen.queryByRole("button", { name: /confirm christmas day/i })).toBeNull()
    // The read-only indicator stays — only the action is gated.
    expect(screen.getByText(/provisional — hidden from employees/i)).toBeInTheDocument()
  })
})

describe("AdminHolidaysPage last-import status", () => {
  it("reports the newest imported_at with its provider and version", async () => {
    mocks.list.mockResolvedValue([
      holiday({
        id: "h1",
        date: "2026-01-01",
        name: "New Year's Day",
        imported_at: "2026-02-01T06:00:00Z",
        source_provider: "nager",
        source_version: "1.0",
      }),
      holiday({
        id: "h2",
        date: "2026-08-31",
        name: "Merdeka Day",
        imported_at: "2026-08-25T06:00:00Z",
        source_provider: "python-holidays",
        source_version: "0.103",
      }),
    ])
    renderPage()
    await screen.findByText("Merdeka Day")

    expect(
      await screen.findByText("Last imported 25 Aug 2026 from python-holidays 0.103"),
    ).toBeInTheDocument()
  })

  it("says so when nothing in the year came from an import", async () => {
    mocks.list.mockResolvedValue([
      holiday({
        id: "h1",
        date: "2026-08-25",
        name: "Founders Day",
        source: "company",
        imported_at: null,
      }),
    ])
    renderPage()
    await screen.findByText("Founders Day")

    expect(screen.getByText(/no imported holidays for 2026/i)).toBeInTheDocument()
  })
})

describe("AdminHolidaysPage holiday-calendar settings", () => {
  it("renders the org country and its current subdivision", async () => {
    renderPage()
    const select = await screen.findByLabelText(/state or subdivision/i)

    expect(screen.getByText("Malaysia (MY)")).toBeInTheDocument()
    expect(select).toHaveValue("MY-10")
    expect(screen.getByRole("option", { name: /national only/i })).toBeInTheDocument()
  })

  it("PATCHes the org when the subdivision changes", async () => {
    const user = userEvent.setup()
    mocks.patchOrg.mockResolvedValue({ ...ORG, default_subdivision_code: "MY-14" })
    renderPage()

    const select = await screen.findByLabelText(/state or subdivision/i)
    await user.selectOptions(select, "MY-14")

    await waitFor(() =>
      expect(mocks.patchOrg).toHaveBeenCalledWith({ default_subdivision_code: "MY-14" }),
    )
    await waitFor(() => expect(select).toHaveValue("MY-14"))
  })

  it("renders the backend's 400 message inline and reverts the field", async () => {
    const user = userEvent.setup()
    const failure: Error & { fields?: Record<string, string> } = new Error(
      "One or more fields failed validation.",
    )
    failure.fields = { default_subdivision_code: "MY-14 is not a subdivision of SG." }
    mocks.patchOrg.mockRejectedValue(failure)
    renderPage()

    const select = await screen.findByLabelText(/state or subdivision/i)
    await user.selectOptions(select, "MY-14")

    expect(await screen.findByRole("alert")).toHaveTextContent("MY-14 is not a subdivision of SG.")
    await waitFor(() => expect(select).toHaveValue("MY-10"))
  })

  it("disables the picker without org:settings:write", async () => {
    mocks.can = () => false
    renderPage()

    expect(await screen.findByLabelText(/state or subdivision/i)).toBeDisabled()
    expect(screen.getByText(/needs organisation settings access/i)).toBeInTheDocument()
  })

  it("offers only National only when the country has no subdivision map", async () => {
    mocks.getOrg.mockResolvedValue({ ...ORG, country_code: "SG", default_subdivision_code: "" })
    renderPage()

    const select = await screen.findByLabelText(/state or subdivision/i)
    expect(within(select).getAllByRole("option")).toHaveLength(1)
    expect(screen.getByText(/national holidays only/i)).toBeInTheDocument()
  })

  it("stays out of the way when org settings cannot be read", async () => {
    mocks.getOrg.mockRejectedValue(new Error("403"))
    renderPage()
    await screen.findByText("Founders Day")

    expect(screen.queryByLabelText(/state or subdivision/i)).toBeNull()
  })
})

describe("AdminHolidaysPage date rendering (CLAUDE.md §3.9)", () => {
  const ORIGINAL_TZ = process.env.TZ

  beforeEach(() => {
    // Deliberately west of UTC. A date-only key parsed or formatted in local
    // time renders one day early here, so this is the clock that catches a
    // missing `timeZone: "UTC"`. Asia/Kuala_Lumpur (UTC+8) would mask it.
    process.env.TZ = "America/New_York"
    mocks.list.mockResolvedValue([ROWS[0]])
  })
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it("renders 2026-08-25 as 25 August 2026 without shifting a day", async () => {
    renderPage()
    await screen.findByText("Founders Day")

    expect(screen.getByText("25 August 2026")).toBeInTheDocument()
    expect(screen.queryByText("24 August 2026")).toBeNull()
    // 2026-08-25 is a Tuesday in UTC; a local-time read would say Monday.
    expect(screen.getByText("Tuesday")).toBeInTheDocument()
  })

  it("renders a 1 January key without falling back into the previous year", async () => {
    mocks.list.mockResolvedValue([
      holiday({ id: "h9", date: "2026-01-01", name: "New Year's Day" }),
    ])
    renderPage()
    await screen.findByText("New Year's Day")

    expect(screen.getByText("1 January 2026")).toBeInTheDocument()
    expect(screen.queryByText("31 December 2025")).toBeNull()
  })
})
