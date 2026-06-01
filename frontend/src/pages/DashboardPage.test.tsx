import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import * as api from "../api";
import { toast } from "sonner";
import type { Job } from "../types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn().mockReturnValue("toast-id-1"), dismiss: vi.fn() },
  Toaster: () => null,
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/auth", () => ({ useSession: () => ({ user: { id: "user-1" } }) }));
vi.mock("../lib/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("../hooks/useUpload", () => ({
  useUpload: () => ({ submit: vi.fn(), submitting: false, uploadProgress: null, abortUpload: null, error: null, localThumbnails: new Map() }),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getJobs: vi.fn(),
    getJob: vi.fn(),
    getCredits: vi.fn().mockResolvedValue({ subscriptionStatus: "active", creditsRemaining: 100 }),
    cancelJob: vi.fn(),
    getClipYoutubeStatus: vi.fn(),
  };
});

// imported after mocks are set up
const { DashboardPage } = await import("./DashboardPage");

const doneJobWithPendingUpload: Job = {
  id: "job-1",
  youtubeUrl: "upload:video.mp4",
  status: "done" as const,
  error: undefined,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  clips: [
    {
      id: "clip-1",
      title: "Best Clip",
      startTime: 10,
      endTime: 40,
      s3Key: "clips/job-1/clip-1.mp4",
      s3Url: "https://s3.example.com/clip-1.mp4",
      thumbnailUrl: "https://s3.example.com/thumb-1.jpg",
      youtubeUploadStatus: "pending" as const,
      youtubeVideoId: undefined,
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.getJobs).mockResolvedValue([doneJobWithPendingUpload]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DashboardPage YouTube status polling", () => {
  it("calls getClipYoutubeStatus for pending clips on done jobs, not getJob", async () => {
    vi.mocked(api.getClipYoutubeStatus).mockResolvedValue({
      youtubeUploadStatus: "pending",
      youtubeVideoId: null,
    });

    render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); }); // flush getJobs

    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });

    expect(api.getClipYoutubeStatus).toHaveBeenCalledWith("clip-1");
    expect(api.getJob).not.toHaveBeenCalled();
  });

  it("updates only youtube fields when status resolves — s3Url is unchanged", async () => {
    vi.mocked(api.getClipYoutubeStatus).mockResolvedValue({
      youtubeUploadStatus: "uploaded",
      youtubeVideoId: "yt-abc123",
    });

    const { container } = render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });

    // YouTube link appears — status was updated
    const ytLink = container.querySelector('a[href="https://youtube.com/shorts/yt-abc123"]');
    expect(ytLink).toBeInTheDocument();

    // Download link still present — s3Url was not wiped
    const downloadLink = container.querySelector('a[href="https://s3.example.com/clip-1.mp4"]');
    expect(downloadLink).toBeInTheDocument();
  });

  it("stops polling youtube status once upload resolves", async () => {

    vi.mocked(api.getClipYoutubeStatus).mockResolvedValue({
      youtubeUploadStatus: "uploaded",
      youtubeVideoId: "yt-abc123",
    });

    render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); });

    // First tick — resolves to uploaded, clip leaves pending state
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });

    const callsAfterFirstTick = vi.mocked(api.getClipYoutubeStatus).mock.calls.length;

    // Second tick — clip is no longer pending, should not poll again
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });

    expect(vi.mocked(api.getClipYoutubeStatus).mock.calls.length).toBe(callsAfterFirstTick);
  });
});

const processingJob: Job = {
  id: "job-2",
  youtubeUrl: "upload:video.mp4",
  status: "transcribing" as const,
  error: undefined,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  clips: [],
};

describe("DashboardPage connection error handling", () => {
  it("shows error toast when getJobs fails", async () => {
    vi.mocked(api.getJobs).mockRejectedValue(new TypeError("Failed to fetch"));

    render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Unable to reach server",
      expect.objectContaining({ duration: Infinity }),
    );
  });

  it("does not show error toast when getJobs succeeds", async () => {
    render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); });

    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("shows error toast when job polling fails", async () => {
    vi.mocked(api.getJobs).mockResolvedValue([processingJob]);
    vi.mocked(api.getJob).mockRejectedValue(new TypeError("Failed to fetch"));

    render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); }); // flush getJobs

    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Unable to reach server",
      expect.objectContaining({ duration: Infinity }),
    );
  });

  it("dismisses error toast when polling recovers", async () => {
    vi.mocked(api.getJobs).mockResolvedValue([processingJob]);
    vi.mocked(api.getJob)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ ...processingJob });

    render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); }); // flush getJobs

    // First poll — fails, toast shown
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(toast.error)).toHaveBeenCalled();

    // Second poll — succeeds, toast dismissed
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(toast.dismiss)).toHaveBeenCalledWith("toast-id-1");
  });
});
