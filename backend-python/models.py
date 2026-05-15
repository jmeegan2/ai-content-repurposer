from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

JobStatus = Literal["queued", "downloading", "transcribing", "detecting", "processing", "done", "failed"]


class AppModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class WordTimestamp(AppModel):
    word: str
    start: float
    end: float


class Transcript(AppModel):
    text: str
    words: list[WordTimestamp]


YoutubeUploadStatus = Literal["pending", "uploaded", "failed"]


class Clip(AppModel):
    id: str
    start_time: float
    end_time: float
    title: str
    s3_key: str
    thumbnail_key: Optional[str] = None
    s3_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    youtube_video_id: Optional[str] = None
    youtube_upload_status: Optional[YoutubeUploadStatus] = None


class Job(AppModel):
    id: str
    youtube_url: str
    status: JobStatus
    created_at: str
    updated_at: str
    transcript: Optional[Transcript] = None
    error: Optional[str] = None
    clips: list[Clip] = []


class DetectedClip(AppModel):
    title: str
    start_time: float
    end_time: float
