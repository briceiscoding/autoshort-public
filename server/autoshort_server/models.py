"""Pydantic mirror of the plan contract (app/src/model/plan.ts -> schema/plan.schema.json).

The JSON Schema generated from zod is the contract; these models validate the same documents on the
Python side and give typed access to jobs. tests/test_models.py checks both accept the sample plan.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = 1


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Word(Strict):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    score: Optional[float] = Field(default=None, ge=0, le=1)
    original: Optional[str] = None
    blockStart: Optional[bool] = None
    highlight: Optional[bool] = None


class Span(Strict):
    id: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    keep: bool
    zoom: bool = False
    zoomSfx: Optional[bool] = None
    reason: Optional[Literal["silence", "hesitation", "repetition", "false-start", "outside", "manual"]] = None
    note: Optional[str] = None


class Asset(Strict):
    id: str
    file: str
    kind: Literal["image", "video", "audio"]
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    hasAlpha: Optional[bool] = None
    alphaBox: Optional[tuple[float, float, float, float]] = None


class Timed(Strict):
    id: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    trigger: Optional[str] = None


class Concept(Timed):
    text: str = Field(min_length=1)
    # Text style of this concept only (partial, checked by schema/plan.schema.json).
    style: Optional[dict] = None


class Logo(Timed):
    asset: str
    size: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None
    process: Optional[Literal["luma_key", "rembg"]] = None
    sfx: Optional[bool] = None
    enter: Optional[Literal["pop", "top", "bottom", "left", "right"]] = None
    shake: Optional[float] = None


class CutIn(Timed):
    asset: str
    mode: Literal["full", "screen", "bg"]
    trim: Optional[float] = None
    zoom: Optional[float] = None
    dim: Optional[float] = Field(default=None, ge=0, le=1)
    shake: Optional[float] = None
    enter: Optional[Literal["pop", "top", "bottom", "left", "right"]] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    sfx: Optional[bool] = None
    # Frame style of this picture only (partial, checked by schema/plan.schema.json).
    frame: Optional[dict] = None


class Gauge(Timed):
    asset: str
    box: tuple[float, float, float, float]
    label: str
    from_: float = Field(alias="from", ge=0, le=1)
    to: float = Field(ge=0, le=1)
    landing: float = Field(gt=0)
    sfx: Optional[bool] = None


class DiagramElement(Strict):
    id: str
    label: str
    icon: Optional[str] = None
    image: Optional[str] = None
    accent: Optional[bool] = None
    strike: Optional[bool] = None
    check: Optional[bool] = None
    kind: Optional[str] = None
    trigger: Optional[str] = None
    at: float = Field(ge=0)
    draw: float = Field(default=0.4, gt=0)


class Diagram(Timed):
    template: Literal["tree", "hub", "balance", "forbidden", "flow", "comparison", "custom"]
    component: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    elements: list[DiagramElement] = Field(max_length=8)
    sfx: Optional[bool] = None


class Sfx(Strict):
    id: str
    file: str
    at: float = Field(ge=0)
    duration: Optional[float] = None
    gain: Optional[float] = None
    reason: Optional[str] = None


class Music(Strict):
    asset: str
    underVoiceDb: float = 22


class Subscribe(Strict):
    start: float = Field(ge=0)
    trigger: Optional[str] = None
    scale: float
    x: float
    y: float
    keyColor: str


class Crop(Strict):
    x: float
    y: float
    width: float
    height: float


class Source(Strict):
    rush: str
    width: int
    height: int
    fps: float
    duration: float
    crop: Crop


class Output(Strict):
    fps: Optional[float] = None


class SfxRules(Strict):
    cutIn: Optional[str] = None
    logo: Optional[str] = None
    conceptTyping: Optional[str] = None
    diagramOpen: Optional[str] = None
    diagramElement: Optional[str] = None
    gauge: Optional[str] = None
    gaugeLanding: Optional[str] = None
    zoom: Optional[str] = None


class Plan(Strict):
    schemaVersion: Literal[1]
    slug: str
    title: Optional[str] = None
    source: Source
    output: Optional[Output] = None
    assets: list[Asset]
    words: list[Word]
    spans: list[Span] = Field(min_length=1)
    concepts: list[Concept]
    logos: list[Logo]
    cutIns: list[CutIn]
    gauges: list[Gauge]
    diagrams: list[Diagram]
    sfx: list[Sfx]
    music: Optional[Music]
    subscribe: Optional[Subscribe]
    sfxRules: Optional[SfxRules] = None
    hideCaptionsDuringConcepts: bool = True
    themeOverrides: Optional[dict] = None
    unplacedAssets: list[str] = []
    notes: Optional[str] = None
