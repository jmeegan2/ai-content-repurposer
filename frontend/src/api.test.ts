import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { getJob, requestUploadUrl } from "./api";

const mockJob = {
  id: "job-1",
  youtubeUrl: "https://youtube.com/watch?v=abc",
  status: "queued",
  clips: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("requestUploadUrl", () => {
  it("returns job_id, upload_url, s3_key on success", async () => {
    const payload = { job_id: "job-1", upload_url: "https://s3.example.com/upload", s3_key: "raw/job-1/video.mp4" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 201 }),
    );

    const result = await requestUploadUrl("video.mp4", 120);
    expect(result).toEqual(payload);
  });

  it("throws the backend detail message on 402", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "Not enough credits. You need 2 but only have 0 remaining." }),
        { status: 402 },
      ),
    );

    await expect(requestUploadUrl("video.mp4", 120)).rejects.toThrow(
      "Not enough credits. You need 2 but only have 0 remaining.",
    );
  });

  it("throws fallback message when no detail is present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 500 }),
    );

    await expect(requestUploadUrl("video.mp4", 120)).rejects.toThrow(
      "Failed to initialize upload",
    );
  });
});

describe("getJob", () => {
  it("fetches job by id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockJob), { status: 200 }),
    );

    const result = await getJob("550e8400-e29b-41d4-a716-446655440000");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/jobs/550e8400-e29b-41d4-a716-446655440000",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(result).toEqual(mockJob);
  });

  it("throws for invalid job id", async () => {
    await expect(getJob("not-a-uuid")).rejects.toThrow("Invalid job ID");
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 404 }),
    );

    await expect(
      getJob("550e8400-e29b-41d4-a716-446655440000"),
    ).rejects.toThrow("Failed to fetch job");
  });
});
