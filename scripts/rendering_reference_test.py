"""Regression checks for the bounded reference evaluator's input contract."""
import copy
import json
import unittest

from rendering_reference import ROOT, render_case


class ResamplingContractTest(unittest.TestCase):
    def setUp(self):
        cases = json.loads((ROOT / "testdata/rendering-vectors.json").read_text())
        self.case = next(case for case in cases if case["name"] == "alpha-weighted-resampling")

    def test_rejects_implicit_nearest(self):
        self.case["style"].pop("resampling", None)
        with self.assertRaisesRegex(ValueError, "only bilinear"):
            render_case(self.case)

    def test_rejects_unsupported_algorithms(self):
        for method in ("nearest", "mode", "average", "cubic", "cubic_spline", "lanczos"):
            for stage in ("read", "reproject"):
                with self.subTest(method=method, stage=stage):
                    self.case["input"]["stage"] = stage
                    self.case["style"]["resampling"] = {"read": "bilinear", "reproject": "bilinear", stage: method}
                    with self.assertRaisesRegex(ValueError, "only bilinear"):
                        render_case(self.case)

    def test_uses_requested_stage(self):
        for stage in ("read", "reproject"):
            with self.subTest(stage=stage):
                case = copy.deepcopy(self.case)
                case["input"]["stage"] = stage
                case["style"]["resampling"] = {"read": "nearest", "reproject": "nearest", stage: "bilinear"}
                self.assertEqual(render_case(case), case["expected"])

    def test_rejects_unknown_stage(self):
        self.case["input"]["stage"] = "overview"
        with self.assertRaisesRegex(ValueError, "stage"):
            render_case(self.case)


if __name__ == "__main__":
    unittest.main()
