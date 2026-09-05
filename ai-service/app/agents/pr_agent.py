import re
from typing import List, Optional
from openai import OpenAI
from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import PRAnalysisResult


class PRReviewAgent:
    """
    Analyzes GitHub Pull Requests / diffs against codebase architecture.
    Identifies breaking changes, impacted endpoints, and architectural risks.
    """

    def __init__(self):
        self._openai_client: Optional[OpenAI] = None

    @property
    def openai(self) -> OpenAI:
        if self._openai_client is None:
            self._openai_client = OpenAI(
                api_key=settings.OPENAI_API_KEY or "dummy_key",
                base_url=settings.OPENAI_BASE_URL,
            )
        return self._openai_client

    def analyze_pr_diff(self, pr_diff: str, pr_title: Optional[str] = None) -> PRAnalysisResult:
        # Extract modified file names from git diff
        file_matches = re.findall(r"(?:diff --git a/|--- a/|\+\+\+ b/)([^\s\n]+)", pr_diff)
        unique_files = list(set([f for f in file_matches if f != "/dev/null"]))

        # Detect breaking change hints (removed export, modified public signature, schema migration)
        breaking_changes = []
        if re.search(r"-\s*(export|public|def|function|class)", pr_diff):
            breaking_changes.append("Possible removal or modification of public/exported interface or symbol.")
        if re.search(r"(DROP TABLE|ALTER TABLE|removeColumn|changeColumn)", pr_diff, re.IGNORECASE):
            breaking_changes.append("Database schema migration modifying existing columns or tables.")

        impacted_endpoints = []
        for line in pr_diff.splitlines():
            if re.search(r"(\.get\(|\.post\(|\.put\(|\.delete\(|@app\.get|@router\.)", line):
                impacted_endpoints.append(line.strip()[:60])

        risk_level = "LOW"
        if breaking_changes or len(unique_files) > 10:
            risk_level = "HIGH" if len(breaking_changes) > 1 else "MEDIUM"

        summary = f"PR modifies {len(unique_files)} file(s) with {len(breaking_changes)} potential breaking change alert(s)."
        suggested_tests = [
            f"Run regression tests across modified files: {', '.join(unique_files[:4]) or 'modified modules'}",
            "Verify all external callers and client consumers of changed interfaces.",
        ]
        architectural_notes = [
            "Ensure adherence to project layering (e.g. router -> service -> repository).",
            "Verify that error handling catches boundary failures without crashing the server.",
        ]

        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "your_openai_api_key_here":
            try:
                prompt = f"""You are a principal engineer performing an architectural review of a Pull Request diff.
PR Title: {pr_title or 'Untitled PR'}
Modified Files: {', '.join(unique_files[:10])}
Diff excerpt:
{pr_diff[:2500]}

Provide:
1. Executive summary of what changed
2. Architectural risks or potential breaking changes
3. Specific test cases that must be executed"""

                resp = self.openai.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a senior code reviewer."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                )
                ai_text = resp.choices[0].message.content or ""
                summary = ai_text
            except Exception as e:
                logger.error(f"Error analyzing PR with LLM: {e}")

        return PRAnalysisResult(
            pr_title=pr_title or "Pull Request Analysis",
            summary=summary,
            risk_level=risk_level,
            breaking_changes=breaking_changes,
            impacted_endpoints=impacted_endpoints[:5],
            impacted_models=[],
            suggested_tests=suggested_tests,
            architectural_notes=architectural_notes,
        )


pr_agent = PRReviewAgent()
