use crate::error::{Error, Result};
use crate::json::canonical_value;
use serde_json::{Map, Value};
fn failure(path: &str, message: &str) -> Error {
    Error::new("E_SEMANTIC", message).at(path)
}

pub(crate) fn decode_formula(text: &str, post: bool) -> Result<Value> {
    let steps: Vec<_> = text.split(',').collect();
    if steps.len() > 64 {
        return Err(failure("effects", "At most 64 operations are allowed"));
    }
    let mut result = Vec::new();
    for step in steps {
        let t: Vec<_> = step
            .split([' ', '\t', '\r', '\n'])
            .filter(|s| !s.is_empty())
            .collect();
        let op = t.first().copied().unwrap_or("");
        let expected = match op {
            "gamma" => 3,
            "sigmoidal" => 4,
            "saturation" => 2,
            "brightness" | "contrast" if post => 3,
            "grayscale" | "invert" if post => 2,
            _ => 0,
        };
        if expected == 0 || t.len() != expected {
            return Err(failure("effects", "Invalid operation or argument count"));
        }
        let mut item = Map::new();
        item.insert("op".into(), Value::from(op));
        if op == "grayscale" {
            item.insert("method".into(), Value::from(t[1]));
        } else {
            let start = if op == "saturation" {
                1
            } else {
                item.insert("channels".into(), Value::from(t[1]));
                2
            };
            for (i, token) in t.iter().enumerate().skip(start) {
                let v: f64 = serde_json::from_str(token)
                    .map_err(|_| failure("effects", "Expected a finite numeric argument"))?;
                if !v.is_finite() {
                    return Err(failure("effects", "Expected a finite numeric argument"));
                }
                let key = if op == "sigmoidal" {
                    if i == 2 {
                        "contrast"
                    } else {
                        "midpoint"
                    }
                } else {
                    "value"
                };
                item.insert(key.into(), Value::from(v));
            }
        }
        result.push(Value::Object(item));
    }
    Ok(Value::Array(result))
}

pub(crate) fn encode_formula(value: &Value) -> Result<String> {
    let mut steps = Vec::new();
    for item in value.as_array().expect("schema-validated operations") {
        let mut args = vec![item["op"].as_str().unwrap().to_owned()];
        for k in ["channels", "method"] {
            if let Some(v) = item.get(k) {
                args.push(v.as_str().unwrap().into());
            }
        }
        for k in ["value", "contrast", "midpoint"] {
            if let Some(v) = item.get(k) {
                args.push(canonical_value(v)?);
            }
        }
        steps.push(args.join(" "));
    }
    Ok(steps.join(", "))
}

pub(crate) fn normalize_profile(document: &mut Value) -> Result<()> {
    let style = &mut document["renderer"];
    let mut channels = 1;
    if let Some(expression) = style["expression"].as_str() {
        let parts: Vec<_> = expression
            .split(';')
            .map(|s| s.trim_matches([' ', '\t', '\r', '\n']))
            .collect();
        if parts.len() > 3
            || parts
                .iter()
                .any(|s| s.is_empty() || s.chars().count() > 2048)
        {
            return Err(failure("renderer.expression", "Invalid expression length"));
        }
        channels = parts.len();
        style["expression"] = Value::from(parts.join(";"));
    }
    if let Some(bands) = style["bidx"].as_array() {
        channels = bands.len();
    }
    if let Some(intervals) = style["colormap"].as_array() {
        let mut end = f64::NEG_INFINITY;
        for entry in intervals {
            let lo = entry[0][0].as_f64().unwrap();
            let hi = entry[0][1].as_f64().unwrap();
            if lo >= hi || lo < end {
                return Err(failure(
                    "renderer.colormap",
                    "Intervals must increase and not overlap",
                ));
            }
            end = hi;
        }
    } else if let Some(entries) = style["colormap"].as_object() {
        for key in entries.keys() {
            let v: f64 = key
                .parse()
                .map_err(|_| failure("renderer.colormap", "Invalid integer key"))?;
            if v.abs() > 9_007_199_254_740_991.0 {
                return Err(failure(
                    "renderer.colormap",
                    "Colormap keys must be safe integers",
                ));
            }
        }
    }
    for key in ["color_formula", "post_color_formula"] {
        if let Some(steps) = document
            .get_mut("effects")
            .and_then(|v| v.get_mut(key))
            .and_then(Value::as_array_mut)
        {
            for item in steps {
                if item["op"] != "saturation" && item["op"] != "grayscale" {
                    if item.get("channels").is_none() {
                        item["channels"] =
                            Value::from(if key == "color_formula" && channels == 1 {
                                "r"
                            } else {
                                "rgb"
                            });
                    }
                    if key == "color_formula"
                        && item["channels"]
                            .as_str()
                            .unwrap()
                            .chars()
                            .any(|c| "rgb".find(c).is_none_or(|i| i >= channels))
                    {
                        return Err(failure(
                            "effects.color_formula",
                            "Selected channel does not exist",
                        ));
                    }
                } else if key == "color_formula" && channels != 3 {
                    return Err(failure(
                        "effects.color_formula",
                        "Saturation requires three output channels",
                    ));
                }
            }
        }
    }
    Ok(())
}
