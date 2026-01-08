"use client";

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  Check,
  Cloud,
  Columns,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  DEFAULT_GEMINI_SETTINGS,
  GEMINI_MODELS,
  getGeminiSettings,
  saveGeminiSettings,
} from "@/lib/settings";
import type { AuthStatus, GeminiSettings, ViewMode } from "@/types";
import type { SettingsProps } from "@/types/components";

// Re-export for backward compatibility
export type { ViewMode };

export default function Settings({
  isOpen,
  viewMode,
  onViewModeChange,
  onClose,
}: SettingsProps) {
  const [geminiSettings, setGeminiSettings] = useState<GeminiSettings>(
    DEFAULT_GEMINI_SETTINGS,
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "display" | "translation" | "cloud"
  >("display");

  // Google Drive OAuth state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authenticated: false,
    configured: false,
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isSavingOAuth, setIsSavingOAuth] = useState(false);
  const [oauthSaveSuccess, setOauthSaveSuccess] = useState(false);

  const loadSettings = async () => {
    const settings = await getGeminiSettings();
    setGeminiSettings(settings);
  };

  const loadAuthStatus = async () => {
    try {
      const status = await invoke<AuthStatus>("get_google_auth_status");
      setAuthStatus(status);
    } catch (error) {
      console.error("Failed to get auth status:", error);
    }
  };

  const loadOAuthCredentials = async () => {
    try {
      const credentials = await invoke<{
        client_id: string;
        client_secret: string;
      } | null>("get_oauth_credentials");
      if (credentials) {
        setClientId(credentials.client_id);
        setClientSecret(credentials.client_secret);
      }
    } catch (error) {
      console.error("Failed to get OAuth credentials:", error);
    }
  };

  // Load settings when opened
  // biome-ignore lint/correctness/useExhaustiveDependencies: functions are stable and don't need to be dependencies
  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadAuthStatus();
      loadOAuthCredentials();
    }
  }, [isOpen]);

  const handleSaveOAuthCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;

    setIsSavingOAuth(true);
    setOauthSaveSuccess(false);
    try {
      await invoke("save_oauth_credentials", { clientId, clientSecret });
      setOauthSaveSuccess(true);
      await loadAuthStatus();
      setTimeout(() => setOauthSaveSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to save OAuth credentials:", error);
    } finally {
      setIsSavingOAuth(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsAuthLoading(true);
    try {
      const authUrl = await invoke<string>("start_google_auth");
      await open(authUrl);

      // Poll for auth completion
      const maxAttempts = 150;
      let attempts = 0;

      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const status = await invoke<AuthStatus>("get_google_auth_status");
          if (status.authenticated) {
            clearInterval(pollInterval);
            setAuthStatus(status);
            setIsAuthLoading(false);
          }
        } catch {
          // Ignore polling errors
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setIsAuthLoading(false);
        }
      }, 2000);
    } catch (error) {
      console.error("Failed to authenticate:", error);
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("logout_google");
      await loadAuthStatus();
    } catch (error) {
      console.error("Failed to logout:", error);
    }
  };

  const handleSaveGeminiSettings = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveGeminiSettings(geminiSettings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to save Gemini settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
      role="dialog"
    >
      <div className="bg-bg-secondary rounded-xl shadow-2xl w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bg-tertiary">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bg-tertiary">
          <button
            type="button"
            onClick={() => setActiveTab("display")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "display"
                ? "text-accent border-b-2 border-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Display
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("translation")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "translation"
                ? "text-accent border-b-2 border-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Translation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cloud")}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "cloud"
                ? "text-accent border-b-2 border-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Cloud className="w-4 h-4" />
            Cloud
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {activeTab === "display" && (
            <div className="space-y-6">
              {/* View Mode */}
              <div>
                <h3 className="text-sm font-medium text-text-primary mb-3">
                  Display Mode
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onViewModeChange("single")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      viewMode === "single"
                        ? "border-accent bg-accent/10"
                        : "border-bg-tertiary hover:border-bg-hover"
                    }`}
                  >
                    <Monitor
                      className={`w-8 h-8 ${viewMode === "single" ? "text-accent" : "text-text-secondary"}`}
                    />
                    <span
                      className={`text-sm font-medium ${viewMode === "single" ? "text-accent" : "text-text-primary"}`}
                    >
                      Single Page
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onViewModeChange("two-column")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      viewMode === "two-column"
                        ? "border-accent bg-accent/10"
                        : "border-bg-tertiary hover:border-bg-hover"
                    }`}
                  >
                    <Columns
                      className={`w-8 h-8 ${viewMode === "two-column" ? "text-accent" : "text-text-secondary"}`}
                    />
                    <span
                      className={`text-sm font-medium ${viewMode === "two-column" ? "text-accent" : "text-text-primary"}`}
                    >
                      Two Column
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "translation" && (
            <div className="space-y-6">
              {/* API Key */}
              <div>
                <label
                  htmlFor="gemini-api-key"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  Gemini API Key
                </label>
                <div className="relative">
                  <input
                    id="gemini-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={geminiSettings.apiKey}
                    onChange={(e) =>
                      setGeminiSettings({
                        ...geminiSettings,
                        apiKey: e.target.value,
                      })
                    }
                    placeholder="Enter your Gemini API key"
                    className="w-full px-3 py-2 pr-10 bg-bg-primary border border-bg-tertiary rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  Get your API key from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>

              {/* Translation Model Selection */}
              <div>
                <label
                  htmlFor="translation-model"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  翻訳モデル
                </label>
                <select
                  id="translation-model"
                  value={geminiSettings.model}
                  onChange={(e) =>
                    setGeminiSettings({
                      ...geminiSettings,
                      model: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-tertiary">
                  Cmd+Jで翻訳する際に使用するモデル
                </p>
              </div>

              {/* Explanation Model Selection */}
              <div>
                <label
                  htmlFor="explanation-model"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  解説モデル
                </label>
                <select
                  id="explanation-model"
                  value={geminiSettings.explanationModel}
                  onChange={(e) =>
                    setGeminiSettings({
                      ...geminiSettings,
                      explanationModel: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-tertiary">
                  「解説」ボタンを押した際に使用するモデル（より賢いモデルを推奨）
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end pt-4 border-t border-bg-tertiary">
                <button
                  type="button"
                  onClick={handleSaveGeminiSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="w-4 h-4" />
                  ) : null}
                  {saveSuccess ? "Saved!" : "Save Settings"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="space-y-6">
              {/* Auth Status */}
              <div className="p-4 bg-bg-primary rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-text-primary">
                      Google Drive
                    </h4>
                    <p className="text-xs text-text-tertiary mt-1">
                      {authStatus.authenticated
                        ? "Connected to Google Drive"
                        : authStatus.configured
                          ? "Ready to connect"
                          : "Not configured"}
                    </p>
                  </div>
                  {authStatus.authenticated ? (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Disconnect
                    </button>
                  ) : authStatus.configured ? (
                    <button
                      type="button"
                      onClick={handleGoogleAuth}
                      disabled={isAuthLoading}
                      className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {isAuthLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      Connect
                    </button>
                  ) : null}
                </div>
              </div>

              {/* OAuth Credentials */}
              <div>
                <h3 className="text-sm font-medium text-text-primary mb-3">
                  OAuth Credentials
                </h3>
                <p className="text-xs text-text-tertiary mb-4">
                  Create OAuth credentials in{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Google Cloud Console
                  </a>{" "}
                  with Google Drive API enabled.
                </p>

                {/* Client ID */}
                <div className="mb-4">
                  <label
                    htmlFor="settings-client-id"
                    className="block text-sm font-medium text-text-primary mb-2"
                  >
                    Client ID
                  </label>
                  <input
                    id="settings-client-id"
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Enter your OAuth Client ID"
                    className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                {/* Client Secret */}
                <div className="mb-4">
                  <label
                    htmlFor="settings-client-secret"
                    className="block text-sm font-medium text-text-primary mb-2"
                  >
                    Client Secret
                  </label>
                  <div className="relative">
                    <input
                      id="settings-client-secret"
                      type={showClientSecret ? "text" : "password"}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Enter your OAuth Client Secret"
                      className="w-full px-3 py-2 pr-10 bg-bg-primary border border-bg-tertiary rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClientSecret(!showClientSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      {showClientSecret ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  onClick={handleSaveOAuthCredentials}
                  disabled={
                    isSavingOAuth || !clientId.trim() || !clientSecret.trim()
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {isSavingOAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : oauthSaveSuccess ? (
                    <Check className="w-4 h-4" />
                  ) : null}
                  {oauthSaveSuccess ? "Saved!" : "Save Credentials"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
