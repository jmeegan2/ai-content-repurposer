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
        model="gpt-4o", # this isnt the expensive part so if u wanna use a better model no problem 
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert viral content editor for TikTok, Instagram Reels, and YouTube Shorts.\n\n"
                    "Identify the best clips from this transcript. Return between 1 and 5 clips — only include "
                    "a clip if it would genuinely perform well as a standalone short-form video. Do NOT pad to "
                    "hit a number. It is better to return 1 great clip than 3 mediocre ones.\n\n"
                    "Each clip must:\n"
                    "- Be 15–90 seconds long (can exceed 90s if the content genuinely earns it — never pad)\n"
                    "- Start and end at a natural sentence boundary\n"
                    "- Be completely self-contained — no outside context needed\n"
                    "- Open with a strong hook: a bold claim, surprising fact, question, or emotional moment\n"
                    "- Have a clear payoff: insight, punchline, resolution, or revelation\n\n"
                    "Virality signals to look for:\n"
                    "- Counterintuitive or surprising statements\n"
                    "- Strong emotion (excitement, fear, inspiration, humor)\n"
                    "- Quotable one-liners or memorable phrases\n"
                    "- A story with a clear arc within the clip\n"
                    "- Practical advice that feels immediately useful\n\n"
                    "Score each clip 1–10 for virality potential. Only return clips you would score 6 or above.\n\n"
                    "Use the timestamps to set precise startTime and endTime in seconds."
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
                                        "viralityScore": {
                                            "type": "integer",
                                            "description": "Virality potential 1–10. Only include clips scored 6 or above.",
                                            "minimum": 1,
                                            "maximum": 10,
                                        },
                                    },
                                    "required": ["title", "startTime", "endTime", "viralityScore"],
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
        if c.get("viralityScore", 10) >= 6
    ]
