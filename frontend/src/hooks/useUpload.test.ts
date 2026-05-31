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
  thumbnail_upload_url: "https://s3.example.com/thumbnail-upload",
};

const mockJob = {
  id: "job-1",
  youtubeUrl: "upload:video.mp4",
  status: "queued",
  clips: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function mockCanvas(blob: Blob | null) {
  const ctx = { drawImage: vi.fn() };
  const canvas: any = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(ctx),
    toBlob: vi.fn().mockImplementation((cb: (b: Blob | null) => void) => queueMicrotask(() => cb(blob))),
  };
  return { canvas, ctx };
}

// Fires onerror — thumbnail capture fails, duration resolves to 0.
function mockVideoElement() {
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "video") {
      const el: any = { preload: "", muted: false, duration: 0, videoWidth: 0, videoHeight: 0, onloadedmetadata: null, onseeked: null, onerror: null };
      let _src = "";
      Object.defineProperty(el, "src", {
        get: () => _src,
        set: (val) => { _src = val; queueMicrotask(() => el.onerror?.()); },
        configurable: true,
      });
      return el;
    }
    return HTMLDocument.prototype.createElement.call(document, tag);
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
}

// Fires onloadedmetadata then onseeked — simulates successful thumbnail capture.
function mockVideoElementWithMetadata(duration: number, blob: Blob | null) {
  const { canvas } = mockCanvas(blob);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "video") {
      const el: any = {
        preload: "", muted: false,
        duration, videoWidth: 1280, videoHeight: 720,
        onloadedmetadata: null, onseeked: null, onerror: null,
      };
      let _currentTime = 0;
      Object.defineProperty(el, "currentTime", {
        get: () => _currentTime,
        set: (val) => { _currentTime = val; queueMicrotask(() => el.onseeked?.()); },
        configurable: true,
      });
      let _src = "";
      Object.defineProperty(el, "src", {
        get: () => _src,
        set: (val) => { _src = val; queueMicrotask(() => el.onloadedmetadata?.()); },
        configurable: true,
      });
      return el;
    }
    if (tag === "canvas") return canvas;
    return HTMLDocument.prototype.createElement.call(document, tag);
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  return { canvas };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
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

    await act(async () => { await result.current.startUpload(mockFile); });

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

    await act(async () => { await result.current.startUpload(mockFile); });

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

    await act(async () => { await result.current.startUpload(mockFile); });

    expect(cancelJob).toHaveBeenCalledWith("job-1");
    expect(result.current.error).toBeNull();
  });
});

describe("useUpload — happy path", () => {
  it("sets uploadDone after upload, then calls completeUpload and onJobCreated on generateClips", async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({
      promise: Promise.resolve(),
      abort: vi.fn(),
    }));
    vi.mocked(completeUpload).mockResolvedValue(mockJob as any);

    const onJobCreated = vi.fn();
    const { result } = renderHook(() => useUpload(onJobCreated));

    await act(async () => { await result.current.startUpload(mockFile); });

    expect(result.current.uploadDone).toBe(true);
    expect(completeUpload).not.toHaveBeenCalled();

    await act(async () => { await result.current.generateClips(); });

    expect(completeUpload).toHaveBeenCalledWith("job-1", "raw/job-1/video.mp4", expect.any(Number));
    expect(onJobCreated).toHaveBeenCalledWith(mockJob);
    expect(cancelJob).not.toHaveBeenCalled();
    expect(result.current.uploadDone).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe("useUpload — thumbnail capture", () => {
  it("seeks to 10% of duration when capturing thumbnail", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    const { canvas } = mockVideoElementWithMetadata(100, blob);

    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({ promise: Promise.resolve(), abort: vi.fn() }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { result } = renderHook(() => useUpload(vi.fn()));
    await act(async () => { await result.current.startUpload(mockFile); });

    expect(canvas.toBlob).toHaveBeenCalled();
    expect(canvas.getContext).toHaveBeenCalledWith("2d");
  });

  it("uploads thumbnail blob to thumbnail_upload_url via PUT", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    mockVideoElementWithMetadata(60, blob);

    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({ promise: Promise.resolve(), abort: vi.fn() }));
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useUpload(vi.fn()));
    await act(async () => { await result.current.startUpload(mockFile); });

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchSpy).toHaveBeenCalledWith(
      mockUploadUrl.thumbnail_upload_url,
      expect.objectContaining({ method: "PUT", headers: expect.objectContaining({ "Content-Type": "image/jpeg" }) }),
    );
  });

  it("proceeds without error when thumbnail capture fails (onerror path)", async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(mockUploadUrl);
    vi.mocked(uploadToS3).mockImplementation(() => ({ promise: Promise.resolve(), abort: vi.fn() }));

    const { result } = renderHook(() => useUpload(vi.fn()));
    await act(async () => { await result.current.startUpload(mockFile); });

    expect(result.current.error).toBeNull();
    expect(result.current.uploadDone).toBe(true);
  });
});
