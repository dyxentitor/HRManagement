import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"

import { NotificationRow } from "./NotificationRow"

const base = {
  id: 7,
  type: "leave.approved",
  channel: "in_app" as const,
  payload: {},
  deep_link: "/leave/me",
  priority: "normal" as const,
  delivery_status: "pending",
  read_at: null,
  created_at: "2026-07-06T00:00:00Z",
}

test("renders the friendly label and fires onClick", () => {
  const onClick = vi.fn()
  render(<NotificationRow notification={base} onClick={onClick} />)
  expect(screen.getByText("Leave request approved")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button"))
  expect(onClick).toHaveBeenCalledWith(base)
})

test("shows an unread indicator only when read_at is null", () => {
  const { rerender } = render(<NotificationRow notification={base} onClick={() => {}} />)
  expect(screen.getByLabelText(/unread/i)).toBeInTheDocument()
  rerender(
    <NotificationRow
      notification={{ ...base, read_at: "2026-07-06T01:00:00Z" }}
      onClick={() => {}}
    />,
  )
  expect(screen.queryByLabelText(/unread/i)).toBeNull()
})
