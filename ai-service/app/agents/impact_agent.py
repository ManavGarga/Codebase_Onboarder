from typing import Dict, Any, Optional
from openai import OpenAI
from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import ImpactAnalysisResult, KnowledgeGraphData, GraphDerivedFacts, LLMInterpretation
from app.graph.knowledge_graph import knowledge_graph_builder


class ImpactAnalysisAgent:
    """
    Computes blast radius, downstream dependents, and architectural risks
    for source-code modifications. Strictly separates deterministic Graph-Derived Facts
    from advisory LLM Interpretation. Never allows the LLM to invent dependencies.
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

    def analyze_impact(
        self,
        target_file: str,
        graph_data: KnowledgeGraphData,
        target_symbol: str = "",
        diff_snippet: str = "",
    ) -> ImpactAnalysisResult:
        # 1. Structural Graph Traversal (100% Deterministic AST Blast Radius)
        impact_data = knowledge_graph_builder.compute_downstream_impact(
            target_file=target_file,
            graph_data=graph_data,
            target_symbol=target_symbol,
        )

        affected_files = impact_data["affected_files"]
        affected_routes = impact_data["affected_routes"]
        affected_models = impact_data["affected_models"]
        risk_level = impact_data["risk_level"]
        score = impact_data["blast_radius_score"]
        raw_facts = impact_data.get("graph_derived_facts", {})

        graph_facts = GraphDerivedFacts(
            direct_dependents_count=raw_facts.get("direct_dependents_count", 0),
            indirect_dependents_count=raw_facts.get("indirect_dependents_count", 0),
            affected_apis_count=raw_facts.get("affected_apis_count", len(affected_routes)),
            affected_components_count=raw_facts.get("affected_components_count", 0),
            direct_dependents=raw_facts.get("direct_dependents", []),
            indirect_dependents=raw_facts.get("indirect_dependents", []),
            affected_routes=affected_routes,
            affected_components=raw_facts.get("affected_components", []),
            affected_models=affected_models,
            affected_files=affected_files,
            caller_chains=raw_facts.get("caller_chains", []),
            blast_tree_nodes=raw_facts.get("blast_tree_nodes", []),
            blast_tree_edges=raw_facts.get("blast_tree_edges", []),
            is_graph_derived=True,
        )

        # Static recommendation safeguards derived from AST facts
        recommendations = [
            f"Review downstream consumers across {graph_facts.direct_dependents_count} direct and {graph_facts.indirect_dependents_count} indirect dependent(s).",
            "Verify all contract interfaces and exported function signatures remain backward compatible.",
        ]
        if affected_routes:
            recommendations.append(f"Execute regression tests against {len(affected_routes)} affected API route(s).")
        if affected_models:
            recommendations.append(f"Check database migration safety for {len(affected_models)} related model(s).")

        summary = (
            f"Modifying '{target_file}' affects {graph_facts.direct_dependents_count} direct dependent(s), "
            f"{graph_facts.indirect_dependents_count} indirect dependent(s), {len(affected_routes)} API route(s), "
            f"and {len(affected_models)} database schema(s). Assigned risk level: {risk_level} (Blast score: {score}/100)."
        )

        ai_summary = summary
        ai_assessment = (
            f"Static code analysis identified {len(affected_files)} total downstream files impacted. "
            f"High coupling detected in callers: {', '.join([d['label'] for d in graph_facts.direct_dependents[:4]]) or 'None'}."
        )

        # 2. LLM Interpretation (Advisory Only - Never Allowed to Invent Dependencies)
        if settings.is_llm_configured:
            try:
                direct_names = [d["label"] for d in graph_facts.direct_dependents[:8]]
                indirect_names = [d["label"] for d in graph_facts.indirect_dependents[:8]]
                route_names = [r.get("path") for r in affected_routes[:6]]
                comp_names = [c["label"] for c in graph_facts.affected_components[:6]]

                prompt = f"""You are a principal software architect performing code change impact analysis.
STRICT BOUNDARY:
- Base your evaluation SOLELY on the deterministic Graph-Derived Facts provided below.
- NEVER invent, hallucinate, or assume dependencies or impacted files outside this list.

Graph-Derived Facts:
Target File: {target_file}
Target Symbol: {target_symbol or 'Whole File'}
Direct Dependents ({graph_facts.direct_dependents_count}): {direct_names}
Indirect Dependents ({graph_facts.indirect_dependents_count}): {indirect_names}
Affected API Endpoints ({len(affected_routes)}): {route_names}
Affected Components ({len(comp_names)}): {comp_names}
Affected Models ({len(affected_models)}): {[m.get('model_name') for m in affected_models[:5]]}

Code Diff / Context:
{diff_snippet[:1000] if diff_snippet else 'Refactoring or modifying core implementation'}

Provide:
1. Architectural Risk Assessment (2-3 sentences explaining architectural risk).
2. 3 Actionable Verification Safeguards."""

                resp = self.openai.chat.completions.create(
                    model=settings.active_chat_model,
                    messages=[
                        {"role": "system", "content": "You are a code change risk analyzer. Never invent dependencies."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                )
                ai_text = resp.choices[0].message.content or ""
                ai_assessment = ai_text
                summary += f"\n\n[LLM Architectural Advisory]:\n{ai_text}"
            except Exception as e:
                logger.error(f"Error calling LLM in ImpactAnalysisAgent: {e}")

        llm_interp = LLMInterpretation(
            summary=ai_summary,
            architectural_assessment=ai_assessment,
            recommendations=recommendations,
            risk_analysis=f"Deterministic risk rating '{risk_level}' with blast radius score of {score}/100 based on AST reachability.",
            is_ai_generated=settings.is_llm_configured,
            disclaimer=(
                "Architectural interpretation synthesized strictly from deterministic AST graph facts. "
                "The LLM is strictly prohibited from inventing or assuming dependencies."
            ),
        )

        return ImpactAnalysisResult(
            target=target_file if not target_symbol else f"{target_file}::{target_symbol}",
            target_type="symbol" if target_symbol else "file",
            risk_level=risk_level,
            blast_radius_score=score,
            summary=summary,
            affected_routes=affected_routes,
            affected_models=affected_models,
            affected_files=affected_files,
            caller_chain=[target_file] + affected_files[:5],
            recommendations=recommendations,
            graph_derived_facts=graph_facts,
            llm_interpretation=llm_interp,
        )


impact_agent = ImpactAnalysisAgent()
