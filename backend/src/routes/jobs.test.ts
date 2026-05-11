import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../services/pipeline.js", () => ({
  runPipeline: vi.fn(),
}));

vi.mock("../services/s3.js", () => ({
  getPresignedUrl: vi
    .fn()
    .mockResolvedValue("https://s3.example.com/presigned"),
}));

const jobStore = new Map<string, Record<string, unknown>>();

vi.mock("../services/supabase.js", () => {
  function chain(resolveWith: () => Promise<unknown>): Record<string, unknown> {
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: () => obj,
      order: () => resolveWith(),
      single: () => resolveWith(),
      upsert: () => Promise.resolve({ error: null }),
      update: () => obj,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        resolveWith().then(res, rej),
    };
    return obj;
  }

  return {
    supabase: {
      from(table: string) {
        return {
          insert(data: Record<string, unknown>) {
            if (table === "jobs") jobStore.set(data.id as string, data);
            return chain(() =>
              Promise.resolve({ data, error: null }),
            );
          },
          select() {
            let filterId: string | undefined;
            const q: Record<string, unknown> = {
              eq(col: string, val: unknown) {
                if (col === "id") filterId = val as string;
                return q;
              },
              order() {
                return Promise.resolve({
                  data:
                    table === "jobs" ? [...jobStore.values()] : [],
                  error: null,
                });
              },
              single() {
                if (table === "jobs") {
                  const job = filterId
                    ? jobStore.get(filterId)
                    : undefined;
                  return job
                    ? Promise.resolve({ data: job, error: null })
                    : Promise.resolve({
                        data: null,
                        error: { message: "not found" },
                      });
                }
                return Promise.resolve({
                  data: null,
                  error: { message: "not found" },
                });
              },
              then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
                const result =
                  table === "clips"
                    ? { data: [], error: null }
                    : { data: [...jobStore.values()], error: null };
                return Promise.resolve(result).then(res, rej);
              },
            };
            return q;
          },
          update() {
            return chain(() => Promise.resolve({ error: null }));
          },
          upsert() {
            return Promise.resolve({ error: null });
          },
        };
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      },
    },
  };
});

import jobsRouter from "./jobs.js";

const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

beforeEach(() => {
  vi.clearAllMocks();
  jobStore.clear();
});

describe("POST /jobs", () => {
  it("returns 400 for missing url", async () => {
    const res = await request(app).post("/jobs").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/youtube url required/i);
  });

  it("returns 400 for non-youtube url", async () => {
    const res = await request(app)
      .post("/jobs")
      .send({ youtubeUrl: "https://vimeo.com/123" });
    expect(res.status).toBe(400);
  });

  it("creates and returns a queued job for valid youtube url", async () => {
    const res = await request(app)
      .post("/jobs")
      .send({ youtubeUrl: "https://youtube.com/watch?v=abc" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("queued");
    expect(res.body.youtubeUrl).toBe("https://youtube.com/watch?v=abc");
    expect(res.body.id).toBeDefined();
  });

  it("accepts youtu.be urls", async () => {
    const res = await request(app)
      .post("/jobs")
      .send({ youtubeUrl: "https://youtu.be/abc123" });

    expect(res.status).toBe(201);
  });
});

describe("GET /jobs/:id", () => {
  it("returns 404 for unknown job", async () => {
    const res = await request(app).get("/jobs/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns the job for a known id", async () => {
    const post = await request(app)
      .post("/jobs")
      .send({ youtubeUrl: "https://youtube.com/watch?v=abc" });

    const res = await request(app).get(`/jobs/${post.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(post.body.id);
  });
});

describe("GET /jobs", () => {
  it("returns an array of jobs", async () => {
    const res = await request(app).get("/jobs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
