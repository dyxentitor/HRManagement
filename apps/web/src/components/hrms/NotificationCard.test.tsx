import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NotificationCard } from "./NotificationCard";

const notif = {
	id: "n1",
	type: "leave_approved",
	title: "Leave approved",
	body: "Your annual leave for 10 May was approved.",
	created_at: "2026-04-28T09:00:00Z",
	read_at: null as string | null,
	deep_link: "/leave/me",
};

function renderCard(notification = notif, onRead = vi.fn()) {
	return render(
		<MemoryRouter>
			<NotificationCard notification={notification} onRead={onRead} />
		</MemoryRouter>,
	);
}

describe("NotificationCard", () => {
	it("renders title and body", () => {
		renderCard();
		expect(screen.getByText("Leave approved")).toBeInTheDocument();
		expect(screen.getByText(/Your annual leave/)).toBeInTheDocument();
	});

	it("shows unread dot when read_at is null", () => {
		renderCard();
		expect(screen.getByLabelText(/unread/i)).toBeInTheDocument();
	});

	it("hides unread dot when read", () => {
		renderCard({ ...notif, read_at: "2026-04-28T10:00:00Z" });
		expect(screen.queryByLabelText(/unread/i)).not.toBeInTheDocument();
	});

	it("calls onRead when clicked", async () => {
		const user = userEvent.setup();
		const onRead = vi.fn();
		renderCard(notif, onRead);
		await user.click(screen.getByRole("button", { name: /Leave approved/i }));
		expect(onRead).toHaveBeenCalledWith("n1");
	});
});
