//! Raster Style Spec v3's Q3 binding, independent of any HTTP framework.
//! Validation covers the schema and static cross-field constraints, not raster
//! data availability, expression compilation, statistics or engine support.
mod codec;
mod error;
mod json;
mod profile;
mod schema;
mod schema_cache;
mod schema_number;
mod schema_pattern;
mod semantics;
mod style;

pub use codec::{decode_query, encode_query, json_to_query, query_to_json, Codec, Options};
pub use error::{Error, Result};
pub use json::canonical_json;
pub use schema::{
    validate_json, SchemaRegistry, ValidationReport, CORE_SCHEMA_URL, MOSAIC_SCHEMA_URL,
    TILE_SCHEMA_URL,
};
pub use style::Style;
