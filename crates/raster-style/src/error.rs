use thiserror::Error;

/// Stable, cross-language error category and optional field location.
#[derive(Debug, Clone, Error)]
#[error("{code}: {message}")]
pub struct Error {
    pub code: &'static str,
    pub message: String,
    pub path: String,
}

impl Error {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            path: String::new(),
        }
    }

    pub(crate) fn at(mut self, path: impl Into<String>) -> Self {
        self.path = path.into();
        self
    }
}

pub type Result<T> = std::result::Result<T, Error>;
