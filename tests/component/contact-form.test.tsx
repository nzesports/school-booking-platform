// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ContactForm } from "@/components/forms/contact-form";

describe("ContactForm", () => {
  it("renders labelled, accessible contact fields", () => {
    render(<ContactForm action={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "Your name" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute(
      "type",
      "email"
    );
    expect(screen.getByRole("textbox", { name: "School or organisation" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Subject" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "How can we help?" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("submits entered values and resets after success", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      status: "success" as const,
      message: "Thanks — your message has been sent. We'll be in touch soon."
    }));
    render(<ContactForm action={action} />);

    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Aroha Rangi");
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "aroha@example.nz");
    await user.type(
      screen.getByRole("textbox", { name: "School or organisation" }),
      "Harbour College"
    );
    await user.type(screen.getByRole("textbox", { name: "Subject" }), "Session question");
    await user.type(
      screen.getByRole("textbox", { name: "How can we help?" }),
      "Please tell me about your sessions."
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("status")).toHaveTextContent("message has been sent");
    expect(action).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("")
    );
  });

  it("associates server validation errors with their fields", async () => {
    const action = vi.fn(async () => ({
      status: "error" as const,
      message: "Check the highlighted fields and try again.",
      fieldErrors: { name: ["Enter your name."] }
    }));
    render(<ContactForm action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("highlighted fields");
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAccessibleDescription(
      "Enter your name."
    );
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });
});
