import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Transcript } from "../types/index.js";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  }
}));

// Import after mock so the module picks up the mock client
const { detectClips } = await import("./clipDetector.js");

const transcript: Transcript = {
  text: "This is a great moment. You should really pay attention.",
  words: [
    { word: "This", start: 0.0, end: 0.2 },
    { word: "is", start: 0.2, end: 0.4 },
    { word: "a", start: 0.4, end: 0.5 },
    { word: "great", start: 0.5, end: 0.8 },
    { word: "moment.", start: 0.8, end: 1.2 },
    { word: "You", start: 40.0, end: 40.2 },
    { word: "should", start: 40.2, end: 40.5 },
    { word: "really", start: 40.5, end: 40.9 },
    { word: "pay", start: 40.9, end: 41.2 },
    { word: "attention.", start: 41.2, end: 41.8 }
  ]
};

const makeToolResponse = (clips: object[]) => ({
  choices: [
    {
      message: {
        tool_calls: [
          {
            type: "function",
            function: {
              name: "report_clips",
              arguments: JSON.stringify({ clips })
            }
          }
        ]
      }
    }
  ]
});

describe("detectClips", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns detected clips from a successful tool response", async () => {
    mockCreate.mockResolvedValue(
      makeToolResponse([
        { title: "Great Moment", startTime: 0.0, endTime: 45.0 },
        { title: "Pay Attention", startTime: 50.0, endTime: 90.0 }
      ])
    );

    const clips = await detectClips(transcript);

    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({
      title: "Great Moment",
      startTime: 0.0,
      endTime: 45.0
    });
    expect(clips[1]).toMatchObject({
      title: "Pay Attention",
      startTime: 50.0,
      endTime: 90.0
    });
  });

  it("passes the correct model and tool_choice to the API", async () => {
    mockCreate.mockResolvedValue(makeToolResponse([]));

    await detectClips(transcript);

    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("gpt-5.4-mini");
    expect(call.tool_choice).toEqual({
      type: "function",
      function: { name: "report_clips" }
    });
    expect(call.tools[0].function.name).toBe("report_clips");
  });

  it("includes the formatted transcript in the user message", async () => {
    mockCreate.mockResolvedValue(makeToolResponse([]));

    await detectClips(transcript);

    const userMessage = mockCreate.mock.calls[0][0].messages[1]
      .content as string;
    expect(userMessage).toContain("[0.0s]");
    expect(userMessage).toContain("This");
  });

  it("throws when the response contains no tool call", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [] } }]
    });

    await expect(detectClips(transcript)).rejects.toThrow(
      "Model did not return clip detections"
    );
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValue(new Error("Rate limit exceeded"));

    await expect(detectClips(transcript)).rejects.toThrow(
      "Rate limit exceeded"
    );
  });
});
