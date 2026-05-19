import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { getJob } from "./api";

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

describe("getJob", () => {
  it("fetches job by id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockJob), { status: 200 }),
    );

    const result = await getJob("550e8400-e29b-41d4-a716-446655440000");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/jobs/550e8400-e29b-41d4-a716-446655440000",
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
