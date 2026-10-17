//! Preserve regex execution failures across JSON Schema's boolean keyword interface.
use std::cell::Cell;

use jsonschema::{
    error::ValidationErrorKind, paths::Location, Keyword, ValidationError, Validator,
};
use serde_json::{json, Map, Value};

use crate::error::{Error, Result};

thread_local! {
    static REGEX_FAILED: Cell<bool> = const { Cell::new(false) };
}

struct Pattern(Validator);

pub(crate) fn pattern<'a>(
    _parent: &'a Map<String, Value>,
    schema: &'a Value,
    _location: Location,
) -> std::result::Result<Box<dyn for<'i> Keyword<'i>>, ValidationError<'a>> {
    let text = schema
        .as_str()
        .ok_or_else(|| ValidationError::custom("pattern must be a string"))?;
    let compile = |text: &str| {
        jsonschema::validator_for(&json!({"pattern":text})).map_err(|error| error.to_string())
    };
    let validator = compile(text)
        .or_else(|error| {
            if !text.contains(r"\k<") {
                return Err(error);
            }
            // shortcut: bypass 0.58.6's named-reference translator; remove after upstream support.
            compile(&format!("(?=){text}"))
        })
        .map_err(ValidationError::custom)?;
    Ok(Box::new(Pattern(validator)))
}

pub(crate) fn is_valid(validator: &Validator, instance: &Value) -> Result<bool> {
    REGEX_FAILED.with(|failed| {
        let previous = failed.replace(false);
        let valid = validator.is_valid(instance);
        let exhausted = failed.replace(previous);
        if exhausted {
            Err(Error::new("E_LIMIT", "Schema regex evaluation stopped"))
        } else {
            Ok(valid)
        }
    })
}

impl<'i> Keyword<'i> for Pattern {
    fn is_valid(&self, instance: &'i Value) -> bool {
        match self.0.validate(instance) {
            Ok(()) => true,
            Err(error) => {
                if matches!(
                    error.kind(),
                    ValidationErrorKind::BacktrackLimitExceeded { .. }
                        | ValidationErrorKind::RegexEngineFailure { .. }
                ) {
                    // A failed matcher must not become success through not/anyOf/if.
                    REGEX_FAILED.set(true);
                }
                false
            }
        }
    }

    fn validate(&self, instance: &'i Value) -> std::result::Result<(), ValidationError<'i>> {
        if self.is_valid(instance) {
            Ok(())
        } else {
            Err(ValidationError::custom("Pattern did not match"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_backreferences_match_without_changing_capture_numbers() {
        for text in [r"^(?<pair>a)\k<pair>$", r"^(a)(?<pair>b)\1\k<pair>$"] {
            let validator = jsonschema::options()
                .with_keyword("pattern", pattern)
                .build(&json!({"pattern":text}))
                .unwrap();
            let matching = if text.starts_with("^(a)") {
                "abab"
            } else {
                "aa"
            };
            assert!(is_valid(&validator, &json!(matching)).unwrap());
            assert!(!is_valid(&validator, &json!("ab")).unwrap());
        }
    }

    #[test]
    fn regex_failures_are_isolated_between_threads() {
        REGEX_FAILED.set(true);
        std::thread::spawn(|| assert!(!REGEX_FAILED.get()))
            .join()
            .unwrap();
        assert!(REGEX_FAILED.replace(false));
    }

    #[test]
    fn escaped_named_reference_text_retains_ecmascript_character_classes() {
        let validator = jsonschema::options()
            .with_keyword("pattern", pattern)
            .build(&json!({"pattern":r"^\\k<x>\w+$"}))
            .unwrap();
        assert!(is_valid(&validator, &json!(r"\k<x>abc")).unwrap());
        assert!(!is_valid(&validator, &json!("\\k<x>é")).unwrap());
    }
}
