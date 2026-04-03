from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ChatMessage:
    role: str
    content: str | list[dict[str, Any]]


@dataclass(frozen=True)
class LLMRequest:
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int | None = None
    extra_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ImageRequest:
    prompt: str
    aspect_ratio: str = "1:1"
    n: int = 1
    size: str = "1024x1024"
    quality: str = "standard"
    reference_image_url: str | None = None
    extra_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VideoRequest:
    prompt: str
    duration: int = 5
    metadata: dict[str, Any] = field(default_factory=dict)
    extra_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AssetReference:
    name: str
    kind: str
    image_url: str | None = None


@dataclass(frozen=True)
class PipelineRequest:
    theme: str
    language: str = "zh"
    episode_count: int = 10
    shot_description: str = ""
    visual_style: str = "Eastern editorial minimalism"
    motion_style: str = "subtle cinematic motion"
    references: list[AssetReference] = field(default_factory=list)
