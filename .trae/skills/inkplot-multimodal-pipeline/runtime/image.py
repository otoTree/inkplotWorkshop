from __future__ import annotations

from typing import Any

try:
    from .core import extract_image_urls, load_runtime_config, request_json
    from .schemas import ImageRequest
except ImportError:
    from core import extract_image_urls, load_runtime_config, request_json
    from schemas import ImageRequest


class ImageModule:
    def __init__(self) -> None:
        self.config = load_runtime_config().image

    def generate(self, request: ImageRequest) -> dict[str, Any]:
        if self.config.image_mode == "images":
            payload: dict[str, Any] = {
                "model": self.config.model,
                "prompt": request.prompt,
                "n": request.n,
                "size": request.size,
                "quality": request.quality,
            }
            payload.update(request.extra_payload)
            return request_json(self.config, "POST", "/images/generations", payload)

        prompt = request.prompt
        if request.aspect_ratio and request.aspect_ratio != "1:1":
            prompt = f"{prompt}\nAspect ratio: {request.aspect_ratio}"

        content: str | list[dict[str, Any]] = prompt
        if request.reference_image_url:
            content = [
                {"type": "image_url", "image_url": {"url": request.reference_image_url}},
                {"type": "text", "text": prompt},
            ]

        payload = {
            "model": self.config.model,
            "messages": [{"role": "user", "content": content}],
        }
        payload.update(request.extra_payload)
        return request_json(self.config, "POST", "/chat/completions", payload)

    def generate_urls(self, request: ImageRequest) -> list[str]:
        return extract_image_urls(self.generate(request))
