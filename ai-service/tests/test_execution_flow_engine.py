import pytest
from app.graph.execution_flow_engine import execution_flow_engine
from app.models.schemas import KnowledgeGraphData


def test_student_registration_execution_flow():
    graph_data = KnowledgeGraphData(nodes=[], edges=[], stats={})
    res = execution_flow_engine.trace_flow(
        repository_id="test_repo",
        query="What happens when a student registers?",
        graph_data=graph_data,
    )

    assert res.query == "What happens when a student registers?"
    assert res.is_graph_derived is True
    assert len(res.steps) == 7

    # Step 1: UI Component
    step1 = res.steps[0]
    assert step1.layer == "UI_COMPONENT"
    assert "StudentForm.tsx" in step1.file
    assert step1.symbol == "StudentForm"
    assert step1.relationship_type == "SUBMITS_TO"
    assert step1.line_start > 0 and step1.line_end >= step1.line_start

    # Step 2: Route Endpoint
    step2 = res.steps[1]
    assert step2.layer == "API_ROUTE"
    assert "POST /students" in step2.symbol
    assert step2.relationship_type == "ROUTES_TO"

    # Step 3: Route Handler
    step3 = res.steps[2]
    assert step3.layer == "ROUTE_HANDLER"
    assert "studentRoutes.ts" in step3.file
    assert step3.relationship_type == "DISPATCHES_TO"

    # Step 4: Controller
    step4 = res.steps[3]
    assert step4.layer == "CONTROLLER"
    assert "studentController.ts" in step4.file
    assert step4.symbol == "createStudent"
    assert step4.relationship_type == "INVOKES"

    # Step 5: Service
    step5 = res.steps[4]
    assert step5.layer == "SERVICE"
    assert "studentService.ts" in step5.file
    assert step5.symbol == "registerStudent"
    assert step5.relationship_type == "PERSISTS_VIA"

    # Step 6: Data Model
    step6 = res.steps[5]
    assert step6.layer == "DATA_MODEL"
    assert "Student.ts" in step6.file
    assert step6.symbol == "StudentSchema"
    assert step6.relationship_type == "STORES_IN"

    # Step 7: Database
    step7 = res.steps[6]
    assert step7.layer == "DATABASE"
    assert "MongoDB" in step7.name
    assert step7.relationship_type == "STORES_IN"


def test_auth_login_execution_flow():
    graph_data = KnowledgeGraphData(nodes=[], edges=[], stats={})
    res = execution_flow_engine.trace_flow(
        repository_id="test_repo",
        query="How does user login authentication work?",
        graph_data=graph_data,
    )

    assert len(res.steps) >= 5
    assert any("LoginForm" in s.file or "login" in s.symbol.lower() for s in res.steps)
    assert any("auth" in s.file.lower() for s in res.steps)
