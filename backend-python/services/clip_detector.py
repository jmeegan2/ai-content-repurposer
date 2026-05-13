import os
import json
from openai import OpenAI
from models import Transcript, DetectedClip

_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
_CHUNK_SIZE = 10


def _format_timestamped_transcript(transcript: Transcript) -> str:
    lines = []
    words = transcript.words
    for i in range(0, len(words), _CHUNK_SIZE):
        chunk = words[i : i + _CHUNK_SIZE]
        start = f"{chunk[0].start:.1f}"
        text = " ".join(w.word for w in chunk)
        lines.append(f"[{start}s] {text}")
    return "\n".join(lines)


def detect_clips(transcript: Transcript) -> list[DetectedClip]:
    formatted = _format_timestamped_transcript(transcript)

    response = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert at identifying viral short-form video clips for TikTok, "
                    "Instagram Reels, and YouTube Shorts.\n\n"
                    "Given a word-timestamped transcript, find the 3-5 best clips. Each clip must:\n"
                    "- Be 30–90 seconds long\n"
                    "- Start and end at a natural sentence boundary (never mid-word or mid-sentence)\n"
                    "- Be self-contained — the viewer needs no context outside the clip\n"
                    "- Have a strong hook in the first 3 seconds\n"
                    "- Be engaging: funny, insightful, emotional, or surprising\n\n"
                    "Use the timestamps in the transcript to set precise startTime and endTime values in seconds."
                ),
            },
            {
                "role": "user",
                "content": f"Find the best viral clips in this transcript:\n\n{formatted}",
            },
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "report_clips",
                    "description": "Report the detected viral clips from the transcript",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "clips": {
                                "type": "array",
                                "description": "Clips ordered by virality potential (best first)",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {"type": "string", "description": "Short, catchy title for the clip"},
                                        "startTime": {"type": "number", "description": "Clip start time in seconds"},
                                        "endTime": {"type": "number", "description": "Clip end time in seconds"},
                                    },
                                    "required": ["title", "startTime", "endTime"],
                                    "additionalProperties": False,
                                },
                            }
                        },
                        "required": ["clips"],
                        "additionalProperties": False,
                    },
                },
            }
        ],
        tool_choice={"type": "function", "function": {"name": "report_clips"}},
    )

    tool_call = response.choices[0].message.tool_calls
    if not tool_call:
        raise RuntimeError("Model did not return clip detections")

    data = json.loads(tool_call[0].function.arguments)
    return [
        DetectedClip(
            title=c["title"],
            start_time=c["startTime"],
            end_time=c["endTime"],
        )
        for c in data["clips"]
    ]
