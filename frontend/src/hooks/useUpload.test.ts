import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock("../api", () => ({
  requestUploadUrl: vi.fn(),
  uploadToS3: vi.fn(),
  completeUpload: vi.fn(),
  cancelJob: vi.fn(),
}));

import { requestUploadUrl, uploadToS3, completeUpload, cancelJob } from "../api";
import { useUpload } from "./useUpload";

const mockFile = new File(["video"], "video.mp4", { type: "video/mp4" });

const mockUploadUrl = {
  job_id: "job-1",
  upload_url: "https://s3.example.com/upload",
  s3_key: "raw/job-1/video.mp4",
};

const mockJob = {
  id: "job-1",
  youtubeUrl: "upload:video.mp4",
  status: "queued",
  clips: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function mockVideoElement() {
  // getVideoDuration creates a <video> and waits for onloadedmetadata/onerror.
  // jsdom never fires media events, so intercept and fire onerror immediately (resolves to 0).
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "video") {
      const el: any = { preload: "", duration: 0, onloadedmetadata: null, onerror: null };
      let _src = "";
      Object.defineProperty(el, "src", {
        get: () => _src,
        set: (val) => { _src = val; queueMicrotask(() => el.onerror?.()); },
        configurable: true,
      });
      return el;
    }
    // Call the real implementation via the prototype to avoid recursive spy call
    return HTMLDocument.prototype.createElement.call(document, tag);
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
}

beforeEach(() => {
  vi.restoreAllMocks(); // restores spies; module mocks (vi.mock) are unaffected
  vi.clearAllMocks();   // resets call counts on module mocks
  mockVideoElement();
});

describe("useUpload — S3 network error", () => {
  it("cancels the job and shows an error when S3 upload fails with a network error", async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({
      promise: Promise.reject(new Error("S3 upload network error")),
      abort: vi.fn(),
    }));
    vi.mocked(cancelJob).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpload(vi.fn()));

    await act(async () => { await result.current.submit(mockFile); });

    expect(cancelJob).toHaveBeenCalledWith("job-1");
    expect(result.current.error).toBe("S3 upload network error");
    expect(completeUpload).not.toHaveBeenCalled();
  });

  it("cancels the job and shows an error when S3 returns a bad status", async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({
      promise: Promise.reject(new Error("S3 upload failed: 403")),
      abort: vi.fn(),
    }));
    vi.mocked(cancelJob).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpload(vi.fn()));

    await act(async () => { await result.current.submit(mockFile); });

    expect(cancelJob).toHaveBeenCalledWith("job-1");
    expect(result.current.error).toBe("S3 upload failed: 403");
    expect(completeUpload).not.toHaveBeenCalled();
  });
});

describe("useUpload — user abort", () => {
  it("cancels the job but shows no error when user aborts", async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({
      promise: Promise.reject(new Error("upload_aborted")),
      abort: vi.fn(),
    }));
    vi.mocked(cancelJob).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpload(vi.fn()));

    await act(async () => { await result.current.submit(mockFile); });

    expect(cancelJob).toHaveBeenCalledWith("job-1");
    expect(result.current.error).toBeNull();
  });
});

describe("useUpload — happy path", () => {
  it("calls completeUpload and onJobCreated on success, never calls cancelJob", async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({
      promise: Promise.resolve(),
      abort: vi.fn(),
    }));
    vi.mocked(completeUpload).mockResolvedValue(mockJob as any);

    const onJobCreated = vi.fn();
    const { result } = renderHook(() => useUpload(onJobCreated));

    await act(async () => { await result.current.submit(mockFile); });

    expect(completeUpload).toHaveBeenCalledWith("job-1", "raw/job-1/video.mp4", expect.any(Number));
    expect(onJobCreated).toHaveBeenCalledWith(mockJob);
    expect(cancelJob).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
});
