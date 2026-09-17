"""Real PydanticAI tool loop without paid requests; adversarial citations fail closed."""

import json

import pytest
from app.adapters.agent_pydantic import PydanticAIInvestigationEngine
from app.domain.agent import AgentAnswer, AgentRequest
from app.domain.errors import ProviderError
from test_agent_controls import project


def test_pydantic_ai_selects_tools_from_intermediate_results(services, admin, monkeypatch):
    pytest.importorskip("pydantic_ai")
    from pydantic_ai import models
    from pydantic_ai.messages import ModelResponse, ToolCallPart, ToolReturnPart
    from pydantic_ai.models.function import FunctionModel

    monkeypatch.setattr(models, "ALLOW_MODEL_REQUESTS", False)
    identity, _ = project(services, admin)
    calls = []

    def respond(messages, info):
        returns = [
            part
            for message in messages
            for part in message.parts
            if isinstance(part, ToolReturnPart)
        ]
        calls.append([part.tool_name for part in returns])
        if not returns:
            return ModelResponse(parts=[ToolCallPart("project_state", {})])
        state = next(p.content for p in returns if p.tool_name == "project_state")
        if state["work_packages"][0]["blocker_count"] and len(returns) == 1:
            return ModelResponse(parts=[ToolCallPart("persisted_evidence", {})])
        output = info.output_tools[0].name
        answer = {
            "summary": "The selected work package has a recorded staffing constraint.",
            "evidence_ids": [state["evidence"][-1]["id"]],
            "limitations": [],
        }
        return ModelResponse(parts=[ToolCallPart(output, json.dumps(answer))])

    engine = PydanticAIInvestigationEngine("function-fixture", model=FunctionModel(respond))
    monkeypatch.setattr(services.investigations, "engine", engine)
    try:
        run = services.agent.enqueue(identity, AgentRequest(instruction="Check only L02"), admin)
        with services.factory.open() as repo:
            report = repo.investigation_report(run.id)
            assert [t.tool for t in report.tools] == ["project_state", "persisted_evidence"]
        assert len(calls) == 3
    finally:
        engine.close()


def test_invented_evidence_prevents_publication(services, admin, monkeypatch):
    identity, _ = project(services, admin)

    def forged(instruction, scope, tools):
        tools.project_state()
        return AgentAnswer(summary="Unsupported fact", evidence_ids=("made-up",))

    monkeypatch.setattr(services.investigations.engine, "investigate", forged)
    with pytest.raises(ProviderError, match="citations"):
        services.agent.enqueue(identity, AgentRequest(instruction="Explain"), admin)
    with services.factory.open() as repo:
        run = repo.runs(identity)[0]
        assert run.status == "FAILED"
        assert not repo.proposals(run.id)
        assert repo.investigation_report(run.id) is None
