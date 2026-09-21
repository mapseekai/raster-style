use std::cell::Cell;
use std::sync::OnceLock;

use serde::{de, de::DeserializeSeed, Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::error::{Error, Result};
use crate::json::{canonical_value, parse_strict, StrictSeed};
use crate::semantics::validate_semantics;

const SCHEMA: &str = include_str!("../assets/raster-style-v2.schema.json");
static VALIDATOR: OnceLock<std::result::Result<jsonschema::Validator, String>> = OnceLock::new();

pub(crate) fn validator() -> Result<&'static jsonschema::Validator> {
    VALIDATOR
        .get_or_init(|| {
            let schema: Value = serde_json::from_str(SCHEMA).map_err(|error| error.to_string())?;
            jsonschema::validator_for(&schema).map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|_| Error::new("E_CONFIG", "Embedded schema could not be compiled"))
}

/// A validated, normalized document. No mutable reference to its value is exposed.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(transparent)]
pub struct Style(Value);

impl Style {
    pub fn from_json(text: &str) -> Result<Self> {
        Self::from_validated_value(parse_strict(text)?)
    }

    /// Programmatic values take the same binary64, budget and validation path as raw JSON.
    pub fn from_value(value: Value) -> Result<Self> {
        Self::from_json(&canonical_value(&value)?)
    }

    pub(crate) fn from_validated_value(mut value: Value) -> Result<Self> {
        if !validator()?.is_valid(&value) {
            return Err(Error::new(
                "E_SCHEMA",
                "Raster style does not match draft.2 schema",
            ));
        }
        validate_semantics(&value)?;
        normalize_colors(&mut value);
        canonical_value(&value)?;
        Ok(Self(value))
    }

    pub fn as_value(&self) -> &Value {
        &self.0
    }
    pub fn into_value(self) -> Value {
        self.0
    }
    pub fn to_json(&self) -> Result<String> {
        canonical_value(&self.0)
    }
}

impl<'de> Deserialize<'de> for Style {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> std::result::Result<Self, D::Error> {
        let nodes = Cell::new(0);
        let value = StrictSeed::root(&nodes).deserialize(deserializer)?;
        Self::from_validated_value(value).map_err(de::Error::custom)
    }
}

fn normalize_color(value: &mut Value) {
    if let Some(color) = value.as_str() {
        let mut normalized = color.to_ascii_lowercase();
        if normalized.len() == 7 {
            normalized.push_str("ff");
        }
        *value = Value::String(normalized);
    }
}

fn normalize_colors(style: &mut Value) {
    for path in [
        "/renderer/color",
        "/opacity/nodata_color",
        "/output/background",
    ] {
        if let Some(color) = style.pointer_mut(path) {
            normalize_color(color);
        }
    }
    let Some(color_map) = style.pointer_mut("/renderer/color_map") else {
        return;
    };
    for key in ["under", "over", "outside_color", "fallback_color"] {
        if let Some(color) = color_map.get_mut(key) {
            if color.as_str().is_some_and(|color| color.starts_with('#')) {
                normalize_color(color);
            }
        }
    }
    for key in ["stops", "entries"] {
        if let Some(entries) = color_map.get_mut(key).and_then(Value::as_array_mut) {
            for entry in entries {
                normalize_color(&mut entry["color"]);
            }
        }
    }
    if let Some(colors) = color_map.get_mut("colors").and_then(Value::as_array_mut) {
        for color in colors {
            normalize_color(color);
        }
    }
}
