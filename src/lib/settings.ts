/**
 * Settings management functions
 *
 * This module provides functions to manage application settings,
 * particularly Gemini translation settings.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  ExplanationResponse,
  GeminiModelOption,
  GeminiSettings,
  TranslationResponse,
} from "@/types";

// ============================================
// Default Values
// ============================================

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
export const DEFAULT_GEMINI_EXPLANATION_MODEL = "gemini-2.0-flash";

export const DEFAULT_GEMINI_SETTINGS: GeminiSettings = {
  apiKey: "",
  model: DEFAULT_GEMINI_MODEL,
  explanationModel: DEFAULT_GEMINI_EXPLANATION_MODEL,
};

// ============================================
// Available Models
// ============================================

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Fast and efficient (Recommended)",
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash-Lite",
    description: "Cost-effective for high volume",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Latest flash model with adaptive thinking",
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    description: "Optimized for efficiency",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Best for complex tasks",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    description: "Latest preview with advanced reasoning",
  },
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro (Preview)",
    description: "Most capable preview model",
  },
];

// ============================================
// API Functions
// ============================================

/**
 * Get Gemini translation settings
 */
export async function getGeminiSettings(): Promise<GeminiSettings> {
  try {
    const settings = await invoke<GeminiSettings>("get_gemini_settings");
    return settings;
  } catch (error) {
    console.error("Failed to get Gemini settings:", error);
    return DEFAULT_GEMINI_SETTINGS;
  }
}

/**
 * Save Gemini translation settings
 */
export async function saveGeminiSettings(
  settings: GeminiSettings,
): Promise<void> {
  await invoke("save_gemini_settings", { settingsData: settings });
}

/**
 * Translate text using Gemini API
 * Returns a structured response with translation and points
 */
export async function translateWithGemini(
  text: string,
  contextBefore: string,
  contextAfter: string,
  modelOverride?: string,
): Promise<TranslationResponse> {
  const result = await invoke<TranslationResponse>("translate_with_gemini", {
    text,
    contextBefore,
    contextAfter,
    modelOverride: modelOverride ?? null,
  });
  return result;
}

/**
 * Get explanation of text
 * Returns summary + explanation points
 */
export async function explainDirectly(
  text: string,
  contextBefore: string,
  contextAfter: string,
  modelOverride?: string,
): Promise<ExplanationResponse> {
  const result = await invoke<ExplanationResponse>("explain_directly", {
    text,
    contextBefore,
    contextAfter,
    modelOverride: modelOverride ?? null,
  });
  return result;
}

/**
 * Check if Gemini API key is configured
 */
export async function isGeminiConfigured(): Promise<boolean> {
  const settings = await getGeminiSettings();
  return settings.apiKey.trim().length > 0;
}
