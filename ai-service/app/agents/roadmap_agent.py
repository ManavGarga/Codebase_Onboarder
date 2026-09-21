from typing import List, Dict, Any, Optional
import json
from openai import OpenAI
from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import OnboardingRoadmap, RoadmapMilestone, RouteDefinition, DatabaseModelDefinition


class RoadmapGenerator:
    """
    Generates a developer onboarding roadmap based on AST structure,
    entrypoints, routes, models, and detected tech stack.
    """

    def __init__(self):
        self._openai_client: Optional[OpenAI] = None

    @property
    def openai(self) -> OpenAI:
        if self._openai_client is None:
            self._openai_client = OpenAI(
                api_key=settings.active_api_key or "dummy_key",
                base_url=settings.active_base_url,
            )
        return self._openai_client

    def generate_roadmap(
        self,
        repository_id: str,
        repo_name: str,
        files: List[str],
        routes: List[RouteDefinition],
        models: List[DatabaseModelDefinition],
        frameworks: List[str],
    ) -> OnboardingRoadmap:
        # Determine key files (entrypoints, routers, configs)
        key_entrypoints = [
            f for f in files
            if any(e in f.lower() for e in ("main.", "index.", "app.", "server.", "router", "config", "manage.py"))
        ][:15]

        reading_order = [
            f for f in files
            if any(k in f.lower() for e in ("readme", "package.json", "requirements", "docker", "env") for k in (e,))
        ] + key_entrypoints

        # Format routes & models for prompt
        route_snippets = [f"{r.http_method} {r.path} in {r.file_path}" for r in routes[:10]]
        model_snippets = [f"Model {m.model_name} in {m.file_path}" for m in models[:10]]

        prompt = f"""You are a staff engineer creating an onboarding curriculum for a new developer joining the project '{repo_name}'.
Tech Stack Detected: {', '.join(frameworks) if frameworks else 'Standard Polyglot'}
Key Files: {', '.join(key_entrypoints)}
API Endpoints: {', '.join(route_snippets)}
Database Models: {', '.join(model_snippets)}

Return a structured JSON onboarding plan with 4 phases:
1. Day 1: Local Setup, Architecture & Entrypoints
2. Week 1: Core Domain Logic & Data Flow
3. Week 2: Writing & Testing Your First Feature / Bugfix
4. Month 1: Advanced Architecture & Production Readiness

Output ONLY valid JSON matching this schema:
{{
  "summary": "High-level summary of the codebase and its purpose",
  "milestones": [
    {{
      "phase": "Day 1: Setup & Architecture",
      "title": "...",
      "description": "...",
      "key_files": ["file1", "file2"],
      "prerequisites": ["Docker", "Node 20"],
      "action_items": ["Run npm install", "Start containers"],
      "suggested_starter_tasks": ["Add a log statement to the entrypoint"]
    }}
  ]
}}"""

        milestones: List[RoadmapMilestone] = []
        summary = f"Developer onboarding roadmap for {repo_name}."

        if not settings.is_llm_configured:
            milestones = self._get_default_milestones(key_entrypoints, files, routes, models)
        else:
            try:
                resp = self.openai.chat.completions.create(
                    model=settings.active_chat_model,
                    messages=[
                        {"role": "system", "content": "You are a technical onboarding architect. Respond with strictly valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                )
                data = json.loads(resp.choices[0].message.content or "{}")
                summary = data.get("summary", summary)
                for item in data.get("milestones", []):
                    milestones.append(RoadmapMilestone(**item))
            except Exception as e:
                logger.error(f"Error generating LLM roadmap: {e}")

            # Fall back to deterministic milestones if LLM returned empty or errored
            if not milestones:
                milestones = self._get_default_milestones(key_entrypoints, files, routes, models)

        return OnboardingRoadmap(
            repository_id=repository_id,
            repository_name=repo_name,
            summary=summary,
            tech_stack=frameworks,
            milestones=milestones,
            reading_order=reading_order[:12],
        )

    def _get_default_milestones(
        self,
        key_entrypoints: List[str],
        files: List[str],
        routes: List[RouteDefinition],
        models: List[DatabaseModelDefinition],
    ) -> List[RoadmapMilestone]:
        return [
            RoadmapMilestone(
                phase="Day 1: Local Setup & Architecture",
                title="Initialize Development Environment & Understand Entrypoints",
                description="Set up your local tooling, verify environment configs, and trace the initial server bootstrap process.",
                key_files=key_entrypoints[:4] or ["README.md"],
                prerequisites=["Docker", "Git", "Runtime environment"],
                action_items=[
                    "Clone the repo and configure your local .env file",
                    "Run the service containers using docker-compose",
                    "Locate the server bootstrap file and trace dependency injection",
                ],
                suggested_starter_tasks=[
                    "Add a health-check endpoint or log message in the server entrypoint",
                    "Run the existing test suite locally",
                ],
            ),
            RoadmapMilestone(
                phase="Week 1: Core Domain Logic & Data Flow",
                title="Trace Request Lifecycles and Database Interactions",
                description="Understand how incoming HTTP requests are validated, processed through controllers, and persisted in database schemas.",
                key_files=[r.file_path for r in routes[:3]] + [m.file_path for m in models[:3]],
                prerequisites=["REST API conventions", "ORM fundamentals"],
                action_items=[
                    "Trace an end-to-end request from routing layer to database persistence",
                    "Review data validation schemas and error handling middleware",
                    "Inspect database indices and query patterns",
                ],
                suggested_starter_tasks=[
                    "Write an integration test covering an existing critical API route",
                ],
            ),
            RoadmapMilestone(
                phase="Week 2: First Contribution",
                title="Implement a New Endpoint or Optimization",
                description="Contribute code to the repository following the established modular patterns, tests, and documentation standards.",
                key_files=key_entrypoints[:6],
                prerequisites=["Unit testing", "Git branching"],
                action_items=[
                    "Pick a 'good first issue' or refactoring ticket",
                    "Create a feature branch and implement changes",
                    "Ensure all tests pass and coverage is maintained",
                ],
                suggested_starter_tasks=[
                    "Add input validation to a route lacking explicit boundary checks",
                ],
            ),
            RoadmapMilestone(
                phase="Month 1: Production Mastery",
                title="Performance, Observability & Deployment",
                description="Deep dive into scaling bottlenecks, caching layers, background queue processing, and CI/CD pipelines.",
                key_files=["docker-compose.yml", ".github/workflows/ci.yml"] if "docker-compose.yml" in files else key_entrypoints,
                prerequisites=["CI/CD", "Redis / Background queues", "Metrics"],
                action_items=[
                    "Inspect background job retry and failure logic",
                    "Review logging and distributed tracing hooks",
                    "Analyze CI pipeline build times and cache efficiency",
                ],
                suggested_starter_tasks=[
                    "Optimize Docker image layer caching or improve CI workflow concurrency",
                ],
            ),
        ]


roadmap_generator = RoadmapGenerator()
