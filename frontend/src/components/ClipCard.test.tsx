import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipCard } from "./ClipCard";
import type { Clip } from "../types";

const baseClip: Clip = {
  id: "clip-1",
  title: "The best moment",
  startTime: 65,
  endTime: 125,
  s3Key: "clips/job-1/clip-1.mp4",
};

describe("ClipCard", () => {
  it("renders clip title", () => {
    render(<ClipCard clip={baseClip} />);
    expect(screen.getByText("The best moment")).toBeInTheDocument();
  });

  it("formats and displays time range correctly", () => {
    render(<ClipCard clip={baseClip} />);
    expect(screen.getByText(/1:05/)).toBeInTheDocument(); // startTime 65s
    expect(screen.getByText(/2:05/)).toBeInTheDocument(); // endTime 125s
  });

  it("displays duration in seconds", () => {
    render(<ClipCard clip={baseClip} />);
    expect(screen.getByText("60s")).toBeInTheDocument();
  });

  it("shows placeholder icon when no thumbnail", () => {
    render(<ClipCard clip={baseClip} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows thumbnail image when thumbnailUrl is provided", () => {
    render(
      <ClipCard
        clip={{ ...baseClip, thumbnailUrl: "https://s3.example.com/thumb.jpg" }}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://s3.example.com/thumb.jpg");
    expect(img).toHaveAttribute("alt", "The best moment");
  });

  it("shows processing state when no s3Url", () => {
    render(<ClipCard clip={baseClip} />);
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("shows download link when s3Url is provided", () => {
    render(
      <ClipCard
        clip={{ ...baseClip, s3Url: "https://s3.example.com/clip.mp4" }}
      />,
    );
    const link = screen.getByRole("link", { name: /download mp4/i });
    expect(link).toHaveAttribute("href", "https://s3.example.com/clip.mp4");
  });
});
