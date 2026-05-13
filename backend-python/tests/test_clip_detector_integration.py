"""
Integration test: GPT clip detection against a real OpenAI API call.
Requires OPENAI_API_KEY in .env. Run with: pytest tests/test_clip_detector_integration.py -s -v
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from models import Transcript, WordTimestamp
from services.clip_detector import detect_clips

# Pre-written transcript long enough to contain 30-90 second clips.
# Simulates a ~3-minute interview-style segment with natural sentence boundaries.
TRANSCRIPT = Transcript(
    text=(
        "Welcome back everyone. Today we have a really special guest with us. She's going to talk about "
        "something that I think a lot of people struggle with, which is how to build consistent habits when "
        "your motivation runs out. Because here's the thing about motivation — it's completely unreliable. "
        "You wake up some days and you feel amazing, you're ready to conquer the world, and then other days "
        "you can barely get out of bed. And if your entire system depends on feeling motivated, you're going "
        "to fail most of the time. So what's the alternative? The alternative is building systems and routines "
        "that work regardless of how you feel. Let me give you a concrete example. When I started exercising "
        "consistently, I stopped asking myself whether I felt like going to the gym. I just had a rule: shoes on, "
        "out the door, every morning at six. That's it. I didn't negotiate with myself. I didn't check in with "
        "my feelings. I just executed the rule. And after about three weeks, it stopped being hard. It became "
        "automatic, like brushing your teeth. Now I want to talk about why most people fail at building habits, "
        "and it comes down to one thing: they try to change too much at once. They want to wake up early, exercise, "
        "eat healthy, meditate, read more, and stop scrolling their phone, all starting Monday. That's a recipe for "
        "disaster. Your willpower is a finite resource, and you're drawing from the same well for everything. Pick "
        "one thing. Just one. Get that locked in before you add anything else. The research on this is really clear. "
        "People who focus on one habit at a time are significantly more likely to maintain it long term compared to "
        "people who try to stack multiple new behaviors simultaneously. And the final thing I'll say is this: make it "
        "embarrassingly easy to start. You want to meditate? Start with two minutes. Two minutes is so easy you have "
        "no excuse not to do it. You want to read more? One page a night. One page. Because the goal isn't the output, "
        "especially at the beginning. The goal is to never miss. To build the identity of someone who meditates, who "
        "reads, who exercises. Once the identity is there, scaling up is easy."
    ),
    words=[
        WordTimestamp(word="Welcome", start=0.0, end=0.4),
        WordTimestamp(word="back", start=0.4, end=0.7),
        WordTimestamp(word="everyone.", start=0.7, end=1.2),
        WordTimestamp(word="Today", start=1.5, end=1.9),
        WordTimestamp(word="we", start=1.9, end=2.0),
        WordTimestamp(word="have", start=2.0, end=2.2),
        WordTimestamp(word="a", start=2.2, end=2.3),
        WordTimestamp(word="really", start=2.3, end=2.6),
        WordTimestamp(word="special", start=2.6, end=3.0),
        WordTimestamp(word="guest", start=3.0, end=3.3),
        WordTimestamp(word="with", start=3.3, end=3.5),
        WordTimestamp(word="us.", start=3.5, end=4.0),
        WordTimestamp(word="She's", start=4.3, end=4.6),
        WordTimestamp(word="going", start=4.6, end=4.9),
        WordTimestamp(word="to", start=4.9, end=5.0),
        WordTimestamp(word="talk", start=5.0, end=5.3),
        WordTimestamp(word="about", start=5.3, end=5.6),
        WordTimestamp(word="something", start=5.6, end=6.1),
        WordTimestamp(word="that", start=6.1, end=6.3),
        WordTimestamp(word="I", start=6.3, end=6.4),
        WordTimestamp(word="think", start=6.4, end=6.7),
        WordTimestamp(word="a", start=6.7, end=6.8),
        WordTimestamp(word="lot", start=6.8, end=7.0),
        WordTimestamp(word="of", start=7.0, end=7.1),
        WordTimestamp(word="people", start=7.1, end=7.5),
        WordTimestamp(word="struggle", start=7.5, end=8.0),
        WordTimestamp(word="with,", start=8.0, end=8.4),
        WordTimestamp(word="which", start=8.4, end=8.7),
        WordTimestamp(word="is", start=8.7, end=8.9),
        WordTimestamp(word="how", start=8.9, end=9.1),
        WordTimestamp(word="to", start=9.1, end=9.2),
        WordTimestamp(word="build", start=9.2, end=9.5),
        WordTimestamp(word="consistent", start=9.5, end=10.1),
        WordTimestamp(word="habits", start=10.1, end=10.5),
        WordTimestamp(word="when", start=10.5, end=10.8),
        WordTimestamp(word="your", start=10.8, end=11.0),
        WordTimestamp(word="motivation", start=11.0, end=11.6),
        WordTimestamp(word="runs", start=11.6, end=11.9),
        WordTimestamp(word="out.", start=11.9, end=12.5),
        WordTimestamp(word="Because", start=13.0, end=13.4),
        WordTimestamp(word="here's", start=13.4, end=13.7),
        WordTimestamp(word="the", start=13.7, end=13.8),
        WordTimestamp(word="thing", start=13.8, end=14.1),
        WordTimestamp(word="about", start=14.1, end=14.4),
        WordTimestamp(word="motivation", start=14.4, end=15.0),
        WordTimestamp(word="it's", start=15.1, end=15.4),
        WordTimestamp(word="completely", start=15.4, end=15.9),
        WordTimestamp(word="unreliable.", start=15.9, end=16.6),
        WordTimestamp(word="So", start=31.0, end=31.3),
        WordTimestamp(word="what's", start=31.3, end=31.7),
        WordTimestamp(word="the", start=31.7, end=31.8),
        WordTimestamp(word="alternative?", start=31.8, end=32.6),
        WordTimestamp(word="The", start=33.0, end=33.2),
        WordTimestamp(word="alternative", start=33.2, end=33.8),
        WordTimestamp(word="is", start=33.8, end=34.0),
        WordTimestamp(word="building", start=34.0, end=34.5),
        WordTimestamp(word="systems", start=34.5, end=35.0),
        WordTimestamp(word="and", start=35.0, end=35.1),
        WordTimestamp(word="routines", start=35.1, end=35.7),
        WordTimestamp(word="that", start=35.7, end=35.9),
        WordTimestamp(word="work", start=35.9, end=36.2),
        WordTimestamp(word="regardless", start=36.2, end=36.9),
        WordTimestamp(word="of", start=36.9, end=37.0),
        WordTimestamp(word="how", start=37.0, end=37.2),
        WordTimestamp(word="you", start=37.2, end=37.4),
        WordTimestamp(word="feel.", start=37.4, end=38.0),
        WordTimestamp(word="Pick", start=91.2, end=91.5),
        WordTimestamp(word="one", start=91.5, end=91.8),
        WordTimestamp(word="thing.", start=91.8, end=92.4),
        WordTimestamp(word="Just", start=92.8, end=93.1),
        WordTimestamp(word="one.", start=93.1, end=93.7),
        WordTimestamp(word="Get", start=94.2, end=94.5),
        WordTimestamp(word="that", start=94.5, end=94.8),
        WordTimestamp(word="locked", start=94.8, end=95.2),
        WordTimestamp(word="in", start=95.2, end=95.4),
        WordTimestamp(word="before", start=95.4, end=95.8),
        WordTimestamp(word="you", start=95.8, end=96.0),
        WordTimestamp(word="add", start=96.0, end=96.3),
        WordTimestamp(word="anything", start=96.3, end=96.8),
        WordTimestamp(word="else.", start=96.8, end=97.5),
        WordTimestamp(word="make", start=113.8, end=114.1),
        WordTimestamp(word="it", start=114.1, end=114.3),
        WordTimestamp(word="embarrassingly", start=114.3, end=115.1),
        WordTimestamp(word="easy", start=115.1, end=115.5),
        WordTimestamp(word="to", start=115.5, end=115.6),
        WordTimestamp(word="start.", start=115.6, end=116.3),
        WordTimestamp(word="Once", start=141.3, end=141.6),
        WordTimestamp(word="the", start=141.6, end=141.7),
        WordTimestamp(word="identity", start=141.7, end=142.2),
        WordTimestamp(word="is", start=142.2, end=142.4),
        WordTimestamp(word="there,", start=142.4, end=142.9),
        WordTimestamp(word="scaling", start=142.9, end=143.4),
        WordTimestamp(word="up", start=143.4, end=143.6),
        WordTimestamp(word="is", start=143.6, end=143.8),
        WordTimestamp(word="easy.", start=143.8, end=144.5),
    ],
)


def test_detect_clips_returns_valid_clips():
    clips = detect_clips(TRANSCRIPT)
    print(f"\nDetected clips: {[c.model_dump() for c in clips]}")

    assert isinstance(clips, list)
    assert len(clips) >= 1

    for clip in clips:
        assert isinstance(clip.title, str)
        assert len(clip.title) > 0
        assert isinstance(clip.start_time, float)
        assert isinstance(clip.end_time, float)
        assert clip.start_time >= 0
        assert clip.end_time > clip.start_time
        duration = clip.end_time - clip.start_time
        assert duration >= 20, f"Clip too short: {duration}s"
        assert duration <= 110, f"Clip too long: {duration}s"
