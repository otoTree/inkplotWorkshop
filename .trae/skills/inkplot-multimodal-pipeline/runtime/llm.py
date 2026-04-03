from __future__ import annotations

import json
from typing import Any

try:
    from .core import extract_message_text, load_runtime_config, request_json
    from .schemas import LLMRequest
except ImportError:
    from core import extract_message_text, load_runtime_config, request_json
    from schemas import LLMRequest


class LLMModule:
    def __init__(self) -> None:
        self.config = load_runtime_config().llm

    def complete(self, request: LLMRequest) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.config.model,
            "messages": [
                {
                    "role": message.role,
                    "content": message.content,
                }
                for message in request.messages
            ],
            "temperature": request.temperature,
        }
        if request.max_tokens is not None:
            payload["max_tokens"] = request.max_tokens
        payload.update(request.extra_payload)
        return request_json(self.config, "POST", "/chat/completions", payload)

    def complete_text(self, request: LLMRequest) -> str:
        return extract_message_text(self.complete(request))

    def complete_json(self, request: LLMRequest) -> dict[str, Any]:
        content = self.complete_text(request)
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start >= 0 and end > start:
                return json.loads(content[start : end + 1])
            raise
