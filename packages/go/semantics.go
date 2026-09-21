package rasterstyle

import "strings"

func increasing(values []any) bool {
	for index := 1; index < len(values); index++ {
		if values[index-1].(float64) >= values[index].(float64) {
			return false
		}
	}
	return true
}

// validateSemantics runs only after structural schema validation succeeds.
func validateSemantics(style map[string]any) error {
	var firstError error
	require := func(condition bool, path, message string) {
		if !condition && firstError == nil {
			firstError = failure("E_SEMANTIC", message, path)
		}
	}
	input := objectAt(style, "input")
	selector := objectAt(input, "selector")
	channels := 1
	switch selector["kind"] {
	case "bands":
		channels = len(arrayAt(selector, "bands"))
	case "expression":
		channels = len(arrayAt(selector, "expressions"))
	}
	renderer := objectAt(style, "renderer")
	expected := 1
	if renderer["type"] == "rgb" {
		expected = 3
	}
	require(channels == expected, "input.selector", "Renderer channel cardinality mismatch")
	stretch := objectAt(style, "stretch")
	for _, key := range []string{"ranges", "curves", "gamma"} {
		if values, exists := stretch[key]; exists {
			count := len(values.([]any))
			require(count == 1 || count == channels, "stretch."+key, "Expected one value or one per channel")
		}
	}
	for _, value := range arrayAt(stretch, "ranges") {
		pair := value.([]any)
		require(pair[0].(float64) < pair[1].(float64), "stretch.ranges", "Range must increase")
	}
	if pair, exists := stretch["percentiles"].([]any); exists {
		require(pair[0].(float64) < pair[1].(float64), "stretch.percentiles", "Percentiles must increase")
	}
	for _, value := range arrayAt(stretch, "curves") {
		curve := value.([]any)
		for index, value := range curve {
			point := value.([]any)
			require(point[1].(float64) >= 0 && point[1].(float64) <= 1, "stretch.curves", "Curve output must be in [0,1]")
			if index > 0 {
				previous := curve[index-1].([]any)
				require(previous[0].(float64) < point[0].(float64) && previous[1].(float64) <= point[1].(float64), "stretch.curves", "Curve must be monotonic")
			}
		}
	}
	colorMap := objectAt(renderer, "color_map")
	bypass := renderer["type"] == "categorized" || renderer["type"] == "single_color" || renderer["type"] == "hillshade" || colorMap["domain"] == "data"
	if bypass {
		method, present := stretch["method"]
		require(!present || method == "none", "stretch", "Data-domain renderer must bypass stretch")
		for _, gamma := range arrayAt(stretch, "gamma") {
			require(gamma.(float64) == 1, "stretch", "Data-domain renderer must bypass stretch")
		}
		_, sigmoid := stretch["sigmoid"]
		require(!sigmoid, "stretch", "Data-domain renderer must bypass stretch")
	}
	switch colorMap["mode"] {
	case "continuous":
		values := make([]any, 0)
		for _, item := range arrayAt(colorMap, "stops") {
			value := item.(map[string]any)["value"].(float64)
			values = append(values, value)
			if colorMap["domain"] == "normalized" {
				require(value >= 0 && value <= 1, "renderer.color_map.stops", "Normalized stops must be in [0,1]")
			}
		}
		require(increasing(values), "renderer.color_map.stops", "Stops must increase")
	case "discrete":
		breaks := arrayAt(colorMap, "breaks")
		require(len(arrayAt(colorMap, "colors"))+1 == len(breaks), "renderer.color_map", "Break/color cardinality mismatch")
		require(increasing(breaks), "renderer.color_map.breaks", "Breaks must increase")
	case "exact":
		seen := make(map[float64]bool)
		for _, item := range arrayAt(colorMap, "entries") {
			value := item.(map[string]any)["value"].(float64)
			require(!seen[value], "renderer.color_map.entries", "Exact keys must be unique")
			seen[value] = true
		}
	}
	mosaic := objectAt(style, "mosaic")
	if renderer["type"] == "categorized" {
		for _, value := range objectAt(style, "resampling") {
			require(value == "nearest" || value == "mode", "resampling", "Categorical rendering requires nearest or mode")
		}
		require(mosaic["pixel_selection"] != "mean" && mosaic["pixel_selection"] != "median", "mosaic.pixel_selection", "Categorical rendering forbids arithmetic mosaic")
	}
	opacity := objectAt(style, "opacity")
	if alpha := objectAt(opacity, "alpha_band"); alpha != nil {
		pair := arrayAt(alpha, "range")
		require(pair[0].(float64) < pair[1].(float64), "opacity.alpha_band.range", "Alpha range must increase")
	}
	for _, item := range arrayAt(opacity, "rules") {
		rule := item.(map[string]any)
		if channel, exists := rule["channel"]; exists {
			require(channel.(float64) <= float64(channels), "opacity.rules", "Rule channel is out of bounds")
		}
		if rule["kind"] == "range" {
			require(rule["min"].(float64) < rule["max"].(float64), "opacity.rules", "Rule range must increase")
		}
		if rule["kind"] == "rgb" {
			require(channels == 3, "opacity.rules", "RGB rule requires three channels")
		}
	}
	calibration := objectAt(input, "calibration")
	seenBands := make(map[float64]bool)
	for _, item := range arrayAt(calibration, "coefficients") {
		band := item.(map[string]any)["band"].(float64)
		require(!seenBands[band], "input.calibration", "Duplicate calibration band")
		seenBands[band] = true
	}
	if rank, exists := mosaic["rank_channel"]; exists {
		require(mosaic["pixel_selection"] == "highest" || mosaic["pixel_selection"] == "lowest", "mosaic.rank_channel", "Rank applies only to highest/lowest")
		if mosaic["stage"] == "after_selector" {
			require(rank.(float64) <= float64(channels), "mosaic.rank_channel", "Rank channel is out of bounds")
		}
	}
	output := objectAt(style, "output")
	format := output["format"]
	if format == nil {
		format = "png"
	}
	if format == "jpeg" || output["alpha"] == "flatten" {
		_, background := output["background"]
		require(output["alpha"] == "flatten" && background, "output", "Flatten requires background; JPEG requires flatten")
	}
	if color, exists := output["background"].(string); exists {
		require(len(color) == 7 || strings.HasSuffix(strings.ToLower(color), "ff"), "output.background", "Background must be opaque")
	}
	_, quality := output["quality"]
	if format == "png" {
		require(!quality, "output.quality", "PNG does not accept lossy quality")
	}
	if _, lossless := output["lossless"]; lossless {
		require(format == "webp", "output.lossless", "Lossless is a WebP option")
	}
	if output["lossless"] == true {
		require(!quality, "output.quality", "Lossless output does not accept lossy quality")
	}
	return firstError
}
