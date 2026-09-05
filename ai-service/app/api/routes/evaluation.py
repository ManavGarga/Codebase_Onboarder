import os
import json
from typing import Dict, Any
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.evaluation.runner import evaluation_runner
from app.core.logging import logger

router = APIRouter(prefix="/evaluation", tags=["Evaluation & Benchmarking"])

REPORTS_DIR = "/app/evaluation_reports"


@router.post("/run")
def run_evaluation_benchmark(background_tasks: BackgroundTasks):
    """
    Triggers the 55-question benchmark evaluation across 5 retrieval strategies.
    Runs asynchronously and saves reports to disk.
    """
    logger.info("Evaluation benchmark run requested.")
    # Run synchronously or in background
    try:
        results = evaluation_runner.run_evaluation(output_dir=REPORTS_DIR)
        return {
            "success": True,
            "message": "Evaluation completed successfully.",
            "meta": results["meta"],
            "summary_by_strategy": results["summary_by_strategy"],
        }
    except Exception as e:
        logger.error(f"Evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/json")
def get_evaluation_json():
    json_path = os.path.join(REPORTS_DIR, "evaluation_results.json")
    if not os.path.exists(json_path):
        raise HTTPException(status_code=404, detail="No evaluation results found. Run /run first.")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/report/markdown")
def get_evaluation_markdown():
    md_path = os.path.join(REPORTS_DIR, "evaluation_report.md")
    if not os.path.exists(md_path):
        raise HTTPException(status_code=404, detail="No evaluation report found. Run /run first.")
    with open(md_path, "r", encoding="utf-8") as f:
        return {"report_markdown": f.read()}
