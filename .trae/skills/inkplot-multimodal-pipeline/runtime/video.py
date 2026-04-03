from __future__ import annotations

import time
from typing import Any

try:
    from .core import extract_video_task_id, load_runtime_config, request_json
    from .schemas import VideoRequest
except ImportError:
    from core import extract_video_task_id, load_runtime_config, request_json
    from schemas import VideoRequest


class VideoModule:
    def __init__(self) -> None:
        self.config = load_runtime_config().video

    def generate(self, request: VideoRequest) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.config.model,
            "prompt": request.prompt,
            "duration": request.duration,
        }
        normalized_metadata = self._normalize_metadata(request.metadata, request.extra_payload)
        if normalized_metadata:
            payload["metadata"] = normalized_metadata
        for key, value in request.extra_payload.items():
            if key not in {"image_url", "aspect_ratio"}:
                payload[key] = value
        return request_json(self.config, "POST", "/video/generations", payload)

    def generate_task_id(self, request: VideoRequest) -> str:
        return extract_video_task_id(self.generate(request))

    def get_status(self, task_id: str) -> dict[str, Any]:
        return request_json(self.config, "GET", f"/video/generations/{task_id}")

    def wait_until_complete(
        self,
        task_id: str,
        poll_interval_seconds: int = 10,
        max_wait_seconds: int = 600,
    ) -> dict[str, Any]:
        start_at = time.time()
        while True:
            status_info = self.get_status(task_id)
            payload = status_info.get("data") if isinstance(status_info.get("data"), dict) else status_info
            status = str(payload.get("status", "")).lower()
            if status in {"completed", "succeeded", "success"}:
                return status_info
            if status in {"failed", "error"}:
                raise RuntimeError(f"Video generation failed: {status_info}")
            if time.time() - start_at > max_wait_seconds:
                raise TimeoutError(f"Video generation timeout: {task_id}")
            time.sleep(poll_interval_seconds)

    def _normalize_metadata(
        self,
        metadata: dict[str, Any],
        extra_payload: dict[str, Any],
    ) -> dict[str, Any]:
        merged = dict(metadata)
        image_urls: list[str] = []

        image_url = extra_payload.get("image_url")
        if isinstance(image_url, str) and image_url.strip():
            image_urls.append(image_url.strip())

        raw_images = merged.pop("images", None)
        if isinstance(raw_images, list):
            image_urls.extend(item.strip() for item in raw_images if isinstance(item, str) and item.strip())

        raw_image_list = merged.get("image_list")
        if isinstance(raw_image_list, list):
            for item in raw_image_list:
                if isinstance(item, dict):
                    candidate = item.get("image_url")
                    if isinstance(candidate, str) and candidate.strip():
                        image_urls.append(candidate.strip())

        if image_urls:
            merged["image_list"] = [{"image_url": url} for url in dict.fromkeys(image_urls)]

        aspect_ratio = extra_payload.get("aspect_ratio")
        if isinstance(aspect_ratio, str) and aspect_ratio.strip() and "aspect_ratio" not in merged:
            merged["aspect_ratio"] = aspect_ratio.strip()

        return merged
