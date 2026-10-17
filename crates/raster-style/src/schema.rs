use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use jsonschema::{Draft, Retrieve, Uri, Validator};
use serde::Serialize;
use serde_json::{json, Value};

use crate::error::{Error, Result};
use crate::json::{canonical_value, parse_strict};
use crate::schema_cache::SchemaCache;
use crate::style::Style;

/// Exact identity of the embedded Raster Style 3.0 core schema.
pub const CORE_SCHEMA_URL: &str =
    "https://mapseekai.github.io/raster-style/spec/v3/raster-style-v3.schema.json";
/// Exact identity of the embedded Mosaic 1.0.0 extension schema.
pub const MOSAIC_SCHEMA_URL: &str =
    "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json";
/// Exact identity of the embedded Tile 1.0.0 extension schema.
pub const TILE_SCHEMA_URL: &str =
    "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json";
const DRAFT: &str = "https://json-schema.org/draft/2020-12/schema";
const CORE: &str = include_str!("../assets/raster-style-v3.schema.json");

/// Preservation is not full validation when a declared schema is unavailable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    /// All declared resources resolved and passed validation at construction time.
    pub complete: bool,
    /// Unregistered declarations in their original order; no remote lookup is performed.
    pub unresolved_schemas: Vec<String>,
}

/// Offline, reusable schema registry. A URL is an identity, never a field-name hint.
/// Registration needs exclusive access; parsing and validation can run concurrently.
///
/// # Examples
///
/// ```
/// use raster_style::{SchemaRegistry, TILE_SCHEMA_URL};
/// let registry = SchemaRegistry::new()?;
/// let style = registry.parse_json(r#"{
///   "version":"3.0", "renderer":{"type":"gray","bidx":[1]},
///   "extensions":["https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"],
///   "raster:tile":{"format":"png"}
/// }"#)?;
/// assert!(style.validation().complete);
/// style.require_extension_support(&[TILE_SCHEMA_URL])?;
/// # Ok::<(), raster_style::Error>(())
/// ```
pub struct SchemaRegistry {
    resources: Arc<HashMap<String, Value>>,
    validators: Mutex<SchemaCache>,
    core: Validator,
    core_fields: HashSet<String>,
}

impl SchemaRegistry {
    /// Create an offline registry containing the core and official extension schemas.
    ///
    /// # Errors
    /// Returns `E_CONFIG` if an embedded resource cannot be initialized.
    pub fn new() -> Result<Self> {
        let core: Value = serde_json::from_str(CORE)
            .map_err(|error| Error::new("E_CONFIG", error.to_string()))?;
        let validator = jsonschema::options()
            .with_draft(Draft::Draft202012)
            .with_keyword("multipleOf", crate::schema_number::multiple_of)
            .with_keyword("pattern", crate::schema_pattern::pattern)
            .with_retriever(OfflineRetriever::default())
            .build(&core)
            .map_err(|error| Error::new("E_CONFIG", error.to_string()))?;
        let mut registry = Self {
            core_fields: core["properties"]
                .as_object()
                .expect("embedded schema properties")
                .keys()
                .cloned()
                .collect(),
            resources: Arc::new(HashMap::new()),
            validators: Mutex::new(SchemaCache::default()),
            core: validator,
        };
        for text in [
            CORE,
            include_str!("../assets/mosaic-v1.0.0.schema.json"),
            include_str!("../assets/tile-v1.0.0.schema.json"),
        ] {
            registry.register(parse_strict(text)?)?;
        }
        Ok(registry)
    }

    /// Register an immutable draft 2020-12 resource. Register referenced resources separately.
    /// Previously constructed styles retain their validation report snapshots.
    ///
    /// # Errors
    /// Returns a JSON/budget error for invalid input, or `E_CONFIG` for an invalid
    /// schema identity, draft, resource, duplicate registration or poisoned cache.
    pub fn register(&mut self, schema: Value) -> Result<()> {
        let schema = parse_strict(&canonical_value(&schema)?)?;
        let id = schema["$id"]
            .as_str()
            .filter(|id| schema_url(id))
            .ok_or_else(|| {
                Error::new(
                    "E_CONFIG",
                    "Schema $id must be an absolute HTTP(S) URL without a fragment",
                )
            })?;
        if self.resources.contains_key(id) {
            return Err(Error::new("E_CONFIG", "Schema identity is already registered").at(id));
        }
        if schema.get("$schema").is_some_and(|draft| draft != DRAFT) {
            return Err(Error::new(
                "E_CONFIG",
                "Extension composition requires JSON Schema draft 2020-12",
            )
            .at(id));
        }
        if !jsonschema::draft202012::meta::is_valid(&schema) {
            return Err(Error::new("E_CONFIG", "Invalid JSON Schema resource").at(id));
        }
        self.validators
            .get_mut()
            .map_err(|_| Error::new("E_CONFIG", "Schema cache lock is poisoned"))?
            .clear();
        Arc::make_mut(&mut self.resources).insert(id.to_owned(), schema);
        Ok(())
    }

    /// Explicit resolution only; callers own network policy, allowlists, budgets and timeouts.
    /// The callback is invoked once and its returned `$id` must equal `url` exactly.
    ///
    /// # Errors
    /// Propagates callback and registration failures; invalid or mismatched identities return `E_CONFIG`.
    pub fn resolve(
        &mut self,
        url: &str,
        resolver: impl FnOnce(&str) -> Result<Value>,
    ) -> Result<()> {
        if !schema_url(url) {
            return Err(Error::new("E_CONFIG", "Invalid schema URL").at(url));
        }
        let schema = resolver(url)?;
        if schema["$id"] != url {
            return Err(
                Error::new("E_CONFIG", "Resolved schema $id does not match the request").at(url),
            );
        }
        self.register(schema)
    }

    /// Parse and normalize a style without changing the input text.
    /// Unknown declarations are preserved with `complete=false`; this does not authorize execution.
    ///
    /// # Errors
    /// Returns JSON, budget, known-schema or static-semantic errors. A referenced
    /// resource missing from an available schema returns `E_SCHEMA_UNRESOLVED`.
    pub fn parse_json(&self, text: &str) -> Result<Style> {
        Style::from_value_in_registry(parse_strict(text)?, self)
    }

    /// Parse a style and return an owned snapshot of its validation completeness.
    ///
    /// # Errors
    /// Returns the same errors as [`Self::parse_json`]; known errors are never preserved as success.
    pub fn inspect_json(&self, text: &str) -> Result<ValidationReport> {
        Ok(self.parse_json(text)?.validation().clone())
    }

    /// Full validation includes all declared schemas and static cross-field semantics.
    /// Execution support must still be checked with [`Style::require_extension_support`].
    ///
    /// # Errors
    /// Returns parsing/validation errors, including `E_SCHEMA_UNRESOLVED` when any
    /// declared schema or required reference is unavailable.
    pub fn validate_json(&self, text: &str) -> Result<()> {
        let report = self.inspect_json(text)?;
        if !report.complete {
            return Err(Error::new(
                "E_SCHEMA_UNRESOLVED",
                "Complete validation requires every declared schema",
            )
            .at(report.unresolved_schemas.join(", ")));
        }
        Ok(())
    }

    pub(crate) fn is_core_field(&self, key: &str) -> bool {
        self.core_fields.contains(key)
    }

    pub(crate) fn check(&self, value: &Value) -> Result<ValidationReport> {
        if !crate::schema_pattern::is_valid(&self.core, value)? {
            return Err(Error::new(
                "E_SCHEMA",
                "Raster style does not match the core schema",
            ));
        }
        let mut known = Vec::new();
        let mut report = ValidationReport {
            complete: true,
            unresolved_schemas: Vec::new(),
        };
        if let Some(declarations) = value["extensions"].as_array() {
            for declaration in declarations {
                let url = declaration.as_str().expect("core-validated schema URL");
                if self.resources.contains_key(url) {
                    known.push(url);
                } else {
                    report.complete = false;
                    report.unresolved_schemas.push(url.to_owned());
                }
            }
        }
        known.sort_unstable();
        let key = canonical_value(&json!([known, report.complete]))?;
        let slot = self
            .validators
            .lock()
            .map_err(|_| Error::new("E_CONFIG", "Schema cache lock is poisoned"))?
            .slot(key);
        let schema = slot
            .get_or_init(|| {
                // Only per-key initialization is serialized; the cache mutex is released.
                let mut refs = vec![json!({"$ref":CORE_SCHEMA_URL})];
                refs.extend(known.iter().map(|url| json!({"$ref":url})));
                let mut composition = json!({"$schema":DRAFT,"allOf":refs});
                if report.complete {
                    composition["unevaluatedProperties"] = json!(false);
                }
                let retriever = OfflineRetriever {
                    resources: Arc::clone(&self.resources),
                    ..OfflineRetriever::default()
                };
                jsonschema::options()
                    .with_draft(Draft::Draft202012)
                    .with_keyword("multipleOf", crate::schema_number::multiple_of)
                    .with_keyword("pattern", crate::schema_pattern::pattern)
                    .with_retriever(retriever.clone())
                    .build(&composition)
                    .map(Arc::new)
                    .map_err(|error| retriever.classify(error.to_string()))
            })
            .as_ref()
            .map_err(Clone::clone)?;
        if !crate::schema_pattern::is_valid(schema, value)? {
            return Err(Error::new(
                "E_SCHEMA",
                "Raster style does not match the composed schema",
            ));
        }
        Ok(report)
    }
}

/// Fully validate with the embedded offline registry.
///
/// # Errors
/// Returns the errors documented on [`SchemaRegistry::validate_json`].
pub fn validate_json(text: &str) -> Result<()> {
    default_schemas()?.validate_json(text)
}

pub(crate) fn has_extension(style: &Value, url: &str) -> bool {
    style["extensions"]
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item == url))
}

fn schema_url(url: &str) -> bool {
    (url.starts_with("https://") || url.starts_with("http://"))
        && !url.chars().any(|c| c.is_whitespace() || c == '#')
        && url
            .split_once("://")
            .is_some_and(|(_, rest)| !rest.is_empty())
}

#[derive(Clone, Default)]
struct OfflineRetriever {
    resources: Arc<HashMap<String, Value>>,
    missing: Arc<Mutex<Option<String>>>,
}
impl OfflineRetriever {
    fn classify(&self, message: String) -> Error {
        match self.missing.lock().ok().and_then(|missing| missing.clone()) {
            Some(url) => Error::new(
                "E_SCHEMA_UNRESOLVED",
                "A schema reference has not been registered",
            )
            .at(url),
            None => Error::new(
                "E_CONFIG",
                format!("Schema composition could not be compiled: {message}"),
            ),
        }
    }
}
impl Retrieve for OfflineRetriever {
    fn retrieve(
        &self,
        uri: &Uri<String>,
    ) -> std::result::Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(schema) = self.resources.get(uri.as_str()) {
            return Ok(schema.clone());
        }
        if let Ok(mut missing) = self.missing.lock() {
            *missing = Some(uri.to_string());
        }
        Err(format!("Schema resource has not been registered: {uri}").into())
    }
}

static DEFAULT_SCHEMAS: OnceLock<Result<SchemaRegistry>> = OnceLock::new();
pub(crate) fn default_schemas() -> Result<&'static SchemaRegistry> {
    DEFAULT_SCHEMAS
        .get_or_init(SchemaRegistry::new)
        .as_ref()
        .map_err(|error| Error::new("E_CONFIG", error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{decode_query, encode_query};

    fn fixtures() -> Value {
        serde_json::from_str(include_str!("../tests/data/schema-cases.json")).expect("fixture JSON")
    }

    #[test]
    fn regex_execution_errors_cannot_satisfy_schema_combinations() {
        let pattern = json!({"pattern": "^(?:(a|aa)+(?=b)|a+)$"});
        for constraint in [
            pattern.clone(),
            json!({"not": pattern}),
            json!({"anyOf": [pattern, true]}),
            json!({"if": pattern, "then": true, "else": true}),
            json!({"contains": pattern}),
        ] {
            let mut registry = SchemaRegistry::new().unwrap();
            let url = "https://example.test/regex-budget/v1.0.0/schema.json";
            registry
                .register(json!({"$id":url,"properties":{"vendor":constraint}}))
                .unwrap();
            let value = if constraint.get("contains").is_some() {
                json!(["a".repeat(28)])
            } else {
                json!("a".repeat(28))
            };
            let style = json!({"version":"3.0","renderer":{"type":"gray","bidx":[1]},"extensions":[url],"vendor":value});
            assert_eq!(
                registry.validate_json(&style.to_string()).unwrap_err().code,
                "E_LIMIT",
                "{constraint}"
            );
            // An earlier request's resource error must not poison a later request.
            registry
                .validate_json(r#"{"version":"3.0","renderer":{"type":"gray","bidx":[1]}}"#)
                .unwrap();
        }
    }

    #[test]
    fn schema_cases() {
        let fixtures = fixtures();
        for case in fixtures["cases"].as_array().unwrap() {
            let run = || -> Result<Value> {
                let mut registry = SchemaRegistry::new()?;
                for name in case["schemas"].as_array().unwrap() {
                    registry.register(fixtures["resources"][name.as_str().unwrap()].clone())?;
                }
                let text = canonical_value(&case["style"])?;
                let style = registry.parse_json(&text)?;
                match case["op"].as_str().unwrap() {
                    "validate" => registry.validate_json(&text)?,
                    "support" => {
                        let supported: Vec<&str> = case["supported"]
                            .as_array()
                            .map(|values| values.iter().map(|v| v.as_str().unwrap()).collect())
                            .unwrap_or_default();
                        style.require_extension_support(&supported)?;
                    }
                    _ => {}
                }
                Ok(json!(style.validation()))
            };
            let result = run();
            if let Some(code) = case["code"].as_str() {
                assert_eq!(result.unwrap_err().code, code, "{}", case["name"]);
            } else {
                assert_eq!(result.unwrap(), case["expected"], "{}", case["name"]);
            }
        }
    }

    #[test]
    fn explicit_resolution_and_identity() {
        let fixtures = fixtures();
        let case = fixtures["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == "schema-defines-unprefixed-and-multiple-fields")
            .unwrap();
        let text = canonical_value(&case["style"]).unwrap();
        let mut registry = SchemaRegistry::new().unwrap();
        assert!(!registry.inspect_json(&text).unwrap().complete);
        let url = fixtures["resources"]["multi"]["$id"].as_str().unwrap();
        let mut calls = 0;
        registry
            .resolve(url, |request| {
                calls += 1;
                assert_eq!(request, url);
                Ok(fixtures["resources"]["multi"].clone())
            })
            .unwrap();
        registry.validate_json(&text).unwrap();
        assert_eq!(calls, 1);
        assert_eq!(
            registry
                .register(fixtures["resources"]["multi"].clone())
                .unwrap_err()
                .code,
            "E_CONFIG"
        );
        assert_eq!(
            registry
                .resolve("https://example.test/wrong/v1/schema.json", |_| Ok(
                    fixtures["resources"]["multi"].clone()
                ))
                .unwrap_err()
                .code,
            "E_CONFIG"
        );
    }

    #[test]
    fn generic_extension_query() {
        let text = r##"{"version":"3.0","renderer":{"type":"gray","bidx":[1]},"extensions":["https://example.test/unresolved/v7.2.3/schema.json"],"unrelated_field":{"color":"#ABCDEF","nested":[null,true,"中+文",2]},"a.b/c~d":false,"__proto__":{"safe":true},"😀":1,"\ue000":2}"##;
        let style = Style::from_json(text).unwrap();
        let query = encode_query(&style).unwrap();
        let decoded = decode_query(&query).unwrap();
        assert_eq!(style.to_json().unwrap(), decoded.to_json().unwrap());
        assert!(!decoded.validation().complete);
    }

    #[test]
    fn complete_reference_validation() {
        let fixtures = fixtures();
        let mut registry = SchemaRegistry::new().unwrap();
        registry
            .register(fixtures["resources"]["square"].clone())
            .unwrap();
        let vectors: Value =
            serde_json::from_str(include_str!("../tests/data/rendering-vectors.json")).unwrap();
        for vector in vectors.as_array().unwrap() {
            registry
                .validate_json(&canonical_value(&vector["style"]).unwrap())
                .unwrap_or_else(|error| panic!("{}: {error}", vector["name"]));
        }
    }

    #[test]
    fn registered_extension_query_round_trip() {
        let fixtures = fixtures();
        for case in fixtures["cases"].as_array().unwrap() {
            if case["expected"]["complete"] != true {
                continue;
            }
            let mut registry = SchemaRegistry::new().unwrap();
            for name in case["schemas"].as_array().unwrap() {
                registry
                    .register(fixtures["resources"][name.as_str().unwrap()].clone())
                    .unwrap();
            }
            let original = registry
                .parse_json(&canonical_value(&case["style"]).unwrap())
                .unwrap();
            let decoded = decode_query(&encode_query(&original).unwrap()).unwrap();
            let restored = registry.parse_json(&decoded.to_json().unwrap()).unwrap();
            assert!(restored.validation().complete, "{}", case["name"]);
            assert_eq!(
                original.to_json().unwrap(),
                restored.to_json().unwrap(),
                "{}",
                case["name"]
            );
        }
    }
    #[test]
    fn declaration_order_reuses_the_compiled_schema() {
        let mut registry = SchemaRegistry::new().unwrap();
        let urls: Vec<String> = (0..5)
            .map(|i| format!("https://example.test/order/{i}/v1.0.0/schema.json"))
            .collect();
        for url in &urls {
            registry
                .register(json!({"$id":url,"type":"object"}))
                .unwrap();
        }
        let mut count = 0;
        fn permute(
            registry: &SchemaRegistry,
            urls: &mut [String],
            position: usize,
            count: &mut usize,
        ) {
            if position == urls.len() {
                let value = json!({"version":"3.0","renderer":{"type":"gray","bidx":[1]},"extensions":urls});
                let before = value.clone();
                assert!(registry.check(&value).unwrap().complete);
                assert_eq!(value, before);
                assert_eq!(registry.validators.lock().unwrap().len(), 1);
                *count += 1;
                return;
            }
            for index in position..urls.len() {
                urls.swap(position, index);
                permute(registry, urls, position + 1, count);
                urls.swap(position, index);
            }
        }
        permute(&registry, &mut urls.clone(), 0, &mut count);
        assert_eq!(count, 120);
    }
}
