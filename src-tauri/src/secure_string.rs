//! Secure string type that prevents accidental logging of secrets
//!
//! This module provides a wrapper type for sensitive strings that:
//! - Hides the value in Debug and Display output
//! - Requires explicit `.expose()` call to access the inner value
//! - Zeros memory on drop (via zeroize crate)

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// A secure string wrapper that prevents accidental logging of secrets.
///
/// # Example
/// ```
/// use pedaru_lib::secure_string::SecureString;
///
/// let secret = SecureString::new("my-api-key");
/// println!("{:?}", secret);  // Prints: SecureString(****)
/// let value = secret.expose();  // Explicit access required
/// ```
#[derive(Clone, Default, Zeroize, ZeroizeOnDrop)]
pub struct SecureString {
    inner: String,
}

impl SecureString {
    /// Create a new SecureString from a string value
    pub fn new<S: Into<String>>(value: S) -> Self {
        Self {
            inner: value.into(),
        }
    }

    /// Expose the inner secret value.
    ///
    /// Use this method only when you need to actually use the secret,
    /// such as sending it to an API or storing it in a secure location.
    pub fn expose(&self) -> &str {
        &self.inner
    }

    /// Check if the secret is empty
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Get the length of the secret
    pub fn len(&self) -> usize {
        self.inner.len()
    }
}

impl fmt::Debug for SecureString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SecureString(****)")
    }
}

impl fmt::Display for SecureString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "****")
    }
}

impl From<String> for SecureString {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

impl From<&str> for SecureString {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}

impl PartialEq for SecureString {
    fn eq(&self, other: &Self) -> bool {
        self.inner == other.inner
    }
}

impl Eq for SecureString {}

// Serialize: We need this for storing in keychain as JSON
// The actual value is serialized, but only to secure storage
impl Serialize for SecureString {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.inner.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for SecureString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(SecureString::new(s))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debug_hides_value() {
        let secret = SecureString::new("my-secret-api-key");
        let debug_output = format!("{:?}", secret);
        assert_eq!(debug_output, "SecureString(****)");
        assert!(!debug_output.contains("my-secret-api-key"));
    }

    #[test]
    fn test_display_hides_value() {
        let secret = SecureString::new("my-secret-api-key");
        let display_output = format!("{}", secret);
        assert_eq!(display_output, "****");
        assert!(!display_output.contains("my-secret-api-key"));
    }

    #[test]
    fn test_expose_returns_value() {
        let secret = SecureString::new("my-secret-api-key");
        assert_eq!(secret.expose(), "my-secret-api-key");
    }

    #[test]
    fn test_is_empty() {
        let empty = SecureString::new("");
        let non_empty = SecureString::new("value");
        assert!(empty.is_empty());
        assert!(!non_empty.is_empty());
    }

    #[test]
    fn test_serialization() {
        let secret = SecureString::new("test-value");
        let json = serde_json::to_string(&secret).unwrap();
        assert_eq!(json, "\"test-value\"");

        let deserialized: SecureString = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.expose(), "test-value");
    }

    #[test]
    fn test_equality() {
        let a = SecureString::new("same");
        let b = SecureString::new("same");
        let c = SecureString::new("different");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
