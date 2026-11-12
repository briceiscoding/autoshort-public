"""First plan heuristics: piece merging, repetitions, silence and hesitation cuts, caption blocks."""
from initial_plan import auto_blocks, build_spans, cut_choice, find_repetitions, merge_pieces


def w(text, start, end):
    return {"text": text, "start": start, "end": end}


def test_merge_pieces():
    raw = [{"word": "c", "start": 0, "end": 0.1}, {"word": "'est", "start": 0.1, "end": 0.2},
           {"word": "Suivez", "start": 0.3, "end": 0.5}, {"word": "-moi", "start": 0.5, "end": 0.6},
           {"word": "recoil", "start": 0.7, "end": 0.9}, {"word": "?", "start": 0.9, "end": 0.95}]
    assert [x["text"] for x in merge_pieces(raw)] == ["c'est", "Suivez-moi", "recoil ?"]


def test_repetition_keeps_last_take():
    words = [w("en", 0, .1), w("direct,", .1, .3), w("en", .4, .5), w("direct,", .5, .7), w("vous", .8, 1)]
    assert find_repetitions(words) == [(0, 1)]


def test_spans_cut_silence_hesitation_and_edges():
    words = [w("Bonjour", 1.0, 1.4), w("euh", 1.5, 1.7), w("tout", 1.8, 2.0), w("le", 3.0, 3.1), w("monde", 3.1, 3.5)]
    spans = build_spans(words, 5.0, {"euh"})
    cuts = [(s["start"], s["end"], s["reason"]) for s in spans if not s["keep"]]
    assert cuts[0][2] == "outside" and cuts[-1][2] == "outside"
    assert any(r == "hesitation" for *_, r in cuts)
    assert any(r == "silence" and a > 2.0 and b < 3.0 for a, b, r in cuts)
    assert abs(sum(s["end"] - s["start"] for s in spans) - 5.0) < 1e-6


def test_auto_blocks_do_not_end_on_article():
    words = [w(t, i, i + .2) for i, t in enumerate("je veux tester la nouvelle approche de détection".split())]
    auto_blocks(words, 4, 30)
    for i, x in enumerate(words):
        if x.get("blockStart") and i:
            assert words[i - 1]["text"] not in ("la", "de")


def test_sentence_spans_keep_everything_and_alternate_zoom():
    from initial_plan import ZOOM_EVERY, sentence_spans
    words = []
    t = 0.5
    for i in range(7):  # 7 sentences of 2 s
        words += [w("une", t, t + 0.5), w("phrase.", t + 0.6, t + 1.6)]
        t += 2.0
    spans = sentence_spans(words, 15.0)
    assert all(s["keep"] for s in spans)
    assert spans[0]["start"] == 0 and spans[-1]["end"] == 15.0
    assert all(a["end"] == b["start"] for a, b in zip(spans, spans[1:]))
    assert len(spans) == 7
    assert [s["zoom"] for s in spans] == [i % ZOOM_EVERY == ZOOM_EVERY - 1 for i in range(7)]


def test_proposal_cuts_ignored_on_edited_rush():
    from propose_plan import apply_proposal
    plan = {"words": [{"id": "w0", "text": "a", "start": 0, "end": 1}, {"id": "w1", "text": "b", "start": 1.2, "end": 2}],
            "spans": [{"id": "s0", "start": 0, "end": 3, "keep": True, "zoom": False}], "assets": [], "logos": [],
            "concepts": [], "cutIns": [], "diagrams": [], "subscribe": None}
    proposal = {"cuts": [{"fromWord": "w0", "toWord": "w0", "reason": "hesitation"}], "restores": [], "corrections": [],
                "highlights": [], "concepts": [], "logos": [], "cutIns": [], "diagrams": [], "subscribeWord": None,
                "notes": ""}
    import copy
    assert all(s["keep"] for s in apply_proposal(copy.deepcopy(plan), proposal, allow_cuts=False)["spans"])
    assert any(not s["keep"] for s in apply_proposal(copy.deepcopy(plan), proposal, allow_cuts=True)["spans"])


def test_auto_blocks_full_block_moves_its_article_to_the_next():
    words = [w("les", 0, .2), w("membres", .2, .6), w("sur", .6, .8), w("Discord", .8, 1.2)]
    auto_blocks(words, 3, 18)
    assert [x["text"] for x in words if x.get("blockStart")] == ["les", "sur"]


def test_cut_choice_given_then_kept_per_video():
    theme = {"editing": {"autoCuts": False}}
    assert cut_choice(None, theme) is False
    assert cut_choice(None, theme, "raw") is True
    raw_plan = {"themeOverrides": {"editing": {"autoCuts": True}}}
    assert cut_choice(raw_plan, theme) is True
    assert cut_choice(raw_plan, theme, "edited") is False
