from __future__ import annotations

from typing import Any

try:
    from .image import ImageModule
    from .llm import LLMModule
    from .project_manager import FileSystemProjectManager
    from .prompts import PromptFactory
    from .schemas import ImageRequest, LLMRequest, PipelineRequest, VideoRequest
    from .video import VideoModule
except ImportError:
    from image import ImageModule
    from llm import LLMModule
    from project_manager import FileSystemProjectManager
    from prompts import PromptFactory
    from schemas import ImageRequest, LLMRequest, PipelineRequest, VideoRequest
    from video import VideoModule


class StoryPlanningWorkflow:
    def __init__(
        self,
        llm: LLMModule,
        prompt_factory: PromptFactory,
        project_manager: FileSystemProjectManager,
    ) -> None:
        self.llm = llm
        self.prompt_factory = prompt_factory
        self.project_manager = project_manager

    def run(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        story_prompt = self.prompt_factory.build_story_blueprint_prompt(
            theme=request.theme,
            episode_count=request.episode_count,
            language=request.language,
        )
        llm_request = LLMRequest(
            messages=self.prompt_factory.build_story_messages(
                theme=request.theme,
                episode_count=request.episode_count,
                language=request.language,
            ),
            extra_payload={"response_format": {"type": "json_object"}},
        )
        blueprint = self.llm.complete_json(llm_request)
        if not project_name:
            return blueprint

        project = self.project_manager.initialize_project(project_name=project_name, request=request)
        prompt_text = "\n\n".join(
            [
                self.prompt_factory.build_system_prompt(request.language),
                story_prompt,
            ]
        )
        saved_paths = self.project_manager.save_story_plan(
            project_id=project["project_id"],
            request=request,
            blueprint=blueprint,
            story_prompt=prompt_text,
        )
        return {
            "project": project,
            "blueprint": blueprint,
            "saved_paths": saved_paths,
        }


class ImageGenerationWorkflow:
    def __init__(
        self,
        image: ImageModule,
        prompt_factory: PromptFactory,
        project_manager: FileSystemProjectManager,
    ) -> None:
        self.image = image
        self.prompt_factory = prompt_factory
        self.project_manager = project_manager

    def run(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        image_request = ImageRequest(
            prompt=self.prompt_factory.build_image_prompt(
                shot_description=request.shot_description or request.theme,
                visual_style=request.visual_style,
                references=request.references,
            ),
        )
        result = {
            "prompt": image_request.prompt,
            "images": self.image.generate_urls(image_request),
        }
        if not project_name:
            return result

        project = self.project_manager.initialize_project(project_name=project_name, request=request)
        saved_paths = self.project_manager.save_image_result(
            project_id=project["project_id"],
            prompt=image_request.prompt,
            result=result,
        )
        return {
            "project": project,
            "result": result,
            "saved_paths": saved_paths,
        }


class VideoGenerationWorkflow:
    def __init__(
        self,
        video: VideoModule,
        prompt_factory: PromptFactory,
        project_manager: FileSystemProjectManager,
    ) -> None:
        self.video = video
        self.prompt_factory = prompt_factory
        self.project_manager = project_manager

    def run(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
        extra_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        video_request = VideoRequest(
            prompt=self.prompt_factory.build_video_prompt(
                shot_description=request.shot_description or request.theme,
                visual_style=request.visual_style,
                motion_style=request.motion_style,
                references=request.references,
            ),
            extra_payload=extra_payload or {},
        )
        response = self.video.generate(video_request)
        result = {
            "prompt": video_request.prompt,
            "task_id": self.extract_task_id(response),
            "raw": response,
        }
        if not project_name:
            return result

        project = self.project_manager.initialize_project(project_name=project_name, request=request)
        saved_paths = self.project_manager.save_video_result(
            project_id=project["project_id"],
            prompt=video_request.prompt,
            result=result,
        )
        return {
            "project": project,
            "result": result,
            "saved_paths": saved_paths,
        }

    def extract_task_id(self, response: dict[str, Any]) -> str | None:
        candidates = [
            response.get("task_id"),
            response.get("id"),
            response.get("data", {}).get("task_id") if isinstance(response.get("data"), dict) else None,
            response.get("data", {}).get("id") if isinstance(response.get("data"), dict) else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None


class FullPipelineWorkflow:
    def __init__(
        self,
        story_workflow: StoryPlanningWorkflow,
        image_workflow: ImageGenerationWorkflow,
        video_workflow: VideoGenerationWorkflow,
        project_manager: FileSystemProjectManager,
    ) -> None:
        self.story_workflow = story_workflow
        self.image_workflow = image_workflow
        self.video_workflow = video_workflow
        self.project_manager = project_manager

    def run(
        self,
        request: PipelineRequest,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        blueprint_result = self.story_workflow.run(request=request, project_name=project_name)
        blueprint = blueprint_result["blueprint"] if project_name else blueprint_result
        shot_description = request.shot_description or blueprint.get("logline") or request.theme

        image_request = PipelineRequest(
            theme=request.theme,
            language=request.language,
            episode_count=request.episode_count,
            shot_description=shot_description,
            visual_style=request.visual_style,
            motion_style=request.motion_style,
            references=request.references,
        )
        image_generation_result = self.image_workflow.run(
            request=image_request,
            project_name=project_name,
        )
        image_result = image_generation_result["result"] if project_name else image_generation_result

        video_request = PipelineRequest(
            theme=request.theme,
            language=request.language,
            episode_count=request.episode_count,
            shot_description=shot_description,
            visual_style=request.visual_style,
            motion_style=request.motion_style,
            references=request.references,
        )
        video_result = self.video_workflow.run(
            request=video_request,
            project_name=None,
            extra_payload={
                "aspect_ratio": "9:16",
                "image_url": image_result["images"][0] if image_result["images"] else None,
            },
        )
        result = {
            "blueprint": blueprint,
            "image": image_result,
            "video": video_result,
        }
        if not project_name:
            return result

        project = self.project_manager.initialize_project(project_name=project_name, request=request)
        video_saved_paths = self.project_manager.save_video_result(
            project_id=project["project_id"],
            prompt=video_result["prompt"],
            result=video_result,
        )
        run_output_path = self.project_manager.save_pipeline_result(
            project_id=project["project_id"],
            result=result,
        )
        return {
            "project": project,
            "result": result,
            "saved_paths": {
                "story": blueprint_result["saved_paths"],
                "image": image_generation_result["saved_paths"],
                "video": video_saved_paths,
                "pipeline_run": run_output_path,
            },
        }
