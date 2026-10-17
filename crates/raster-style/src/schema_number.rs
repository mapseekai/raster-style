use jsonschema::paths::Location;
use jsonschema::{Keyword, ValidationError};
use num_bigint::BigInt;
use serde_json::{Map, Value};

use crate::json::canonical_value;

/// multipleOf compares exact decimals from the protocol's canonical binary64
/// representation. Adjacent representable non-multiples are never rounded in.
pub(crate) fn multiple_of<'a>(
    _parent: &'a Map<String, Value>,
    schema: &'a Value,
    _location: Location,
) -> Result<Box<dyn for<'i> Keyword<'i>>, ValidationError<'a>> {
    let divisor = schema
        .as_f64()
        .filter(|value| value.is_finite() && *value > 0.0);
    if divisor.is_none() {
        return Err(ValidationError::custom(
            "multipleOf must be a positive number",
        ));
    }
    let decimal = Decimal::from_value(schema).expect("finite schema number");
    Ok(Box::new(MultipleOf { decimal }))
}

struct Decimal {
    coefficient: BigInt,
    exponent: i32,
}

impl Decimal {
    fn from_value(value: &Value) -> Option<Self> {
        if !value.is_number() {
            return None;
        }
        let text = canonical_value(value).ok()?;
        let (mantissa, exponent) = text.split_once('e').unwrap_or((&text, "0"));
        let fraction = mantissa
            .split_once('.')
            .map_or(0, |(_, digits)| digits.len());
        Some(Self {
            coefficient: mantissa.replace('.', "").parse().ok()?,
            exponent: exponent.parse::<i32>().ok()? - fraction as i32,
        })
    }

    fn is_multiple_of(&self, divisor: &Self) -> bool {
        let shift = self.exponent - divisor.exponent;
        let ten = BigInt::from(10);
        if shift >= 0 {
            (&self.coefficient * ten.pow(shift as u32)) % &divisor.coefficient == BigInt::from(0)
        } else {
            &self.coefficient % (&divisor.coefficient * ten.pow((-shift) as u32)) == BigInt::from(0)
        }
    }
}

struct MultipleOf {
    decimal: Decimal,
}

impl<'i> Keyword<'i> for MultipleOf {
    fn is_valid(&self, instance: &'i Value) -> bool {
        if !instance.is_number() {
            return true;
        }
        Decimal::from_value(instance).is_some_and(|value| value.is_multiple_of(&self.decimal))
    }

    fn validate(&self, instance: &'i Value) -> Result<(), ValidationError<'i>> {
        if self.is_valid(instance) {
            Ok(())
        } else {
            Err(ValidationError::custom(
                "Value is not an exact decimal multiple",
            ))
        }
    }
}
