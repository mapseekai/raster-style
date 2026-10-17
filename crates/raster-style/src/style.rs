use std::cell::Cell;

use serde::{de, de::DeserializeSeed, Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::error::{Error, Result};
use crate::json::{canonical_value, parse_strict, StrictSeed};
use crate::schema::{
    default_schemas, has_extension, SchemaRegistry, ValidationReport, TILE_SCHEMA_URL,
};
use crate::semantics::validate_semantics;

/// A normalized v3 document. Unknown declared extensions are preserved; inspect validation before execution.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(transparent)]
pub struct Style {
    value: Value,
    #[serde(skip)]
    validation: ValidationReport,
}

impl Style {
    /// Parse with the embedded registry, preserving unknown declarations as incomplete.
    ///
    /// # Errors
    /// Returns JSON, budget, schema and static-semantic errors; use a custom
    /// [`SchemaRegistry`] to register third-party schema resources.
    pub fn from_json(text: &str) -> Result<Self> {
        Self::from_validated_value(parse_strict(text)?)
    }

    /// Programmatic values take the same binary64, budget and validation path as raw JSON.
    ///
    /// # Errors
    /// Returns the serialization errors or the validation errors of [`Self::from_json`].
    pub fn from_value(value: Value) -> Result<Self> {
        Self::from_json(&canonical_value(&value)?)
    }

    pub(crate) fn from_validated_value(value: Value) -> Result<Self> {
        Self::from_value_in_registry(value, default_schemas()?)
    }

    pub(crate) fn from_value_in_registry(
        mut value: Value,
        schemas: &SchemaRegistry,
    ) -> Result<Self> {
        schemas.check(&value)?;
        crate::profile::normalize_profile(&mut value)?;
        validate_semantics(&value)?;
        normalize_colors(&mut value);
        canonical_value(&value)?;
        let validation = schemas.check(&value)?;
        Ok(Self { value, validation })
    }

    /// Borrow the report snapshot captured when this immutable style was constructed.
    /// Later schema registrations do not update it; parse again to obtain a fresh report.
    pub fn validation(&self) -> &ValidationReport {
        &self.validation
    }

    /// Execution support is independent of schema validity and uses exact versioned URLs.
    ///
    /// # Errors
    /// Returns `E_SCHEMA_UNRESOLVED` for incomplete validation and
    /// `E_UNSUPPORTED_EXTENSION` when the executor's list omits a declaration.
    pub fn require_extension_support(&self, supported: &[&str]) -> Result<()> {
        if !self.validation.complete {
            return Err(Error::new(
                "E_SCHEMA_UNRESOLVED",
                "Complete validation is required before execution",
            ));
        }
        if let Some(declarations) = self.value["extensions"].as_array() {
            for declaration in declarations {
                let url = declaration.as_str().expect("core-validated schema URL");
                if !supported.contains(&url) {
                    return Err(Error::new(
                        "E_UNSUPPORTED_EXTENSION",
                        "Executor does not support this exact extension version",
                    )
                    .at(url));
                }
            }
        }
        Ok(())
    }

    /// Borrow the normalized document without permitting mutation.
    pub fn as_value(&self) -> &Value {
        &self.value
    }
    /// Transfer ownership of the normalized document, discarding the report snapshot.
    pub fn into_value(self) -> Value {
        self.value
    }
    /// Serialize the normalized document as RFC 8785 canonical JSON.
    ///
    /// # Errors
    /// Returns `E_JSON` on serialization failure or `E_LIMIT` if the byte budget is exceeded.
    pub fn to_json(&self) -> Result<String> {
        canonical_value(&self.value)
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
    let mut paths = vec!["/renderer/color"];
    if has_extension(style, TILE_SCHEMA_URL) {
        paths.push("/raster:tile/background");
    }
    for path in paths {
        if let Some(color) = style.pointer_mut(path) {
            normalize_color(color);
        }
    }
    let Some(color_map) = style.pointer_mut("/renderer/color_mapping") else {
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
