import os
import boto3
from botocore.config import Config

_BUCKET = os.environ.get("AWS_S3_BUCKET", "")

_s3 = boto3.client(
    "s3",
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    config=Config(signature_version="s3v4"),
)


def upload_file(key: str, file_path: str, content_type: str = "video/mp4") -> str:
    with open(file_path, "rb") as f:
        _s3.put_object(Bucket=_BUCKET, Key=key, Body=f, ContentType=content_type)
    return key


def get_presigned_url(key: str, expires_in: int = 3600, filename: str | None = None) -> str:
    params: dict = {"Bucket": _BUCKET, "Key": key}
    if filename:
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
    return _s3.generate_presigned_url("get_object", Params=params, ExpiresIn=expires_in)


def delete_file(key: str) -> None:
    _s3.delete_object(Bucket=_BUCKET, Key=key)
