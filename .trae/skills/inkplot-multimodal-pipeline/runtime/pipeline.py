from __future__ import annotations

import argparse
import json
from typing import Any

try:
    from .image import ImageModule
    from .llm import LLMModule
    from .project_manager import FileSystemProjectManager
    from .prompts import PromptFactory
    from .schemas import PipelineRequest
    from .video import VideoModule
    from .workflows import (
        FullPipelineWorkflow,
        ImageGenerationWorkflow,
        StoryPlanningWorkflow,
        VideoGenerationWorkflow,
    )
except ImportError:
    from image import ImageModule
    from llm import LLMModule
    from project_manager import FileSystemProjectManager
    from prompts import PromptFactory
    from schemas import PipelineRequest
    from video import VideoModule
    from workflows import (
        FullPipelineWorkflow,
        ImageGenerationWorkflow,
        StoryPlanningWorkflow,
        VideoGenerationWorkflow,
    )


class InkplotPipeline:
    def __init__(self, workspace_root: str | None = None) -> None:
        self.prompt_factory = PromptFactory()
        self._llm: LLMModule | None = None
        self._image: ImageModule | None = None
        self._video: VideoModule | None = None
        self.project_manager = FileSystemProjectManager(workspace_root=workspace_root)
        self._story_workflow: StoryPlanningWorkflow | None = None
        self._image_workflow: ImageGenerationWorkflow | None = None
        self._video_workflow: VideoGenerationWorkflow | None = None
        self._full_pipeline_workflow: FullPipelineWorkflow | None = None

    @property
    def llm(self) -> LLMModule:
        if self._llm is None:
            self._llm = LLMModule()
        return self._llm

    @property
    def image(self) -> ImageModule:
        if self._image is None:
            self._image = ImageModule()
        return self._image

    @property
    def video(self) -> VideoModule:
        if self._video is None:
            self._video = VideoModule()
        return self._video

    @property
    def story_workflow(self) -> StoryPlanningWorkflow:
        if self._story_workflow is None:
            self._story_workflow = StoryPlanningWorkflow(
                llm=self.llm,
                prompt_factory=self.prompt_factory,
                project_manager=self.project_manager,
            )
        return self._story_workflow

    @property
    def image_workflow(self) -> ImageGenerationWorkflow:
        if self._image_workflow is None:
            self._image_workflow = ImageGenerationWorkflow(
                image=self.image,
                prompt_factory=self.prompt_factory,
                project_manager=self.project_manager,
            )
        return self._image_workflow

    @property
    def video_workflow(self) -> VideoGenerationWorkflow:
        if self._video_workflow is None:
            self._video_workflow = VideoGenerationWorkflow(
                video=self.video,
                prompt_factory=self.prompt_factory,
                project_manager=self.project_manager,
            )
        return self._video_workflow

    @property
    def full_pipeline_workflow(self) -> FullPipelineWorkflow:
        if self._full_pipeline_workflow is None:
            self._full_pipeline_workflow = FullPipelineWorkflow(
                story_workflow=self.story_workflow,
                image_workflow=self.image_workflow,
                video_workflow=self.video_workflow,
                project_manager=self.project_manager,
            )
        return self._full_pipeline_workflow

    def initialize_project(self, project_name: str, request: PipelineRequest) -> dict[str, Any]:
        return self.project_manager.initialize_project(project_name=project_name, request=request)

    def list_projects(self) -> list[dict[str, Any]]:
        return self.project_manager.list_projects()

    def get_workspace_index(self) -> dict[str, Any]:
        return self.project_manager.get_workspace_index()

    def get_project_overview(self, project_id: str) -> dict[str, Any]:
        return self.project_manager.get_project_overview(project_id)

    def create_episode(
        self,
        project_id: str,
        episode_number: int,
        title: str,
        summary: str = "",
    ) -> dict[str, Any]:
        return self.project_manager.create_episode(
            project_id=project_id,
            episode_number=episode_number,
            title=title,
            summary=summary,
        )

    def create_shot(
        self,
        project_id: str,
        episode_number: int,
        shot_number: int,
        description: str,
    ) -> dict[str, Any]:
        return self.project_manager.create_shot(
            project_id=project_id,
            episode_number=episode_number,
            shot_number=shot_number,
            description=description,
        )

    def add_task(
        self,
        project_id: str,
        title: str,
        category: str = "general",
        status: str = "todo",
        linked_episode: str = "",
        linked_shot: str = "",
    ) -> dict[str, Any]:
        return self.project_manager.add_task(
            project_id=project_id,
            title=title,
            category=category,
            status=status,
            linked_episode=linked_episode,
            linked_shot=linked_shot,
        )

    def run_story_blueprint(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        return self.story_workflow.run(request=request, project_name=project_name)

    def run_image_generation(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        return self.image_workflow.run(request=request, project_name=project_name)

    def run_video_generation(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        return self.video_workflow.run(request=request, project_name=project_name)

    def plan_project(self, project_name: str, request: PipelineRequest) -> dict[str, Any]:
        return self.run_story_blueprint(request=request, project_name=project_name)

    def run_fixed_pipeline(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        return self.full_pipeline_workflow.run(request=request, project_name=project_name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inkplot multimodal skill pipeline")
    parser.add_argument(
        "--mode",
        choices=[
            "init-project",
            "list-projects",
            "workspace-index",
            "show-project",
            "plan-project",
            "create-episode",
            "create-shot",
            "add-task",
            "llm",
            "image",
            "video",
            "pipeline",
        ],
        default="pipeline",
    )
    parser.add_argument("--theme", default="")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--episode-count", type=int, default=10)
    parser.add_argument("--shot-description", default="")
    parser.add_argument("--visual-style", default="Eastern editorial minimalism")
    parser.add_argument("--motion-style", default="subtle cinematic motion")
    parser.add_argument("--project-name", default="")
    parser.add_argument("--workspace-root", default="")
    parser.add_argument("--project-id", default="")
    parser.add_argument("--episode-number", type=int, default=0)
    parser.add_argument("--shot-number", type=int, default=0)
    parser.add_argument("--title", default="")
    parser.add_argument("--summary", default="")
    parser.add_argument("--description", default="")
    parser.add_argument("--category", default="general")
    parser.add_argument("--status", default="todo")
    parser.add_argument("--linked-episode", default="")
    parser.add_argument("--linked-shot", default="")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pipeline = InkplotPipeline(workspace_root=args.workspace_root or None)
    if args.mode == "list-projects":
        print(json.dumps(pipeline.list_projects(), ensure_ascii=False, indent=2))
        return
    if args.mode == "workspace-index":
        print(json.dumps(pipeline.get_workspace_index(), ensure_ascii=False, indent=2))
        return
    if args.mode == "show-project":
        if not args.project_id:
            raise SystemExit("--project-id is required for show-project")
        print(json.dumps(pipeline.get_project_overview(args.project_id), ensure_ascii=False, indent=2))
        return
    if args.mode == "create-episode":
        if not args.project_id:
            raise SystemExit("--project-id is required for create-episode")
        if args.episode_number <= 0:
            raise SystemExit("--episode-number must be greater than 0")
        print(
            json.dumps(
                pipeline.create_episode(
                    project_id=args.project_id,
                    episode_number=args.episode_number,
                    title=args.title or f"Episode {args.episode_number}",
                    summary=args.summary,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return
    if args.mode == "create-shot":
        if not args.project_id:
            raise SystemExit("--project-id is required for create-shot")
        if args.episode_number <= 0:
            raise SystemExit("--episode-number must be greater than 0")
        if args.shot_number <= 0:
            raise SystemExit("--shot-number must be greater than 0")
        print(
            json.dumps(
                pipeline.create_shot(
                    project_id=args.project_id,
                    episode_number=args.episode_number,
                    shot_number=args.shot_number,
                    description=args.description or args.summary or "待补充分镜描述",
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return
    if args.mode == "add-task":
        if not args.project_id:
            raise SystemExit("--project-id is required for add-task")
        if not args.title:
            raise SystemExit("--title is required for add-task")
        print(
            json.dumps(
                pipeline.add_task(
                    project_id=args.project_id,
                    title=args.title,
                    category=args.category,
                    status=args.status,
                    linked_episode=args.linked_episode,
                    linked_shot=args.linked_shot,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if not args.theme:
        raise SystemExit("--theme is required for the selected mode")

    request = PipelineRequest(
        theme=args.theme,
        language=args.language,
        episode_count=args.episode_count,
        shot_description=args.shot_description,
        visual_style=args.visual_style,
        motion_style=args.motion_style,
    )

    if args.mode == "init-project":
        if not args.project_name:
            raise SystemExit("--project-name is required for init-project")
        result = pipeline.initialize_project(project_name=args.project_name, request=request)
    elif args.mode == "plan-project":
        if not args.project_name:
            raise SystemExit("--project-name is required for plan-project")
        result = pipeline.plan_project(project_name=args.project_name, request=request)
    elif args.mode == "llm":
        result = pipeline.run_story_blueprint(request, project_name=args.project_name or None)
    elif args.mode == "image":
        result = pipeline.run_image_generation(request, project_name=args.project_name or None)
    elif args.mode == "video":
        result = pipeline.run_video_generation(request, project_name=args.project_name or None)
    else:
        result = pipeline.run_fixed_pipeline(request, project_name=args.project_name or None)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
