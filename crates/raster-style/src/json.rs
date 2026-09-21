use std::cell::Cell;
use std::fmt;

use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};

use crate::error::{Error, Result};

pub const MAX_JSON_BYTES: usize = 2 * 1024 * 1024;
const MAX_DEPTH: usize = 64;
const MAX_NODES: usize = 300_000;

#[derive(Clone, Copy)]
pub(crate) struct StrictSeed<'a> {
    depth: usize,
    nodes: &'a Cell<usize>,
}

impl<'a> StrictSeed<'a> {
    pub(crate) fn root(nodes: &'a Cell<usize>) -> Self {
        Self { depth: 0, nodes }
    }
    fn child(self) -> Self {
        Self {
            depth: self.depth + 1,
            nodes: self.nodes,
        }
    }
}

impl<'de> DeserializeSeed<'de> for StrictSeed<'_> {
    type Value = Value;
    fn deserialize<D: de::Deserializer<'de>>(
        self,
        deserializer: D,
    ) -> std::result::Result<Value, D::Error> {
        self.nodes.set(self.nodes.get() + 1);
        if self.depth > MAX_DEPTH || self.nodes.get() > MAX_NODES {
            return Err(de::Error::custom("JSON complexity budget exceeded"));
        }
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for StrictSeed<'_> {
    type Value = Value;
    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a finite JSON value without duplicate keys")
    }
    fn visit_bool<E: de::Error>(self, value: bool) -> std::result::Result<Value, E> {
        Ok(Value::Bool(value))
    }
    fn visit_unit<E: de::Error>(self) -> std::result::Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_str<E: de::Error>(self, value: &str) -> std::result::Result<Value, E> {
        Ok(Value::String(value.into()))
    }
    fn visit_string<E: de::Error>(self, value: String) -> std::result::Result<Value, E> {
        Ok(Value::String(value))
    }
    fn visit_i64<E: de::Error>(self, value: i64) -> std::result::Result<Value, E> {
        self.visit_f64(value as f64)
    }
    fn visit_u64<E: de::Error>(self, value: u64) -> std::result::Result<Value, E> {
        self.visit_f64(value as f64)
    }
    fn visit_f64<E: de::Error>(self, value: f64) -> std::result::Result<Value, E> {
        Number::from_f64(value)
            .map(Value::Number)
            .ok_or_else(|| E::custom("JSON numbers must be finite"))
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> std::result::Result<Value, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(self.child())? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> std::result::Result<Value, A::Error> {
        let mut values = Map::new();
        while let Some(key) = map.next_key::<String>()? {
            if values.contains_key(&key) {
                return Err(de::Error::custom("Duplicate JSON key"));
            }
            values.insert(key, map.next_value_seed(self.child())?);
        }
        Ok(Value::Object(values))
    }
}

pub(crate) fn parse_strict(text: &str) -> Result<Value> {
    if text.len() > MAX_JSON_BYTES {
        return Err(Error::new("E_LIMIT", "JSON byte budget exceeded"));
    }
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let nodes = Cell::new(0);
    let value = StrictSeed::root(&nodes)
        .deserialize(&mut deserializer)
        .map_err(|error| {
            if error.to_string().contains("complexity budget") {
                Error::new("E_LIMIT", "JSON complexity budget exceeded")
            } else {
                Error::new(
                    "E_JSON",
                    "Malformed JSON, duplicate key, or invalid Unicode/number",
                )
            }
        })?;
    deserializer
        .end()
        .map_err(|_| Error::new("E_JSON", "Trailing JSON content"))?;
    Ok(value)
}

pub(crate) fn canonical_value(value: &Value) -> Result<String> {
    let text = serde_json_canonicalizer::to_string(value)
        .map_err(|_| Error::new("E_JSON", "JCS serialization failed"))?;
    if text.len() > MAX_JSON_BYTES {
        return Err(Error::new("E_LIMIT", "JSON byte budget exceeded"));
    }
    Ok(text)
}

/// Strict JSON to RFC 8785, with ECMAScript-compatible binary64 number semantics.
pub fn canonical_json(text: &str) -> Result<String> {
    canonical_value(&parse_strict(text)?)
}
