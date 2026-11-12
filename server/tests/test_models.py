"""The JSON Schema contract (generated from zod) and the pydantic mirror both accept the sample plan and reject the same errors."""
import copy
import json
from pathlib import Path

import pytest

from autoshort_server.models import Plan
from autoshort_server.store import validate_plan

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "sample" / "plan.json"
PLAN = json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_sample_validates_on_both_sides():
    assert validate_plan(PLAN) == []
    assert Plan.model_validate(PLAN).slug == "sample"


@pytest.mark.parametrize("mutate", [
    lambda p: p.pop("spans"),
    lambda p: p["spans"][0].update(keep="yes"),
    lambda p: p.update(schemaVersion=2),
    lambda p: p["words"][0].update(unknown=1),
    lambda p: p["words"][0].update(start="soon"),
])
def test_invalid_plans_are_rejected(mutate):
    bad = copy.deepcopy(PLAN)
    mutate(bad)
    assert validate_plan(bad)
