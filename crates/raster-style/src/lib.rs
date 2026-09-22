//! Raster Style Spec v2's Q2 binding, independent of any HTTP framework.
//! Validation covers the schema and static cross-field constraints, not raster
//! data availability, expression compilation, statistics or engine support.
mod codec;
mod error;
mod json;
mod profile;
mod semantics;
mod style;

pub use codec::{decode_query, encode_query, json_to_query, query_to_json, Codec, Options};
pub use error::{Error, Result};
pub use json::canonical_json;
pub use style::Style;
