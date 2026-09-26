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
    let channel_spec = &style["renderer"];
    let channels = if let Some(bands) = channel_spec.get("bidx") {
        array(bands).len()
    } else if let Some(expression) = channel_spec["expression"].as_str() {
        expression.split(';').count()
    } else {
        1
    };
    let renderer = channel_spec;
    let renderer_type = renderer["type"].as_str().unwrap_or_default();
    require(
        channels == if renderer_type == "rgb" { 3 } else { 1 },
        "kind",
        "Renderer channel cardinality mismatch",
    )?;
    let stretch = &style["stretch"];
    for key in ["rescale", "curves"] {
        if let Some(values) = stretch.get(key) {
            let count = array(values).len();
            require(
                count == 1 || count == channels,
                key,
                "Expected one value or one per channel",
            )?;
        }
    }
    for pair in array(&stretch["rescale"]) {
        require(
            number(&pair[0]) < number(&pair[1]),
            "rescale",
            "Range must increase",
        )?;
    }
    if let Some(pair) = stretch.get("percentiles") {
        require(
            number(&pair[0]) < number(&pair[1]),
            "percentiles",
            "Percentiles must increase",
        )?;
    }
    for curve in array(&stretch["curves"]) {
        require(
            array(curve)
                .iter()
                .all(|point| (0.0..=1.0).contains(&number(&point[1]))),
            "curves",
            "Curve output must be in [0,1]",
        )?;
        require(
            array(curve).windows(2).all(|pair| {
                number(&pair[0][0]) < number(&pair[1][0])
                    && number(&pair[0][1]) <= number(&pair[1][1])
            }),
            "curves",
            "Curve must be monotonic",
        )?;
    }
    let color_map = &renderer["color_mapping"];
    if renderer.get("colormap").is_some()
        && stretch["method"].as_str().unwrap_or("none") == "none"
        && style["effects"].get("color_formula").is_none()
    {
        require(
            stretch.get("range_policy").is_none(),
            "stretch.range_policy",
            "Native data colormaps use their own boundaries",
        )?;
    }
    let bypass = ["categorized", "single_color", "hillshade"].contains(&renderer_type)
        || color_map["domain"] == "data";
    if bypass {
        require(
            stretch["method"].as_str().unwrap_or("none") == "none"
                && style["effects"].get("color_formula").is_none(),
            "method",
            "Data-domain renderer must bypass stretch",
        )?;
        require(
            stretch.get("range_policy").is_none(),
            "stretch.range_policy",
            "Range policy requires a display-domain stretch",
        )?;
    }
    match color_map["mode"].as_str() {
        Some("continuous") => {
            let stops = array(&color_map["stops"]);
            require(
                stops
                    .windows(2)
                    .all(|pair| number(&pair[0]["value"]) < number(&pair[1]["value"])),
                "color_mapping.stops",
                "Stops must increase",
            )?;
            if color_map["domain"] == "normalized" {
                require(
                    stops
                        .iter()
                        .all(|stop| (0.0..=1.0).contains(&number(&stop["value"]))),
                    "color_mapping.stops",
                    "Normalized stops must be in [0,1]",
                )?;
            }
        }
        Some("discrete") => {
            let breaks = array(&color_map["breaks"]);
            require(
                array(&color_map["colors"]).len() + 1 == breaks.len(),
                "color_mapping",
                "Break/color cardinality mismatch",
            )?;
            require(
                increasing(breaks),
                "color_mapping.breaks",
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
                "color_mapping.entries",
                "Exact keys must be unique",
            )?;
        }
        _ => {}
    }
    let mosaic = &style["mosaic"];
    if renderer_type == "categorized" {
        for key in ["read", "reproject"] {
            if let Some(value) = style["resampling"].get(key) {
                require(
                    value == "nearest" || value == "mode",
                    key,
                    "Categorical rendering requires nearest or mode",
                )?;
            }
        }
        require(
            mosaic["pixel_selection"] != "mean" && mosaic["pixel_selection"] != "median",
            "pixel_selection",
            "Categorical rendering forbids arithmetic mosaic",
        )?;
    }
    if color_map["mode"] == "source" {
        require(
            style["calibration"]["mode"].as_str().unwrap_or("none") == "none",
            "calibration.mode",
            "Source palettes require unmodified category values",
        )?;
        if let Some(extensions) = style["extensions"].as_object() {
            require(
                extensions
                    .values()
                    .all(|extension| extension["stage"] == "after_color"),
                "extensions",
                "Source palettes allow only after_color extensions",
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
            "rank_channel",
            "Rank applies only to highest/lowest",
        )?;
        if mosaic["stage"] == "after_channels" {
            require(
                number(rank) <= channels as f64,
                "rank_channel",
                "Rank channel is out of bounds",
            )?;
        } else if renderer.get("bidx").is_some() || renderer.get("index").is_some() {
            let mut inputs: Vec<u64> = array(&renderer["bidx"])
                .iter()
                .map(|band| number(band) as u64)
                .collect();
            if let Some(bindings) = renderer["index"]["bindings"].as_object() {
                inputs.extend(bindings.values().map(|band| number(band) as u64));
            }
            inputs.sort_unstable();
            inputs.dedup();
            require(
                number(rank) <= inputs.len() as f64,
                "rank_channel",
                "Rank channel exceeds the distinct input band count",
            )?;
        }
    }
    let image = &style["image"];
    let format = image["format"].as_str().unwrap_or("png");
    if let Some(color) = image["background"].as_str() {
        require(
            color.len() == 7 || color.to_ascii_lowercase().ends_with("ff"),
            "background",
            "Background must be opaque",
        )?;
    }
    if format == "png" {
        require(
            image.get("quality").is_none(),
            "quality",
            "PNG does not accept lossy quality",
        )?;
    }
    if image.get("lossless").is_some() {
        require(format == "webp", "lossless", "Lossless is a WebP option")?;
    }
    if image["lossless"] == true {
        require(
            image.get("quality").is_none(),
            "quality",
            "Lossless output does not accept lossy quality",
        )?;
    }
    Ok(())
}
