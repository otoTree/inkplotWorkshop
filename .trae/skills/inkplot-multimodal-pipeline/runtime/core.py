from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib import error, request


class SkillRuntimeError(RuntimeError):
    pass


@dataclass(frozen=True)
class ServiceConfig:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: int = 300
    min_interval_ms: int = 0
    image_mode: str = "chat"


@dataclass(frozen=True)
class SkillRuntimeConfig:
    llm: ServiceConfig
    image: ServiceConfig
    video: ServiceConfig


_LAST_REQUEST_AT: dict[str, float] = {}


def _first_defined(*values: str | None, default: str = "") -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return default


def _to_int(value: str | None, default: int) -> int:
    if value is None or not value.strip():
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise SkillRuntimeError(f"Invalid integer value: {value}") from exc


def _normalize_base_url(value: str) -> str:
    return value.rstrip("/")


def _build_service_config(service: str) -> ServiceConfig:
    service_key = service.upper()

    base_url = _normalize_base_url(
        _first_defined(
            os.getenv(f"AI_{service_key}_API_BASE_URL"),
            os.getenv("AI_TEXT_API_BASE_URL") if service == "llm" else None,
            os.getenv("AI_API_BASE_URL"),
            os.getenv("OPENAI_BASE_URL"),
            default="https://api.openai.com/v1",
        )
    )
    api_key = _first_defined(
        os.getenv(f"AI_{service_key}_API_KEY"),
        os.getenv("AI_TEXT_API_KEY") if service == "llm" else None,
        os.getenv("AI_API_KEY"),
        os.getenv("OPENAI_API_KEY"),
    )
    model = _first_defined(
        os.getenv(f"AI_{service_key}_API_MODEL"),
        os.getenv("AI_TEXT_API_MODEL") if service == "llm" else None,
        os.getenv(f"OPENAI_{service_key}_MODEL"),
        os.getenv("AI_API_MODEL"),
        os.getenv("OPENAI_MODEL"),
        default="gpt-4o",
    )
    timeout_seconds = _to_int(
        _first_defined(
            os.getenv(f"AI_{service_key}_API_TIMEOUT"),
            os.getenv("AI_API_TIMEOUT"),
            os.getenv("OPENAI_TIMEOUT"),
            default="300",
        ),
        300,
    )
    min_interval_ms = _to_int(
        _first_defined(
            os.getenv(f"AI_{service_key}_API_MIN_INTERVAL_MS"),
            os.getenv("AI_API_MIN_INTERVAL_MS"),
            default="0",
        ),
        0,
    )
    image_mode = _first_defined(os.getenv("AI_IMAGE_API_MODE"), default="chat").lower()

    if not api_key:
        raise SkillRuntimeError(f"Missing API key for {service} service")

    return ServiceConfig(
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout_seconds=timeout_seconds,
        min_interval_ms=min_interval_ms,
        image_mode=image_mode,
    )


def load_runtime_config() -> SkillRuntimeConfig:
    return SkillRuntimeConfig(
        llm=_build_service_config("llm"),
        image=_build_service_config("image"),
        video=_build_service_config("video"),
    )


def _wait_for_interval(config: ServiceConfig) -> None:
    if config.min_interval_ms <= 0:
        return
    key = f"{config.base_url}|{config.model}|{config.api_key}"
    now = time.monotonic() * 1000
    last = _LAST_REQUEST_AT.get(key, 0)
    elapsed = now - last
    if elapsed < config.min_interval_ms:
        time.sleep((config.min_interval_ms - elapsed) / 1000)
    _LAST_REQUEST_AT[key] = time.monotonic() * 1000


def request_json(
    config: ServiceConfig,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _wait_for_interval(config)
    url = f"{config.base_url}{path}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        method=method.upper(),
        data=body,
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=config.timeout_seconds) as response:
            content = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise SkillRuntimeError(f"{service_label(path)} failed: [{exc.code}] {detail}") from exc
    except error.URLError as exc:
        raise SkillRuntimeError(f"{service_label(path)} failed: {exc.reason}") from exc

    if not content.strip():
        return {}
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise SkillRuntimeError(f"Invalid JSON response from {service_label(path)}") from exc


def service_label(path: str) -> str:
    normalized = path.strip("/")
    if normalized.startswith("chat/completions"):
        return "chat completion request"
    if normalized.startswith("images/generations"):
        return "image generation request"
    if normalized.startswith("video/generations"):
        return "video generation request"
    return normalized or "request"


def extract_message_text(result: dict[str, Any]) -> str:
    choices = result.get("choices")
    if not isinstance(choices, list) or not choices:
        raise SkillRuntimeError("Response does not contain choices")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise SkillRuntimeError("Response does not contain message")

    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                text_parts.append(item["text"])
        if text_parts:
            return "\n".join(text_parts)
    raise SkillRuntimeError("Response does not contain text content")


def extract_image_urls(result: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    data_items = result.get("data")
    if isinstance(data_items, list):
        for item in data_items:
            if not isinstance(item, dict):
                continue
            url = item.get("url")
            b64_json = item.get("b64_json")
            if isinstance(url, str) and url.strip():
                urls.append(url.strip())
            if isinstance(b64_json, str) and b64_json.strip():
                urls.append(f"data:image/png;base64,{b64_json.strip()}")

    if urls:
        return list(dict.fromkeys(urls))

    content = extract_message_text(result)
    tokens = content.replace("(", " ").replace(")", " ").replace(",", " ").split()
    for token in tokens:
        if token.startswith("http://") or token.startswith("https://") or token.startswith("data:image/"):
            urls.append(token)
    return list(dict.fromkeys(urls))


def extract_video_task_id(result: dict[str, Any]) -> str:
    candidates = [
        result.get("task_id"),
        result.get("id"),
        result.get("data", {}).get("task_id") if isinstance(result.get("data"), dict) else None,
        result.get("data", {}).get("id") if isinstance(result.get("data"), dict) else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    raise SkillRuntimeError("Video response does not contain task id")
