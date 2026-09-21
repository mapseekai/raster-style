use std::collections::HashSet;
use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::{Map, Number, Value};

use crate::error::{Error, Result};
use crate::json::{canonical_value, parse_strict};
use crate::style::{validator, Style};

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub max_query_bytes: usize,
    pub max_parameters: usize,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            max_query_bytes: 8192,
            max_parameters: 256,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Codec {
    options: Options,
}

#[derive(Deserialize)]
struct Binding {
    key: String,
    path: String,
    codec: String,
}
#[derive(Deserialize)]
struct Registry {
    bindings: Vec<Binding>,
}
static BINDINGS: OnceLock<std::result::Result<Vec<Binding>, String>> = OnceLock::new();

fn bindings() -> Result<&'static [Binding]> {
    BINDINGS
        .get_or_init(|| {
            let mut registry: Registry =
                serde_json::from_str(include_str!("../assets/query-bindings-v2.json"))
                    .map_err(|error| error.to_string())?;
            registry
                .bindings
                .sort_by(|left, right| left.key.cmp(&right.key));
            Ok(registry.bindings)
        })
        .as_deref()
        .map_err(|_| Error::new("E_CONFIG", "Invalid embedded binding registry"))
}

fn escape_component(text: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut output = String::with_capacity(text.len());
    for &byte in text.as_bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            output.push(byte as char);
        } else {
            output.push('%');
            output.push(HEX[(byte >> 4) as usize] as char);
            output.push(HEX[(byte & 15) as usize] as char);
        }
    }
    output
}

fn unescape_component(text: &str) -> Result<String> {
    let bytes = text.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        if !(0x21..=0x7e).contains(&byte) || byte == b'+' || byte == b'#' {
            return Err(Error::new(
                "E_QUERY_SYNTAX",
                "Query components must be URI-encoded ASCII",
            ));
        }
        if byte == b'%' {
            let hex = bytes
                .get(index + 1..index + 3)
                .ok_or_else(|| Error::new("E_QUERY_SYNTAX", "Incomplete percent escape"))?;
            let high = (hex[0] as char).to_digit(16);
            let low = (hex[1] as char).to_digit(16);
            match (high, low) {
                (Some(high), Some(low)) => output.push((high * 16 + low) as u8),
                _ => return Err(Error::new("E_QUERY_SYNTAX", "Invalid percent escape")),
            }
            index += 3;
        } else {
            output.push(byte);
            index += 1;
        }
    }
    String::from_utf8(output)
        .map_err(|_| Error::new("E_QUERY_SYNTAX", "Invalid UTF-8 query component"))
}

fn numeric(text: &str, integer: bool) -> Result<Value> {
    if text.bytes().any(|byte| byte.is_ascii_whitespace()) {
        return Err(Error::new("E_QUERY_SYNTAX", "Expected a numeric token"));
    }
    let number: f64 = serde_json::from_str(text)
        .map_err(|_| Error::new("E_QUERY_SYNTAX", "Expected a finite numeric token"))?;
    if !number.is_finite()
        || (integer && (number.fract() != 0.0 || number.abs() > 9_007_199_254_740_991.0))
    {
        return Err(Error::new(
            "E_QUERY_SYNTAX",
            "Expected a finite numeric token",
        ));
    }
    Ok(Value::Number(Number::from_f64(number).ok_or_else(
        || Error::new("E_QUERY_SYNTAX", "Non-finite number"),
    )?))
}

fn encode_value(value: &Value, codec: &str) -> Result<String> {
    match codec {
        "string" => Ok(value.as_str().expect("schema-validated string").into()),
        "color" => Ok(value.as_str().expect("schema-validated color")[1..].into()),
        "boolean" | "integer" | "number" | "json" => canonical_value(value),
        "pair" => Ok(format!(
            "{},{}",
            canonical_value(&value[0])?,
            canonical_value(&value[1])?
        )),
        _ => Err(Error::new("E_CONFIG", "Unknown binding codec")),
    }
}

fn decode_value(text: &str, codec: &str) -> Result<Value> {
    match codec {
        "string" => Ok(Value::String(text.into())),
        "number" => numeric(text, false),
        "integer" => numeric(text, true),
        "boolean" => match text {
            "true" => Ok(Value::Bool(true)),
            "false" => Ok(Value::Bool(false)),
            _ => Err(Error::new("E_QUERY_SYNTAX", "Expected true or false")),
        },
        "color" => {
            if text.len() != 8 || !text.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err(Error::new("E_QUERY_SYNTAX", "Expected 8-digit RGBA"));
            }
            Ok(Value::String(format!("#{}", text.to_ascii_lowercase())))
        }
        "json" => parse_strict(text),
        "pair" => {
            let parts: Vec<_> = text.split(',').collect();
            if parts.len() != 2 {
                return Err(Error::new("E_QUERY_SYNTAX", "Expected a numeric pair"));
            }
            Ok(Value::Array(vec![
                numeric(parts[0], false)?,
                numeric(parts[1], false)?,
            ]))
        }
        _ => Err(Error::new("E_CONFIG", "Unknown binding codec")),
    }
}

fn get_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    for part in path.split('.') {
        current = current.get(part)?;
    }
    Some(current)
}
fn set_path(value: &mut Value, path: &str, item: Value) {
    let parts: Vec<_> = path.split('.').collect();
    let mut current = value;
    for &part in &parts[..parts.len() - 1] {
        current = current
            .as_object_mut()
            .expect("registry-controlled path")
            .entry(part)
            .or_insert_with(|| Value::Object(Map::new()));
    }
    current
        .as_object_mut()
        .expect("registry-controlled path")
        .insert(parts[parts.len() - 1].into(), item);
}

impl Codec {
    pub fn new(options: Options) -> Result<Self> {
        if options.max_query_bytes == 0 || options.max_parameters == 0 {
            return Err(Error::new("E_CONFIG", "Budgets must be positive"));
        }
        validator()?;
        bindings()?;
        Ok(Self { options })
    }

    pub fn encode_query(&self, style: &Style) -> Result<String> {
        let mut pairs = Vec::new();
        for binding in bindings()? {
            let Some(value) = get_path(style.as_value(), &binding.path) else {
                continue;
            };
            let repeated = binding.codec.starts_with("repeat_");
            let values = if repeated {
                value.as_array().expect("schema-validated array").as_slice()
            } else {
                std::slice::from_ref(value)
            };
            for item in values {
                let encoded = encode_value(item, binding.codec.trim_start_matches("repeat_"))?;
                pairs.push(format!(
                    "{}={}",
                    escape_component(&binding.key),
                    escape_component(&encoded)
                ));
                if pairs.len() > self.options.max_parameters {
                    return Err(Error::new("E_LIMIT", "Query parameter budget exceeded"));
                }
            }
        }
        let query = pairs.join("&");
        if query.len() > self.options.max_query_bytes {
            return Err(Error::new(
                "E_LIMIT",
                "Inline query is too long; use a style reference",
            ));
        }
        Ok(query)
    }

    pub fn decode_query(&self, query: &str) -> Result<Style> {
        let raw = query.strip_prefix('?').unwrap_or(query);
        if raw.len() > self.options.max_query_bytes {
            return Err(Error::new("E_LIMIT", "Query byte budget exceeded"));
        }
        let parts: Vec<_> = if raw.is_empty() {
            Vec::new()
        } else {
            raw.split('&').collect()
        };
        if parts.len() > self.options.max_parameters {
            return Err(Error::new("E_LIMIT", "Query parameter budget exceeded"));
        }
        let registry = bindings()?;
        let mut document = Value::Object(Map::new());
        let mut seen = HashSet::new();
        for part in parts {
            let (raw_key, raw_value) = part
                .split_once('=')
                .filter(|(key, _)| !key.is_empty())
                .ok_or_else(|| Error::new("E_QUERY_SYNTAX", "Expected key=value"))?;
            let key = unescape_component(raw_key)?;
            let value = unescape_component(raw_value)?;
            let binding = registry
                .iter()
                .find(|binding| binding.key == key)
                .ok_or_else(|| {
                    Error::new("E_UNKNOWN_PARAMETER", "Unknown Q2 query parameter").at(&key)
                })?;
            let repeated = binding.codec.starts_with("repeat_");
            if !seen.insert(key.clone()) && !repeated {
                return Err(
                    Error::new("E_DUPLICATE_PARAMETER", "Duplicate singleton parameter").at(key),
                );
            }
            let decoded = decode_value(&value, binding.codec.trim_start_matches("repeat_"))?;
            if repeated {
                if get_path(&document, &binding.path).is_none() {
                    set_path(&mut document, &binding.path, Value::Array(Vec::new()));
                }
                let pointer = format!("/{}", binding.path.replace('.', "/"));
                document
                    .pointer_mut(&pointer)
                    .and_then(Value::as_array_mut)
                    .expect("registry-controlled array")
                    .push(decoded);
            } else {
                set_path(&mut document, &binding.path, decoded);
            }
        }
        Style::from_validated_value(document)
    }

    pub fn json_to_query(&self, json: &str) -> Result<String> {
        self.encode_query(&Style::from_json(json)?)
    }
    pub fn query_to_json(&self, query: &str) -> Result<String> {
        self.decode_query(query)?.to_json()
    }
}

pub fn encode_query(style: &Style) -> Result<String> {
    Codec::default().encode_query(style)
}
pub fn decode_query(query: &str) -> Result<Style> {
    Codec::default().decode_query(query)
}
pub fn json_to_query(json: &str) -> Result<String> {
    Codec::default().json_to_query(json)
}
pub fn query_to_json(query: &str) -> Result<String> {
    Codec::default().query_to_json(query)
}
