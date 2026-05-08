import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UrlForm } from "./UrlForm";

describe("UrlForm", () => {
  it("renders input and submit button", () => {
    render(<UrlForm onSubmit={vi.fn()} disabled={false} />);
    expect(screen.getByPlaceholderText(/youtube/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate clips/i })
    ).toBeInTheDocument();
  });

  it("disables button when input is empty", () => {
    render(<UrlForm onSubmit={vi.fn()} disabled={false} />);
    expect(
      screen.getByRole("button", { name: /generate clips/i })
    ).toBeDisabled();
  });

  it("disables input and button when disabled prop is true", () => {
    render(<UrlForm onSubmit={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /generate clips/i })
    ).toBeDisabled();
  });

  it("calls onSubmit with trimmed url on submit", async () => {
    const onSubmit = vi.fn();
    render(<UrlForm onSubmit={onSubmit} disabled={false} />);
    await userEvent.type(
      screen.getByRole("textbox"),
      "  https://youtube.com/watch?v=abc  "
    );
    await userEvent.click(
      screen.getByRole("button", { name: /generate clips/i })
    );
    expect(onSubmit).toHaveBeenCalledWith("https://youtube.com/watch?v=abc");
  });
});
