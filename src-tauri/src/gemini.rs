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

// System instruction for translation (behavioral guidelines)
const TRANSLATION_SYSTEM_INSTRUCTION: &str = r#"You are a professional English-to-Japanese translator and language teacher.

## Your Task
Translate ONLY the "SELECTED TEXT" provided by the user. The context is for understanding only.

## Output Format (STRICT - follow exactly):
- Output MUST be valid JSON only. No markdown code blocks, no extra text.
- The JSON structure MUST be:
{
  "translation": "Translation result in Japanese (string)",
  "points": ["Point 1 (string)", "Point 2 (string)", "Point 3 (string)"]
}

## Critical Rules:
- The "points" field MUST be a flat array of strings. DO NOT use nested objects.
- Each element in points must be a simple string, not an object.
- All output text MUST be in Japanese.
- IMPORTANT: Translate ONLY the SELECTED TEXT, not the context.

## Translation Rules:
- For single words, idioms, or short phrases (no spaces, or 2-3 words):
  - translation: Only the meaning of the word/idiom. NOT a translation of the entire sentence.
  - points: A flat array of strings containing:
    1. "単語の意味: [explanation of the word in Japanese]"
    2. "原文: [Extract the COMPLETE English sentence containing the word from the context, with ***highlighted*** word]"
    3. "訳: [Japanese translation of that complete sentence, with ***highlighted*** translation of the word]"
    4. "類語・言い換え: [synonyms in English with Japanese meanings]"
  - Example output:
    {
      "translation": "活用する、利用する",
      "points": [
        "単語の意味: 何かの力や資源を有効に使うこと",
        "原文: The goal is to ***harness*** the power of AI.",
        "訳: 目標はAIの力を***活用する***ことです。",
        "類語・言い換え: utilize（活用する）, leverage（活かす）, exploit（利用する）"
      ]
    }
  - CRITICAL: How to find the 原文 (original sentence):
    - The selected word appears at the EXACT BOUNDARY between "Context before" and "Context after".
    - The 原文 containing the selected word is: (end of "Context before") + (selected word) + (beginning of "Context after")
    - If the same word appears multiple times in the context, you MUST use ONLY the occurrence at the boundary position.
    - DO NOT pick a sentence from earlier in Context before that happens to contain the same word.

- For sentences or longer text:
  - translation: Full Japanese translation of the text
  - points: A flat array of strings with grammatical explanations:
    1. Each point is a single string explaining one grammar structure
    2. Focus on challenging structures: relative clauses, participle constructions, etc.
    3. Include synonyms or alternative expressions where helpful"#;

// User prompt for translation (actual content - data only)
const TRANSLATION_PROMPT: &str = r#"SELECTED TEXT (translate this):
{text}

Context before:
{context_before}

Context after:
{context_after}"#;

// System instruction for explanation (behavioral guidelines)
const EXPLANATION_SYSTEM_INSTRUCTION: &str = r#"You are an expert at explaining complex concepts in simple, easy-to-understand terms.

## Output Format (STRICT - follow exactly):
- Output MUST be valid JSON only. No markdown code blocks, no extra text.
- The JSON structure MUST be:
{
  "summary": "One-sentence summary (string)",
  "points": ["Point 1 (string)", "Point 2 (string)", "Point 3 (string)"]
}

## Critical Rules:
- The "points" field MUST be a flat array of strings. DO NOT use nested objects.
- All output text MUST be in Japanese.

## Explanation Guidelines:

### Summary (summary field):
- Summarize the essence in ONE sentence
- Use phrases like "要するに〜ということ" or "つまり〜"
- Make it understandable even for someone unfamiliar with the topic

### Explanation points (points field):
- Rephrase technical terms in plain language: "〇〇（つまり△△のこと）"
- Use familiar analogies or metaphors to explain abstract concepts
- Add context about "why this matters" or "what benefit does this provide"
- For technical content, explain practical use cases and benefits concretely
- For academic content, explain the importance in the field and application examples
- Each point should be independently understandable
- Keep each point to 2-3 sentences"#;

// User prompt for explanation (actual content)
const EXPLANATION_PROMPT: &str = r#"Explain the following text.

The user has selected text from a PDF document. The context shows the surrounding text:
- "Context before" = text that appears BEFORE the selected text in the document
- "Text to explain" = the actual text the user selected
- "Context after" = text that appears AFTER the selected text in the document

## Context before (for understanding only):
{context_before}

## Text to explain:
{text}

## Context after (for understanding only):
{context_after}

Use the context to understand the meaning, but explain only the selected text."#;

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
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

/// Structured explanation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplanationResponse {
    pub summary: String,
    pub points: Vec<String>,
}

// ============================================================================
// API Functions
// ============================================================================

/// Call Gemini API with the given prompt and optional system instruction
async fn call_gemini_api(
    api_key: &str,
    model: &str,
    prompt: &str,
    system_instruction: Option<&str>,
) -> Result<String, PedaruError> {
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
        system_instruction: system_instruction.map(|text| GeminiContent {
            parts: vec![GeminiPart {
                text: text.to_string(),
            }],
        }),
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

/// Parse JSON response for explanation, with fallback for markdown code blocks
fn parse_explanation_response(text: &str) -> Result<ExplanationResponse, PedaruError> {
    eprintln!("[Gemini] Raw API response (explanation): {}", text);

    // Try to parse directly first
    if let Ok(response) = serde_json::from_str::<ExplanationResponse>(text) {
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

    if let Ok(response) = serde_json::from_str::<ExplanationResponse>(cleaned) {
        eprintln!("[Gemini] Parsed from cleaned: {:?}", response);
        return Ok(response);
    }

    // Try to parse as a more flexible JSON structure
    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        eprintln!("[Gemini] Parsed as Value: {:?}", value);

        // Handle both object and array responses
        let obj = if value.is_array() {
            value.as_array().and_then(|arr| arr.first()).cloned()
        } else {
            Some(value)
        };

        if let Some(obj) = obj {
            let summary = obj
                .get("summary")
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

            let response = ExplanationResponse { summary, points };
            eprintln!("[Gemini] Flexible parse result: {:?}", response);
            return Ok(response);
        }
    }

    eprintln!("[Gemini] All parsing failed, returning raw text");
    Ok(ExplanationResponse {
        summary: text.to_string(),
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
    context_before: &str,
    context_after: &str,
) -> Result<TranslationResponse, PedaruError> {
    let prompt = TRANSLATION_PROMPT
        .replace("{text}", text)
        .replace("{context_before}", context_before)
        .replace("{context_after}", context_after);

    let response_text = call_gemini_api(
        api_key,
        model,
        &prompt,
        Some(TRANSLATION_SYSTEM_INSTRUCTION),
    )
    .await?;
    parse_translation_response(&response_text)
}

/// Get explanation of text
///
/// Returns a summary and explanation points.
/// The context parameters help understand the text but are not included in output.
pub async fn explain_text(
    api_key: &str,
    model: &str,
    text: &str,
    context_before: &str,
    context_after: &str,
) -> Result<ExplanationResponse, PedaruError> {
    let prompt = EXPLANATION_PROMPT
        .replace("{text}", text)
        .replace("{context_before}", context_before)
        .replace("{context_after}", context_after);

    let response_text = call_gemini_api(
        api_key,
        model,
        &prompt,
        Some(EXPLANATION_SYSTEM_INSTRUCTION),
    )
    .await?;
    parse_explanation_response(&response_text)
}
