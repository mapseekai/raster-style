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
	channelSpec := objectAt(style, "renderer")
	channels := 1
	if bands, ok := channelSpec["bidx"]; ok {
		channels = len(bands.([]any))
	} else if expression, ok := channelSpec["expression"]; ok {
		channels = len(strings.Split(expression.(string), ";"))
	}
	renderer := channelSpec
	expected := 1
	if renderer["type"] == "rgb" {
		expected = 3
	}
	require(channels == expected, "kind", "Renderer channel cardinality mismatch")
	stretch := objectAt(style, "stretch")
	for _, key := range []string{"rescale", "curves"} {
		if values, exists := stretch[key]; exists {
			count := len(values.([]any))
			require(count == 1 || count == channels, key, "Expected one value or one per channel")
		}
	}
	for _, value := range arrayAt(stretch, "rescale") {
		pair := value.([]any)
		require(pair[0].(float64) < pair[1].(float64), "rescale", "Range must increase")
	}
	if pair, exists := stretch["percentiles"].([]any); exists {
		require(pair[0].(float64) < pair[1].(float64), "percentiles", "Percentiles must increase")
	}
	for _, value := range arrayAt(stretch, "curves") {
		curve := value.([]any)
		for index, value := range curve {
			point := value.([]any)
			require(point[1].(float64) >= 0 && point[1].(float64) <= 1, "curves", "Curve output must be in [0,1]")
			if index > 0 {
				previous := curve[index-1].([]any)
				require(previous[0].(float64) < point[0].(float64) && previous[1].(float64) <= point[1].(float64), "curves", "Curve must be monotonic")
			}
		}
	}
	colorMap := objectAt(renderer, "color_mapping")
	bypass := renderer["type"] == "categorized" || renderer["type"] == "single_color" || renderer["type"] == "hillshade" || colorMap["domain"] == "data"
	if bypass {
		method, present := stretch["method"]
		require(!present || method == "none", "method", "Data-domain renderer must bypass stretch")
		_, formula := objectAt(style, "effects")["color_formula"]
		require(!formula, "color_formula", "Data-domain renderer must bypass color formula")
	}
	switch colorMap["mode"] {
	case "continuous":
		values := make([]any, 0)
		for _, item := range arrayAt(colorMap, "stops") {
			value := item.(map[string]any)["value"].(float64)
			values = append(values, value)
			if colorMap["domain"] == "normalized" {
				require(value >= 0 && value <= 1, "color_mapping.stops", "Normalized stops must be in [0,1]")
			}
		}
		require(increasing(values), "color_mapping.stops", "Stops must increase")
	case "discrete":
		breaks := arrayAt(colorMap, "breaks")
		require(len(arrayAt(colorMap, "colors"))+1 == len(breaks), "color_mapping", "Break/color cardinality mismatch")
		require(increasing(breaks), "color_mapping.breaks", "Breaks must increase")
	case "exact":
		seen := make(map[float64]bool)
		for _, item := range arrayAt(colorMap, "entries") {
			value := item.(map[string]any)["value"].(float64)
			require(!seen[value], "color_mapping.entries", "Exact keys must be unique")
			seen[value] = true
		}
	}
	mosaic := objectAt(style, "mosaic")
	if renderer["type"] == "categorized" {
		for _, key := range []string{"read", "reproject"} {
			value := objectAt(style, "resampling")[key]
			require(value == nil || value == "nearest" || value == "mode", "resampling", "Categorical rendering requires nearest or mode")
		}
		require(mosaic["pixel_selection"] != "mean" && mosaic["pixel_selection"] != "median", "pixel_selection", "Categorical rendering forbids arithmetic mosaic")
	}
	calibration := objectAt(style, "calibration")
	seenBands := make(map[float64]bool)
	for _, item := range arrayAt(calibration, "coefficients") {
		band := item.(map[string]any)["band"].(float64)
		require(!seenBands[band], "calibration", "Duplicate calibration band")
		seenBands[band] = true
	}
	if rank, exists := mosaic["rank_channel"]; exists {
		require(mosaic["pixel_selection"] == "highest" || mosaic["pixel_selection"] == "lowest", "rank_channel", "Rank applies only to highest/lowest")
		if mosaic["stage"] == "after_channels" {
			require(rank.(float64) <= float64(channels), "rank_channel", "Rank channel is out of bounds")
		}
	}
	image := objectAt(style, "image")
	format := image["format"]
	if format == nil {
		format = "png"
	}
	if color, exists := image["background"].(string); exists {
		require(len(color) == 7 || strings.HasSuffix(strings.ToLower(color), "ff"), "background", "Background must be opaque")
	}
	_, quality := image["quality"]
	if format == "png" {
		require(!quality, "quality", "PNG does not accept lossy quality")
	}
	if _, lossless := image["lossless"]; lossless {
		require(format == "webp", "lossless", "Lossless is a WebP option")
	}
	if image["lossless"] == true {
		require(!quality, "quality", "Lossless output does not accept lossy quality")
	}
	return firstError
}
