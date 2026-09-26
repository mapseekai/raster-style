#!/usr/bin/env python3
"""Evaluate bounded spec fixtures, independently of the SDK transport codecs.

This is a scalar oracle, not a raster reader, reprojection engine or image encoder.
"""
from __future__ import annotations

import bisect
import json
import math
from pathlib import Path
from statistics import mean

from expression_reference import ExpressionError, run_expression

ROOT = Path(__file__).resolve().parent.parent


def clamp(x):
    return min(1.0, max(0.0, x))


def decode_srgb(x):
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def encode_srgb(x):
    return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055


def byte_value(x):
    scaled = clamp(x) * 255
    half = math.floor(scaled) + 0.5
    if abs(scaled - half) <= 1e-10:
        scaled = half
    return math.floor(scaled + 0.5)


def rgba8(color):
    result = [byte_value(x) for x in color]
    return result if result[3] else [0, 0, 0, 0]


def color(text):
    text = text.removeprefix("#")
    if len(text) == 6:
        text += "ff"
    return [int(text[i:i + 2], 16) / 255 for i in range(0, 8, 2)]


def fraction(x, lo, hi):
    if x == lo:
        return 0.0
    if x == hi:
        return 1.0
    span = hi - lo
    return (x - lo) / span if math.isfinite(span) else (x / 2 - lo / 2) / (hi / 2 - lo / 2)


def lerp(a, b, t):
    return (1 - t) * a + t * b if a * b <= 0 else a + t * (b - a)


def sigmoid(x, contrast, midpoint):
    if x in (0, 1) or contrast < 1e-12:
        return x
    t = contrast * (midpoint - x)
    softplus = max(t, 0) + math.log1p(math.exp(-abs(t)))
    # log(-expm1(-c*x)) tends to log(c)+log(x) if the product underflows.
    product = contrast * x
    first = math.log(-math.expm1(-product)) if product else math.log(contrast) + math.log(x)
    return clamp(math.exp(first - math.log(-math.expm1(-contrast))
                          + math.log1p(math.exp(-contrast * (1 - midpoint))) - softplus))


XYZ = ((0.4124564, 0.3575761, 0.1804375), (0.2126729, 0.7151522, 0.0721750), (0.0193339, 0.1191920, 0.9503041))


def invert_matrix(m):
    cofactors = []
    for i in range(3):
        row = []
        for j in range(3):
            minor = [[m[r][c] for c in range(3) if c != j] for r in range(3) if r != i]
            row.append((-1) ** (i + j) * (minor[0][0] * minor[1][1] - minor[0][1] * minor[1][0]))
        cofactors.append(row)
    determinant = sum(m[0][j] * cofactors[0][j] for j in range(3))
    return [[cofactors[j][i] / determinant for j in range(3)] for i in range(3)]


INV_XYZ = invert_matrix(XYZ)


def lab_saturation(rgb, value):
    if value == 1:
        return rgb[:]
    linear = [decode_srgb(x) for x in rgb]
    white = [sum(row) for row in XYZ]
    xyz = [sum(a * b for a, b in zip(row, linear)) / w for row, w in zip(XYZ, white)]
    delta = 6 / 29
    f = [x ** (1 / 3) if x > delta ** 3 else x / (3 * delta ** 2) + 4 / 29 for x in xyz]
    # Scaling Lab a and b leaves f(Y) and L unchanged.
    adjusted = [f[1] + value * (f[0] - f[1]), f[1], f[1] + value * (f[2] - f[1])]
    restored = [(x ** 3 if x > delta else 3 * delta ** 2 * (x - 4 / 29)) * w for x, w in zip(adjusted, white)]
    return [clamp(encode_srgb(sum(a * b for a, b in zip(row, restored)))) for row in INV_XYZ]


def operations(values, steps, pre=False):
    values = values[:]
    for step in steps:
        op = step["op"]
        selected = step.get("channels", "r" if pre and len(values) == 1 else "rgb")
        if op == "saturation" and pre:
            values = lab_saturation(values, step["value"])
        elif op in ("saturation", "grayscale"):
            luma = sum(a * b for a, b in zip(values, (0.2126, 0.7152, 0.0722)))
            if op == "grayscale":
                values = [sum(values) / 3 if step["method"] == "average" else luma] * 3
            else:
                values = [luma + step["value"] * (x - luma) for x in values]
        else:
            for channel in selected:
                index = "rgb".index(channel)
                x = values[index]
                if op == "gamma":
                    values[index] = x if x in (0, 1) else math.exp(math.log(x) / step["value"])
                elif op == "sigmoidal":
                    values[index] = sigmoid(x, step["contrast"], step["midpoint"])
                elif op == "brightness":
                    values[index] = x + step["value"]
                elif op == "contrast":
                    values[index] = (x - 0.5) * step["value"] + 0.5
                elif op == "invert":
                    values[index] = 1 - x
                else:
                    raise AssertionError(f"Unsupported reference operation {op}")
        values = [clamp(x) for x in values]
    return values


def stretch_value(x, stretch, samples, channel=0):
    method = stretch.get("method", "none")
    policy = stretch.get("range_policy", "clamp")
    ys = [0, 1]
    if method == "none":
        xs = [0, 255]
    elif method == "linear":
        ranges = stretch["rescale"]
        xs = ranges[0 if len(ranges) == 1 else channel]
    elif method == "curve":
        curves = stretch["curves"]
        curve = curves[0 if len(curves) == 1 else channel]
        xs, ys = map(list, zip(*curve))
    else:
        ordered = sorted(float(v) for v in samples if v is not None)
        if not ordered:
            return None
        xs = [ordered[0], ordered[-1]]
        if method == "percentile":
            def percentile(p):
                h = (len(ordered) - 1) * p / 100
                return lerp(ordered[math.floor(h)], ordered[math.ceil(h)], h - math.floor(h))
            xs = [percentile(p) for p in stretch["percentiles"]]
        elif method == "stddev":
            scale = max(abs(v) for v in ordered) or 1
            scaled = [v / scale for v in ordered]
            mean = math.fsum(scaled) / len(scaled)
            deviation = math.sqrt(math.fsum((v - mean) ** 2 for v in scaled) / len(scaled))
            xs = [(mean - stretch["stddev"] * deviation) * scale, (mean + stretch["stddev"] * deviation) * scale]
            if not all(math.isfinite(v) for v in xs):
                raise ValueError("Unrepresentable statistics range")
        elif method == "histogram_equalization":
            xs = sorted(set(ordered))
            if len(xs) > 1:
                first = bisect.bisect_right(ordered, xs[0])
                ys = [(bisect.bisect_right(ordered, v) - first) / (len(ordered) - first) for v in xs]
        elif method != "minmax":
            raise AssertionError(f"Unsupported stretch {method}")
    if xs[0] == xs[-1]:
        return 0.5 if x == xs[0] else (None if policy == "transparent" else float(x > xs[0]))
    if x < xs[0] or x > xs[-1]:
        return None if policy == "transparent" else ys[0 if x < xs[0] else -1]
    i = min(bisect.bisect_right(xs, x) - 1, len(xs) - 2)
    return lerp(ys[i], ys[i + 1], fraction(x, xs[i], xs[i + 1]))


def mapped_color(renderer, x, context):
    if "colormap" in renderer or "colormap_name" in renderer:
        table = renderer.get("colormap", context.get("palette"))
        if isinstance(table, dict):
            return next(([v / 255 for v in rgba] for key, rgba in table.items() if float(key) == x), [0, 0, 0, 0])
        return next(([v / 255 for v in rgba] for (lo, hi), rgba in table if lo <= x < hi), [0, 0, 0, 0])
    mapping = renderer["color_mapping"]
    mode = mapping["mode"]
    if mode == "source":
        return mapped_color({"colormap": context["palette"]}, x, context)
    if mode == "exact":
        return next((color(e["color"]) for e in mapping["entries"] if e["value"] == x), color(mapping.get("fallback_color", "#00000000")))
    if mode == "discrete":
        breaks = mapping["breaks"]
        if not breaks[0] <= x <= breaks[-1]:
            return color(mapping.get("outside_color", "#00000000"))
        locate = bisect.bisect_right if mapping.get("boundary", "left_closed") == "left_closed" else bisect.bisect_left
        index = max(0, min(locate(breaks, x) - 1, len(mapping["colors"]) - 1))
        return color(mapping["colors"][index])
    if mode != "continuous":
        raise AssertionError(f"Unsupported mapping {mode}")
    stops = mapping.get("stops", context.get("stops"))
    xs = [stop["value"] for stop in stops]
    colors = [color(stop["color"]) for stop in stops]
    if mapping.get("reverse", False):
        colors.reverse()
    if x < xs[0] or x > xs[-1]:
        choice = mapping.get("under" if x < xs[0] else "over", "clamp")
        return colors[0 if x < xs[0] else -1] if choice == "clamp" else color(choice)
    i = min(bisect.bisect_right(xs, x) - 1, len(xs) - 2)
    t = fraction(x, xs[i], xs[i + 1])
    left, right = colors[i:i + 2]
    alpha = lerp(left[3], right[3], t)
    if alpha == 0:
        return [0, 0, 0, 0]
    linear = mapping.get("interpolation", "srgb") == "linear_rgb"
    rgb = []
    for a, b in zip(left[:3], right[:3]):
        if linear:
            a, b = decode_srgb(a), decode_srgb(b)
        c = lerp(a * left[3], b * right[3], t) / alpha
        rgb.append(encode_srgb(c) if linear else c)
    return rgb + [alpha]


def encoded_pixel(style, rgba):
    image = style.get("image", {})
    if image.get("format") == "jpeg":
        background = color(image.get("background", "#000000ff"))
        rgba[:3] = [encode_srgb(lerp(decode_srgb(b), decode_srgb(v), rgba[3])) for v, b in zip(rgba[:3], background[:3])]
        rgba[3] = 1
    return {"rgba": rgba8(rgba)}


def pixel(style, values, context):
    alpha = context.get("alpha", 1)
    if any(x is None for x in values) or alpha <= 0:
        return encoded_pixel(style, [0, 0, 0, 0])
    renderer = style["renderer"]
    kind = renderer["type"]
    stretch = style.get("stretch", {})
    effects = style.get("effects", {})
    native = "colormap" in renderer
    native_data = native and stretch.get("method", "none") == "none" and not effects.get("color_formula")
    data = kind in ("categorized", "single_color", "hillshade") or renderer.get("color_mapping", {}).get("domain") == "data" or native_data
    if not data:
        values = [stretch_value(x, stretch, context.get("samples", []), i) for i, x in enumerate(values)]
        if any(x is None for x in values):
            return encoded_pixel(style, [0, 0, 0, 0])
        values = operations(values, effects.get("color_formula", []), pre=True)
    if kind == "rgb":
        rgba = values + [1]
    elif kind == "gray":
        rgba = [1 - values[0] if renderer.get("renderer_invert", False) else values[0]] * 3 + [1]
    elif kind == "single_color":
        rgba = color(renderer["color"])
    elif kind == "hillshade":
        rgba = [context["h"]] * 3 + [1]
    else:
        value = values[0]
        if not data and (native or "colormap_name" in renderer):
            value = byte_value(value)
        rgba = mapped_color(renderer, value, context)
        if kind == "shaded_relief":
            factor = 1 - renderer.get("strength", 0.65) + renderer.get("strength", 0.65) * context["h"]
            rgba[:3] = [encode_srgb(decode_srgb(v) * factor) for v in rgba[:3]]
    rgba[:3] = operations(rgba[:3], effects.get("post_color_formula", []))
    rgba[3] *= alpha * style.get("opacity", 1)
    return encoded_pixel(style, rgba)


def render_case(case):
    kind, style, context = case["kind"], case["style"], case["input"]
    if kind == "pixel":
        return pixel(style, context["values"], context)
    if kind == "sample":
        grid = context["grid"]
        statistics = style["statistics"]
        n = len(grid)
        k = n if statistics["accuracy"] == "exact" else min(statistics.get("sample_size", 1000000), n)
        indices = [] if k == 0 else ([(n - 1) // 2] if k == 1 else [i * (n - 1) // (k - 1) for i in range(k)])
        samples = [grid[i] for i in indices if grid[i] is not None]
        return {**pixel(style, context["values"], {"samples": samples}), "indices": indices, "samples": samples}
    if kind == "terrain":
        grid = context["grid"]
        if any(v is None for row in grid for v in row):
            return {**encoded_pixel(style, [0, 0, 0, 0]), "h": None}
        terrain = style["renderer"]["terrain"]
        scale = terrain.get("z_factor", 1) * (0.3048 if terrain.get("vertical_unit", "metre") == "foot" else 1)
        z = [v * scale for row in grid for v in row]
        p = (z[2] + 2 * z[5] + z[8] - z[0] - 2 * z[3] - z[6]) / (8 * context.get("dx", 1))
        q = (z[0] + 2 * z[1] + z[2] - z[6] - 2 * z[7] - z[8]) / (8 * context.get("dy", 1))
        altitude = math.radians(terrain.get("altitude", 45))
        directions = [225, 270, 315, 0] if terrain["method"] == "multidirectional" else [terrain.get("azimuth", 315)]
        def light(azimuth):
            az = math.radians(azimuth)
            return max(0, (-p * math.cos(altitude) * math.sin(az) - q * math.cos(altitude) * math.cos(az) + math.sin(altitude)) / math.hypot(p, q, 1))
        h = sum(light(az) for az in directions) / len(directions)
        return {**pixel(style, [grid[1][1]], {**context, "h": h}), "h": h}
    if kind == "resample":
        stage = context.get("stage", "read")
        if stage not in ("read", "reproject"):
            raise ValueError("Unknown reference resampling stage")
        if style.get("resampling", {}).get(stage, "nearest") != "bilinear":
            raise ValueError("Reference resampling supports only bilinear with supplied weights")
        samples = [s for s in context["samples"] if s["value"] is not None and s.get("alpha", 1) > 0 and s["weight"] != 0]
        weights = sum(s["weight"] for s in samples)
        coverage = sum(s["weight"] * s.get("alpha", 1) for s in samples)
        if weights == 0 or coverage == 0:
            return {**encoded_pixel(style, [0, 0, 0, 0]), "value": None, "alpha": 0}
        value = sum(s["weight"] * s.get("alpha", 1) * s["value"] for s in samples) / coverage
        alpha = clamp(coverage / weights)
        return {**pixel(style, [value], {"alpha": alpha}), "value": value, "alpha": alpha}
    if kind == "mosaic":
        sources = [s for s in context["sources"] if all(v is not None for v in s["values"]) and s.get("alpha", 1) > 0]
        if not sources:
            return {**encoded_pixel(style, [0, 0, 0, 0]), "values": None, "alpha": 0}
        method = style["mosaic"]["pixel_selection"]
        stage = style["mosaic"]["stage"]
        extensions = sorted(style.get("extensions", {}).items())
        def extend(values, point):
            for name, ext in extensions:
                if ext["stage"] == point:
                    if name != "mapseek.test.square":
                        raise AssertionError("Unknown fixture extension")
                    values = [v * v for v in values]
            return values
        def select(values):
            bands = context["dependency_bands"]
            return [values[bands.index(b)] for b in style["renderer"]["bidx"]]
        prepared = []
        for source in sources:
            values = extend(source["values"], "before_channels")
            if stage == "after_channels":
                values = extend(select(values), "after_channels")
            prepared.append({"values": values, "alpha": source.get("alpha", 1)})
        if method in ("first", "highest", "lowest"):
            rank = style["mosaic"].get("rank_channel", 1) - 1
            selected = prepared[0] if method == "first" else (max if method == "highest" else min)(prepared, key=lambda s: s["values"][rank])
            values, alpha = selected["values"], selected["alpha"]
        else:
            def aggregate(column):
                ordered = sorted(column)
                n = len(ordered)
                return mean(ordered) if method == "mean" else (ordered[n // 2] if n % 2 else lerp(ordered[n // 2 - 1], ordered[n // 2], 0.5))
            values = [aggregate(list(column)) for column in zip(*(s["values"] for s in prepared))]
            alpha = math.fsum(s["alpha"] for s in prepared) / len(prepared)
        if stage == "before_channels":
            values = extend(select(values), "after_channels")
        return {**pixel(style, values, {"alpha": alpha}), "values": values, "alpha": alpha}
    raise AssertionError(f"Unknown case kind {kind}")


def check_value(actual, expected, tolerance=1e-9):
    if isinstance(expected, dict):
        for key, value in expected.items():
            if key == "rgba":
                assert actual[key] == value, (actual[key], value)
            else:
                check_value(actual[key], value, tolerance)
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for a, b in zip(actual, expected):
            check_value(a, b, tolerance)
    elif expected is None or isinstance(expected, (str, bool)):
        assert actual == expected, (actual, expected)
    else:
        assert math.isfinite(actual) and abs(actual - expected) <= tolerance, (actual, expected)


def main():
    rendering = json.loads((ROOT / "testdata/rendering-vectors.json").read_text())
    expressions = json.loads((ROOT / "testdata/expression-vectors.json").read_text())
    for case in rendering:
        try:
            check_value(render_case(case), case["expected"], case.get("tolerance", 1e-9))
        except Exception as error:
            raise AssertionError(case["name"]) from error
    for case in expressions:
        try:
            values = run_expression(case["expression"], case.get("bands", {}))
        except ExpressionError:
            assert case.get("reject", False), case["name"]
        else:
            assert not case.get("reject", False), case["name"]
            check_value(values, case["expected"])
    print(f"Reference vectors passed: {len(rendering)} rendering, {len(expressions)} expression; backend rendering not exercised.")


if __name__ == "__main__":
    main()
