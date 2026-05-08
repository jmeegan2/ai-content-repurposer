import "dotenv/config";
import { describe, it, expect } from "vitest";
import { uploadFile, deleteFile, getPresignedUrl } from "./s3.js";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Hits real AWS — requires valid .env credentials
describe("S3 integration", () => {
  const key = "test/connection-check.txt";
  let tempFile: string;

  it("uploads a file, returns a presigned URL, and deletes it", async () => {
    tempFile = join(tmpdir(), "connection-check.txt");
    await writeFile(tempFile, "S3 connection works!");

    await expect(uploadFile(key, tempFile, "text/plain")).resolves.toBe(key);

    const url = await getPresignedUrl(key);
    expect(url).toContain("ai-repurposer-clips");

    await expect(deleteFile(key)).resolves.toBeUndefined();

    await unlink(tempFile);
  }, 15000);
});
