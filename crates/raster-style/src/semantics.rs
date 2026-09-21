use serde_json::Value;

use crate::error::{Error, Result};

fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn number(value: &Value) -> f64 {
    value.as_f64().expect("schema-validated number")
}
fn increasing(values: &[Value]) -> bool {
    values
        .windows(2)
        .all(|pair| number(&pair[0]) < number(&pair[1]))
}
fn require(condition: bool, path: &str, message: &str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(Error::new("E_SEMANTIC", message).at(path))
    }
}

/// Static cross-field validation. Source bindings and expression evaluation are not performed here.
pub(crate) fn validate_semantics(style: &Value) -> Result<()> {
    let channel_spec = &style["channels"];
    let channels = match channel_spec["kind"].as_str() {
        Some("bands") => array(&channel_spec["bands"]).len(),
        Some("expression") => array(&channel_spec["expressions"]).len(),
        _ => 1,
    };
    let renderer = &style["renderer"];
    let renderer_type = renderer["type"].as_str().unwrap_or_default();
    require(
        channels == if renderer_type == "rgb" { 3 } else { 1 },
        "channels",
        "Renderer channel cardinality mismatch",
    )?;
    let stretch = &style["stretch"];
    for key in ["ranges", "curves", "gamma"] {
        if let Some(values) = stretch.get(key) {
            let count = array(values).len();
            require(
                count == 1 || count == channels,
                &format!("stretch.{key}"),
                "Expected one value or one per channel",
            )?;
        }
    }
    for pair in array(&stretch["ranges"]) {
        require(
            number(&pair[0]) < number(&pair[1]),
            "stretch.ranges",
            "Range must increase",
        )?;
    }
    if let Some(pair) = stretch.get("percentiles") {
        require(
            number(&pair[0]) < number(&pair[1]),
            "stretch.percentiles",
            "Percentiles must increase",
        )?;
    }
    for curve in array(&stretch["curves"]) {
        require(
            array(curve)
                .iter()
                .all(|point| (0.0..=1.0).contains(&number(&point[1]))),
            "stretch.curves",
            "Curve output must be in [0,1]",
        )?;
        require(
            array(curve).windows(2).all(|pair| {
                number(&pair[0][0]) < number(&pair[1][0])
                    && number(&pair[0][1]) <= number(&pair[1][1])
            }),
            "stretch.curves",
            "Curve must be monotonic",
        )?;
    }
    let color_map = &renderer["color_map"];
    let bypass = ["categorized", "single_color", "hillshade"].contains(&renderer_type)
        || color_map["domain"] == "data";
    if bypass {
        require(
            stretch["method"].as_str().unwrap_or("none") == "none"
                && array(&stretch["gamma"])
                    .iter()
                    .all(|value| number(value) == 1.0)
                && stretch.get("sigmoid").is_none(),
            "stretch",
            "Data-domain renderer must bypass stretch",
        )?;
    }
    match color_map["mode"].as_str() {
        Some("continuous") => {
            let stops = array(&color_map["stops"]);
            require(
                stops
                    .windows(2)
                    .all(|pair| number(&pair[0]["value"]) < number(&pair[1]["value"])),
                "renderer.color_map.stops",
                "Stops must increase",
            )?;
            if color_map["domain"] == "normalized" {
                require(
                    stops
                        .iter()
                        .all(|stop| (0.0..=1.0).contains(&number(&stop["value"]))),
                    "renderer.color_map.stops",
                    "Normalized stops must be in [0,1]",
                )?;
            }
        }
        Some("discrete") => {
            let breaks = array(&color_map["breaks"]);
            require(
                array(&color_map["colors"]).len() + 1 == breaks.len(),
                "renderer.color_map",
                "Break/color cardinality mismatch",
            )?;
            require(
                increasing(breaks),
                "renderer.color_map.breaks",
                "Breaks must increase",
            )?;
        }
        Some("exact") => {
            let mut values: Vec<f64> = array(&color_map["entries"])
                .iter()
                .map(|entry| number(&entry["value"]))
                .collect();
            values.sort_by(f64::total_cmp);
            require(
                values.windows(2).all(|pair| pair[0] != pair[1]),
                "renderer.color_map.entries",
                "Exact keys must be unique",
            )?;
        }
        _ => {}
    }
    let mosaic = &style["mosaic"];
    if renderer_type == "categorized" {
        if let Some(resampling) = style["resampling"].as_object() {
            require(
                resampling
                    .values()
                    .all(|value| value == "nearest" || value == "mode"),
                "resampling",
                "Categorical rendering requires nearest or mode",
            )?;
        }
        require(
            mosaic["pixel_selection"] != "mean" && mosaic["pixel_selection"] != "median",
            "mosaic.pixel_selection",
            "Categorical rendering forbids arithmetic mosaic",
        )?;
    }
    let opacity = &style["opacity"];
    if let Some(alpha) = opacity.get("alpha_band") {
        require(
            number(&alpha["range"][0]) < number(&alpha["range"][1]),
            "opacity.alpha_band.range",
            "Alpha range must increase",
        )?;
    }
    for rule in array(&opacity["rules"]) {
        if let Some(channel) = rule.get("channel") {
            require(
                number(channel) <= channels as f64,
                "opacity.rules",
                "Rule channel is out of bounds",
            )?;
        }
        if rule["kind"] == "range" {
            require(
                number(&rule["min"]) < number(&rule["max"]),
                "opacity.rules",
                "Rule range must increase",
            )?;
        }
        if rule["kind"] == "rgb" {
            require(
                channels == 3,
                "opacity.rules",
                "RGB rule requires three channels",
            )?;
        }
    }
    let mut bands: Vec<f64> = array(&style["calibration"]["coefficients"])
        .iter()
        .map(|item| number(&item["band"]))
        .collect();
    bands.sort_by(f64::total_cmp);
    require(
        bands.windows(2).all(|pair| pair[0] != pair[1]),
        "calibration",
        "Duplicate calibration band",
    )?;
    if let Some(rank) = mosaic.get("rank_channel") {
        require(
            mosaic["pixel_selection"] == "highest" || mosaic["pixel_selection"] == "lowest",
            "mosaic.rank_channel",
            "Rank applies only to highest/lowest",
        )?;
        if mosaic["stage"] == "after_channels" {
            require(
                number(rank) <= channels as f64,
                "mosaic.rank_channel",
                "Rank channel is out of bounds",
            )?;
        }
    }
    let image = &style["image"];
    let format = image["format"].as_str().unwrap_or("png");
    if format == "jpeg" || image["alpha"] == "flatten" {
        require(
            image["alpha"] == "flatten" && image.get("background").is_some(),
            "image",
            "Flatten requires background; JPEG requires flatten",
        )?;
    }
    if let Some(color) = image["background"].as_str() {
        require(
            color.len() == 7 || color.to_ascii_lowercase().ends_with("ff"),
            "image.background",
            "Background must be opaque",
        )?;
    }
    if format == "png" {
        require(
            image.get("quality").is_none(),
            "image.quality",
            "PNG does not accept lossy quality",
        )?;
    }
    if image.get("lossless").is_some() {
        require(
            format == "webp",
            "image.lossless",
            "Lossless is a WebP option",
        )?;
    }
    if image["lossless"] == true {
        require(
            image.get("quality").is_none(),
            "image.quality",
            "Lossless output does not accept lossy quality",
        )?;
    }
    Ok(())
}
