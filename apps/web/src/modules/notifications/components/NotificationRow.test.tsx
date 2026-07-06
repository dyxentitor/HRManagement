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

const noop = () => {}

test("renders the friendly label and row click fires onClick", () => {
  const onClick = vi.fn()
  render(<NotificationRow notification={base} onClick={onClick} onMarkRead={noop} onView={noop} />)
  expect(screen.getByText("Leave request approved")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /leave request approved/i }))
  expect(onClick).toHaveBeenCalledWith(base)
})

test("Mark as read fires onMarkRead and not onView/onClick", () => {
  const onMarkRead = vi.fn()
  const onView = vi.fn()
  const onClick = vi.fn()
  render(
    <NotificationRow
      notification={base}
      onClick={onClick}
      onMarkRead={onMarkRead}
      onView={onView}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: /mark as read/i }))
  expect(onMarkRead).toHaveBeenCalledWith(base)
  expect(onView).not.toHaveBeenCalled()
  expect(onClick).not.toHaveBeenCalled()
})

test("View details fires onView", () => {
  const onView = vi.fn()
  render(<NotificationRow notification={base} onClick={noop} onMarkRead={noop} onView={onView} />)
  fireEvent.click(screen.getByRole("button", { name: /view details/i }))
  expect(onView).toHaveBeenCalledWith(base)
})

test("unread indicator + Mark-as-read only present when unread", () => {
  const { rerender } = render(
    <NotificationRow notification={base} onClick={noop} onMarkRead={noop} onView={noop} />,
  )
  expect(screen.getByLabelText(/unread/i)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /mark as read/i })).toBeInTheDocument()
  rerender(
    <NotificationRow
      notification={{ ...base, read_at: "2026-07-06T01:00:00Z" }}
      onClick={noop}
      onMarkRead={noop}
      onView={noop}
    />,
  )
  expect(screen.queryByLabelText(/unread/i)).toBeNull()
  expect(screen.queryByRole("button", { name: /mark as read/i })).toBeNull()
})
