//! Gemini API client for translation
//!
//! This module provides functionality to translate text using Google's Gemini API.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{GeminiError, PedaruError};

/// Gemini API base URL
const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

// ============================================================================
// Default Prompts (hardcoded in backend)
// ============================================================================

const TRANSLATION_PROMPT: &str = r#"Translate and explain the following text, considering the context. Output MUST be in Japanese.

## Context (surrounding text of the selection):
{context}

## Text to translate:
{text}

Output in the following JSON format:
{
  "translation": "Translation result in Japanese",
  "points": [
    "Point 1 in Japanese",
    "Point 2 in Japanese",
    "Point 3 in Japanese"
  ]
}

## Output Rules:
- For single words, idioms, or short phrases (no spaces, or 2-3 words):
  - translation: Only the meaning of the word/idiom. NOT a translation of the entire sentence.
  - points: Include the following 3 elements separately:
    1. Explanation of the word (common usage, how it's used in this context, etc.) in Japanese
    2. "原文: [English sentence]" - Highlight the selected word using ***word*** format
    3. "訳: [Japanese translation]" - Highlight the corresponding Japanese translation using ***訳語*** format
  - Example: translation: "活用する、利用する" (NOT the entire sentence translation)
  - Example: "原文: The goal is to ***harness*** the power of AI."
  - Example: "訳: 目標はAIの力を***活用する***ことです。"
- For sentences or longer text:
  - translation: Full Japanese translation of the text
  - points: Provide detailed grammatical explanations for complex sentence structures. For each notable grammar point:
    1. Identify the grammatical structure (e.g., "「in which to...」は関係代名詞whichと不定詞が組み合わさったフォーマルな構文")
    2. Explain why this form is used and what nuance it conveys
    3. Show how it could be rewritten in simpler forms if applicable
    4. Give similar example sentences if helpful
  - Focus on structures that learners might find challenging: relative clauses, participle constructions, subjunctive mood, complex prepositions, etc.
  - Do NOT include original/translation pairs for sentences (that's only for single words)

Output only valid JSON. Do not use markdown code blocks."#;

const EXPLANATION_PROMPT: &str = r#"Explain the following text in simple, easy-to-understand terms. Output MUST be in Japanese.

## Original text:
{text}

## Translation:
{previous_translation}

Output in the following JSON format:
{
  "translation": "Simplified summary in 1-2 sentences (in Japanese)",
  "points": [
    "Explanation point 1 in Japanese",
    "Explanation point 2 in Japanese",
    "Explanation point 3 in Japanese"
  ]
}

## Guidelines for "easy-to-understand" explanation:

### 1. What is it in one sentence? (translation field)
- Summarize difficult content in simple words that even a middle school student could understand
- Convey the essence using phrases like "要するに〜ということ" or "つまり〜"

### 2. Broken-down explanation (points field)
- Rephrase technical terms in plain language: "〇〇（つまり△△のこと）"
- Use familiar analogies or metaphors to explain abstract concepts
- Add context about "why this matters" or "what benefit does this provide"
- For technical content, explain practical use cases and benefits concretely
- For academic content, explain the importance in the field and application examples

### 3. Structuring rules
- Each point should be independently understandable
- Avoid long explanations; keep each point to 2-3 sentences
- Use "→" or "：" for further structuring within bullet points if needed

Output only valid JSON. Do not use markdown code blocks."#;

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    response_mime_type: String,
}

#[derive(Debug, Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    error: Option<GeminiApiError>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiResponseContent,
}

#[derive(Debug, Deserialize)]
struct GeminiResponseContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponsePart {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GeminiApiError {
    message: String,
}

// ============================================================================
// Public Types
// ============================================================================

/// Structured translation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResponse {
    pub translation: String,
    pub points: Vec<String>,
}

// ============================================================================
// API Functions
// ============================================================================

/// Call Gemini API with the given prompt
async fn call_gemini_api(api_key: &str, model: &str, prompt: &str) -> Result<String, PedaruError> {
    if api_key.is_empty() {
        return Err(PedaruError::Gemini(GeminiError::ApiKeyMissing));
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| {
            PedaruError::Gemini(GeminiError::ApiRequestFailed(format!(
                "Failed to create HTTP client: {}",
                e
            )))
        })?;

    let request = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: prompt.to_string(),
            }],
        }],
        generation_config: Some(GenerationConfig {
            response_mime_type: "application/json".to_string(),
        }),
    };

    let url = format!(
        "{}/models/{}:generateContent?key={}",
        GEMINI_API_BASE, model, api_key
    );

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            let err_msg = if e.is_timeout() {
                "Request timed out. Please try again.".to_string()
            } else if e.is_connect() {
                "Failed to connect to Gemini API. Check your internet connection.".to_string()
            } else {
                format!("Network error: {}", e.without_url())
            };
            PedaruError::Gemini(GeminiError::ApiRequestFailed(err_msg))
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        let error_message = if status.as_u16() == 429 {
            "Rate limit exceeded. Please wait a moment and try again.".to_string()
        } else if status.as_u16() == 401 || status.as_u16() == 403 {
            "Invalid API key. Please check your Gemini API key in Settings.".to_string()
        } else {
            format!("API error ({}): {}", status, error_text)
        };

        return Err(PedaruError::Gemini(GeminiError::ApiRequestFailed(
            error_message,
        )));
    }

    let gemini_response: GeminiResponse = response
        .json()
        .await
        .map_err(|e| PedaruError::Gemini(GeminiError::InvalidResponse(e.to_string())))?;

    if let Some(error) = gemini_response.error {
        return Err(PedaruError::Gemini(GeminiError::ApiRequestFailed(
            error.message,
        )));
    }

    let text = gemini_response
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content.parts.into_iter().next())
        .map(|p| p.text)
        .ok_or_else(|| {
            PedaruError::Gemini(GeminiError::InvalidResponse(
                "No text in response".to_string(),
            ))
        })?;

    Ok(text)
}

/// Parse JSON response from Gemini, with fallback for markdown code blocks
fn parse_translation_response(text: &str) -> Result<TranslationResponse, PedaruError> {
    eprintln!("[Gemini] Raw API response: {}", text);

    // Try to parse directly first
    if let Ok(response) = serde_json::from_str::<TranslationResponse>(text) {
        eprintln!("[Gemini] Parsed directly: {:?}", response);
        return Ok(response);
    }

    // Try to extract JSON from markdown code block
    let cleaned = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    eprintln!("[Gemini] Cleaned text: {}", cleaned);

    if let Ok(response) = serde_json::from_str::<TranslationResponse>(cleaned) {
        eprintln!("[Gemini] Parsed from cleaned: {:?}", response);
        return Ok(response);
    }

    // Try to parse as a more flexible JSON structure
    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        eprintln!("[Gemini] Parsed as Value: {:?}", value);

        // Handle both object and array responses
        let obj = if value.is_array() {
            // If it's an array, take the first element
            value.as_array().and_then(|arr| arr.first()).cloned()
        } else {
            Some(value)
        };

        if let Some(obj) = obj {
            let translation = obj
                .get("translation")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let points = obj
                .get("points")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let response = TranslationResponse {
                translation,
                points,
            };
            eprintln!("[Gemini] Flexible parse result: {:?}", response);
            return Ok(response);
        }
    }

    eprintln!("[Gemini] All parsing failed, returning raw text");
    // If all parsing fails, return the raw text as translation
    Ok(TranslationResponse {
        translation: text.to_string(),
        points: vec![],
    })
}

/// Translate text using Gemini API
///
/// Returns a structured response with translation and explanation points.
pub async fn translate_text(
    api_key: &str,
    model: &str,
    text: &str,
    context: &str,
) -> Result<TranslationResponse, PedaruError> {
    let prompt = TRANSLATION_PROMPT
        .replace("{text}", text)
        .replace("{context}", context);

    let response_text = call_gemini_api(api_key, model, &prompt).await?;
    parse_translation_response(&response_text)
}

/// Get a more detailed explanation of a previous translation
pub async fn explain_translation(
    api_key: &str,
    model: &str,
    text: &str,
    previous_translation: &str,
) -> Result<TranslationResponse, PedaruError> {
    let prompt = EXPLANATION_PROMPT
        .replace("{text}", text)
        .replace("{previous_translation}", previous_translation);

    let response_text = call_gemini_api(api_key, model, &prompt).await?;
    parse_translation_response(&response_text)
}
