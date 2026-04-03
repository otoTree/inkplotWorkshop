from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from .schemas import PipelineRequest
except ImportError:
    from schemas import PipelineRequest


class FileSystemProjectManager:
    def __init__(self, workspace_root: str | Path | None = None) -> None:
        skill_root = Path(__file__).resolve().parent.parent
        self.workspace_root = (
            Path(workspace_root).resolve()
            if workspace_root is not None
            else skill_root / "workspace" / "projects"
        )

    def initialize_project(self, project_name: str, request: PipelineRequest) -> dict[str, Any]:
        project_slug = self._slugify(project_name or request.theme)
        project_dir = self.workspace_root / project_slug
        self._ensure_layout(project_dir)

        existing_manifest = self._read_json_if_exists(project_dir / "project.json") or {}
        now = self._now_iso()
        manifest = {
            "project_id": project_slug,
            "project_name": project_name,
            "theme": request.theme,
            "language": request.language,
            "episode_count": request.episode_count,
            "visual_style": request.visual_style,
            "motion_style": request.motion_style,
            "status": existing_manifest.get("status", "initialized"),
            "created_at": existing_manifest.get("created_at", now),
            "updated_at": now,
        }
        self._write_json(project_dir / "project.json", manifest)
        self._write_json(project_dir / "tasks.json", self._default_task_board())
        self._write_json(project_dir / "planning" / "pipeline_request.json", self._request_to_dict(request))
        self._write_json(project_dir / "episodes" / "index.json", {"project_id": project_slug, "items": []})
        self._write_json(project_dir / "shots" / "index.json", {"project_id": project_slug, "items": []})
        self._sync_workspace_index(manifest=manifest, project_dir=project_dir)
        return {
            "project_id": project_slug,
            "project_name": project_name,
            "project_dir": str(project_dir),
            "manifest": manifest,
        }

    def list_projects(self) -> list[dict[str, Any]]:
        if not self.workspace_root.exists():
            return []

        projects: list[dict[str, Any]] = []
        for project_dir in sorted(self.workspace_root.iterdir()):
            if not project_dir.is_dir():
                continue
            manifest = self._read_json_if_exists(project_dir / "project.json")
            if not isinstance(manifest, dict):
                continue
            projects.append(
                {
                    "project_id": manifest.get("project_id", project_dir.name),
                    "project_name": manifest.get("project_name", project_dir.name),
                    "status": manifest.get("status", "unknown"),
                    "project_dir": str(project_dir),
                    "updated_at": manifest.get("updated_at"),
                    "episode_count": manifest.get("episode_count"),
                }
            )
        return projects

    def get_workspace_index(self) -> dict[str, Any]:
        index_path = self.workspace_root / "index.json"
        data = self._read_json_if_exists(index_path)
        if isinstance(data, dict):
            return data
        return {"projects": []}

    def get_project_overview(self, project_id: str) -> dict[str, Any]:
        project_dir = self._project_dir(project_id)
        manifest = self._read_json_if_exists(project_dir / "project.json") or {}
        tasks = self._read_json_if_exists(project_dir / "tasks.json") or self._default_task_board()
        episodes = self._read_json_if_exists(project_dir / "episodes" / "index.json") or {"items": []}
        shots = self._read_json_if_exists(project_dir / "shots" / "index.json") or {"items": []}
        return {
            "manifest": manifest,
            "tasks": tasks,
            "episodes": episodes,
            "shots": shots,
            "project_dir": str(project_dir),
        }

    def save_story_plan(
        self,
        project_id: str,
        request: PipelineRequest,
        blueprint: dict[str, Any],
        story_prompt: str,
    ) -> dict[str, str]:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        self._write_json(project_dir / "planning" / "blueprint.json", blueprint)
        self._write_json(project_dir / "outputs" / "llm" / "story_blueprint.json", blueprint)
        self._write_text(project_dir / "prompts" / "story_blueprint_prompt.md", story_prompt)
        self._write_text(
            project_dir / "planning" / "overview.md",
            self._render_story_plan_markdown(project_id=project_id, request=request, blueprint=blueprint),
        )
        self._materialize_episodes_from_blueprint(project_dir=project_dir, blueprint=blueprint)
        self._sync_project_tasks_from_blueprint(project_dir=project_dir, blueprint=blueprint)
        self._update_manifest(project_dir, status="planned")
        return {
            "blueprint_json": str(project_dir / "planning" / "blueprint.json"),
            "overview_md": str(project_dir / "planning" / "overview.md"),
            "story_prompt_md": str(project_dir / "prompts" / "story_blueprint_prompt.md"),
        }

    def save_image_result(
        self,
        project_id: str,
        prompt: str,
        result: dict[str, Any],
    ) -> dict[str, str]:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        self._write_text(project_dir / "prompts" / "image_prompt.md", prompt)
        self._write_json(project_dir / "outputs" / "image" / "latest.json", result)
        self._update_manifest(project_dir, status="image_generated")
        return {
            "image_prompt_md": str(project_dir / "prompts" / "image_prompt.md"),
            "image_output_json": str(project_dir / "outputs" / "image" / "latest.json"),
        }

    def save_video_result(
        self,
        project_id: str,
        prompt: str,
        result: dict[str, Any],
    ) -> dict[str, str]:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        self._write_text(project_dir / "prompts" / "video_prompt.md", prompt)
        self._write_json(project_dir / "outputs" / "video" / "latest.json", result)
        self._update_manifest(project_dir, status="video_generated")
        return {
            "video_prompt_md": str(project_dir / "prompts" / "video_prompt.md"),
            "video_output_json": str(project_dir / "outputs" / "video" / "latest.json"),
        }

    def save_pipeline_result(
        self,
        project_id: str,
        result: dict[str, Any],
    ) -> str:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        output_path = project_dir / "runs" / f"pipeline_{self._now_file_stamp()}.json"
        self._write_json(output_path, result)
        self._update_manifest(project_dir, status="pipeline_ran")
        return str(output_path)

    def create_episode(
        self,
        project_id: str,
        episode_number: int,
        title: str,
        summary: str = "",
    ) -> dict[str, Any]:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        episode_id = f"ep{episode_number:02d}"
        episode_dir = project_dir / "episodes" / episode_id
        episode_dir.mkdir(parents=True, exist_ok=True)
        episode_payload = {
            "episode_id": episode_id,
            "episode_number": episode_number,
            "title": title or f"Episode {episode_number}",
            "summary": summary,
            "status": "planned",
            "updated_at": self._now_iso(),
        }
        self._write_json(episode_dir / "episode.json", episode_payload)
        self._write_text(
            episode_dir / "outline.md",
            "\n".join(
                [
                    f"# 第{episode_number}集 {episode_payload['title']}",
                    "",
                    summary or "待补充分集简介",
                ]
            ),
        )
        index = self._read_json_if_exists(project_dir / "episodes" / "index.json") or {"project_id": project_id, "items": []}
        index["items"] = self._upsert_by_key(index.get("items", []), "episode_id", episode_payload)
        self._write_json(project_dir / "episodes" / "index.json", index)
        self._update_manifest(project_dir, status="episodes_planned")
        return {
            "episode": episode_payload,
            "episode_dir": str(episode_dir),
        }

    def create_shot(
        self,
        project_id: str,
        episode_number: int,
        shot_number: int,
        description: str,
    ) -> dict[str, Any]:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        episode_id = f"ep{episode_number:02d}"
        shot_id = f"{episode_id}-shot{shot_number:03d}"
        shot_dir = project_dir / "shots" / shot_id
        shot_dir.mkdir(parents=True, exist_ok=True)
        shot_payload = {
            "shot_id": shot_id,
            "episode_id": episode_id,
            "episode_number": episode_number,
            "shot_number": shot_number,
            "description": description,
            "status": "planned",
            "updated_at": self._now_iso(),
        }
        self._write_json(shot_dir / "shot.json", shot_payload)
        self._write_text(
            shot_dir / "brief.md",
            "\n".join(
                [
                    f"# {shot_id}",
                    "",
                    description or "待补充分镜描述",
                ]
            ),
        )
        index = self._read_json_if_exists(project_dir / "shots" / "index.json") or {"project_id": project_id, "items": []}
        index["items"] = self._upsert_by_key(index.get("items", []), "shot_id", shot_payload)
        self._write_json(project_dir / "shots" / "index.json", index)
        self._update_manifest(project_dir, status="shots_planned")
        return {
            "shot": shot_payload,
            "shot_dir": str(shot_dir),
        }

    def add_task(
        self,
        project_id: str,
        title: str,
        category: str = "general",
        status: str = "todo",
        linked_episode: str = "",
        linked_shot: str = "",
    ) -> dict[str, Any]:
        project_dir = self._project_dir(project_id)
        self._ensure_layout(project_dir)
        board = self._read_json_if_exists(project_dir / "tasks.json") or self._default_task_board()
        task_id = self._build_task_id(board)
        task = {
            "task_id": task_id,
            "title": title,
            "category": category,
            "status": status,
            "linked_episode": linked_episode,
            "linked_shot": linked_shot,
            "updated_at": self._now_iso(),
        }
        board["items"].append(task)
        board["updated_at"] = self._now_iso()
        self._write_json(project_dir / "tasks.json", board)
        return {
            "task": task,
            "task_board": str(project_dir / "tasks.json"),
        }

    def _project_dir(self, project_id: str) -> Path:
        return self.workspace_root / project_id

    def _ensure_layout(self, project_dir: Path) -> None:
        directories = [
            project_dir,
            project_dir / "planning",
            project_dir / "prompts",
            project_dir / "outputs",
            project_dir / "outputs" / "llm",
            project_dir / "outputs" / "image",
            project_dir / "outputs" / "video",
            project_dir / "assets",
            project_dir / "assets" / "references",
            project_dir / "assets" / "generated-images",
            project_dir / "assets" / "generated-videos",
            project_dir / "episodes",
            project_dir / "shots",
            project_dir / "runs",
        ]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)

    def _request_to_dict(self, request: PipelineRequest) -> dict[str, Any]:
        return {
            "theme": request.theme,
            "language": request.language,
            "episode_count": request.episode_count,
            "shot_description": request.shot_description,
            "visual_style": request.visual_style,
            "motion_style": request.motion_style,
            "references": [
                {
                    "name": reference.name,
                    "kind": reference.kind,
                    "image_url": reference.image_url,
                }
                for reference in request.references
            ],
        }

    def _render_story_plan_markdown(
        self,
        project_id: str,
        request: PipelineRequest,
        blueprint: dict[str, Any],
    ) -> str:
        outline_items = blueprint.get("episode_outline")
        outline_lines: list[str] = []
        if isinstance(outline_items, list):
            for index, item in enumerate(outline_items, start=1):
                if isinstance(item, dict):
                    title = str(item.get("title", f"Episode {index}")).strip()
                    summary = str(item.get("summary", "")).strip()
                    outline_lines.append(f"- 第{index}集：{title} {summary}".strip())
                elif isinstance(item, str):
                    outline_lines.append(f"- 第{index}集：{item.strip()}")

        sections = [
            f"# {blueprint.get('project_title') or project_id}",
            "",
            "## 项目概览",
            f"- 主题：{request.theme}",
            f"- 语言：{request.language}",
            f"- 集数：{request.episode_count}",
            f"- 视觉风格：{request.visual_style}",
            f"- 运动风格：{request.motion_style}",
            "",
            "## 核心设定",
            f"- Logline：{blueprint.get('logline', '')}",
            f"- 世界观：{blueprint.get('world_view', '')}",
            f"- 主角：{blueprint.get('protagonist', '')}",
            f"- 核心冲突：{blueprint.get('core_conflict', '')}",
            "",
            "## 分集规划",
        ]
        if outline_lines:
            sections.extend(outline_lines)
        else:
            sections.append("- 暂无分集规划内容")
        return "\n".join(sections).strip() + "\n"

    def _update_manifest(self, project_dir: Path, status: str) -> None:
        manifest = self._read_json_if_exists(project_dir / "project.json") or {}
        manifest["status"] = status
        manifest["updated_at"] = self._now_iso()
        self._write_json(project_dir / "project.json", manifest)
        self._sync_workspace_index(manifest=manifest, project_dir=project_dir)

    def _sync_workspace_index(self, manifest: dict[str, Any], project_dir: Path) -> None:
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        index_path = self.workspace_root / "index.json"
        index = self._read_json_if_exists(index_path) or {"projects": []}
        project_record = {
            "project_id": manifest.get("project_id", project_dir.name),
            "project_name": manifest.get("project_name", project_dir.name),
            "status": manifest.get("status", "unknown"),
            "project_dir": str(project_dir),
            "theme": manifest.get("theme", ""),
            "language": manifest.get("language", "zh"),
            "episode_count": manifest.get("episode_count", 0),
            "updated_at": manifest.get("updated_at"),
        }
        index["projects"] = self._upsert_by_key(index.get("projects", []), "project_id", project_record)
        index["updated_at"] = self._now_iso()
        self._write_json(index_path, index)

    def _materialize_episodes_from_blueprint(self, project_dir: Path, blueprint: dict[str, Any]) -> None:
        outline_items = blueprint.get("episode_outline")
        if not isinstance(outline_items, list):
            return
        project_id = project_dir.name
        for index, item in enumerate(outline_items, start=1):
            if isinstance(item, dict):
                title = str(item.get("title", f"Episode {index}")).strip()
                summary = str(item.get("summary", "")).strip()
            else:
                title = f"Episode {index}"
                summary = str(item).strip() if isinstance(item, str) else ""
            self.create_episode(
                project_id=project_id,
                episode_number=index,
                title=title,
                summary=summary,
            )

    def _sync_project_tasks_from_blueprint(self, project_dir: Path, blueprint: dict[str, Any]) -> None:
        tasks_path = project_dir / "tasks.json"
        board = self._read_json_if_exists(tasks_path) or self._default_task_board()
        planned_defaults = [
            {
                "task_id": "task-001",
                "title": "完成项目蓝图审核",
                "category": "planning",
                "status": "todo",
                "linked_episode": "",
                "linked_shot": "",
                "updated_at": self._now_iso(),
            },
            {
                "task_id": "task-002",
                "title": "为每集补充详细大纲",
                "category": "episode",
                "status": "todo",
                "linked_episode": "",
                "linked_shot": "",
                "updated_at": self._now_iso(),
            },
            {
                "task_id": "task-003",
                "title": "规划关键分镜并准备参考图",
                "category": "shot",
                "status": "todo",
                "linked_episode": "",
                "linked_shot": "",
                "updated_at": self._now_iso(),
            },
        ]
        if blueprint.get("logline"):
            board["summary"] = str(blueprint.get("logline"))
        existing_ids = {item.get("task_id") for item in board.get("items", []) if isinstance(item, dict)}
        for item in planned_defaults:
            if item["task_id"] not in existing_ids:
                board["items"].append(item)
        board["updated_at"] = self._now_iso()
        self._write_json(tasks_path, board)

    def _read_json_if_exists(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _write_json(self, path: Path, data: dict[str, Any]) -> None:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _write_text(self, path: Path, content: str) -> None:
        path.write_text(content.rstrip() + "\n", encoding="utf-8")

    def _upsert_by_key(
        self,
        items: list[dict[str, Any]] | Any,
        key: str,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        inserted = False
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and item.get(key) == payload.get(key):
                    result.append(payload)
                    inserted = True
                elif isinstance(item, dict):
                    result.append(item)
        if not inserted:
            result.append(payload)
        return result

    def _default_task_board(self) -> dict[str, Any]:
        return {
            "summary": "",
            "items": [],
            "updated_at": self._now_iso(),
        }

    def _build_task_id(self, board: dict[str, Any]) -> str:
        max_index = 0
        for item in board.get("items", []):
            if not isinstance(item, dict):
                continue
            raw_id = item.get("task_id")
            if not isinstance(raw_id, str):
                continue
            match = re.match(r"task-(\d+)$", raw_id)
            if match:
                max_index = max(max_index, int(match.group(1)))
        return f"task-{max_index + 1:03d}"

    def _slugify(self, value: str) -> str:
        normalized = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", value.strip().lower())
        normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
        return normalized or "project"

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    def _now_file_stamp(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
