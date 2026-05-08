import OpenAI from "openai";
import type { Transcript } from "../types/index.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DetectedClip {
  title: string;
  startTime: number;
  endTime: number;
}

// Groups word timestamps into ~10-word chunks with a leading time marker so
// the model can pinpoint precise cut points without needing the full word list.
function formatTimestampedTranscript(transcript: Transcript): string {
  const CHUNK_SIZE = 10;
  const lines: string[] = [];
  const words = transcript.words;

  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    const chunk = words.slice(i, i + CHUNK_SIZE);
    const start = chunk[0].start.toFixed(1);
    lines.push(`[${start}s] ${chunk.map((w) => w.word).join(" ")}`);
  }

  return lines.join("\n");
}

export async function detectClips(
  transcript: Transcript
): Promise<DetectedClip[]> {
  const formattedTranscript = formatTimestampedTranscript(transcript);

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert at identifying viral short-form video clips for TikTok, Instagram Reels, and YouTube Shorts.

Given a word-timestamped transcript, find the 3-5 best clips. Each clip must:
- Be 30–90 seconds long
- Start and end at a natural sentence boundary (never mid-word or mid-sentence)
- Be self-contained — the viewer needs no context outside the clip
- Have a strong hook in the first 3 seconds
- Be engaging: funny, insightful, emotional, or surprising

Use the timestamps in the transcript to set precise startTime and endTime values in seconds.`
      },
      {
        role: "user",
        content: `Find the best viral clips in this transcript:\n\n${formattedTranscript}`
      }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "report_clips",
          description: "Report the detected viral clips from the transcript",
          parameters: {
            type: "object",
            properties: {
              clips: {
                type: "array",
                description: "Clips ordered by virality potential (best first)",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description: "Short, catchy title for the clip"
                    },
                    startTime: {
                      type: "number",
                      description: "Clip start time in seconds"
                    },
                    endTime: {
                      type: "number",
                      description: "Clip end time in seconds"
                    }
                  },
                  required: ["title", "startTime", "endTime"],
                  additionalProperties: false
                }
              }
            },
            required: ["clips"],
            additionalProperties: false
          }
        }
      }
    ],
    tool_choice: { type: "function", function: { name: "report_clips" } }
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (toolCall?.type !== "function") {
    throw new Error("Model did not return clip detections");
  }

  const { clips } = JSON.parse(toolCall.function.arguments) as {
    clips: DetectedClip[];
  };
  return clips;
}
