"use client";

import {
  FolderPlus,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { AuthStatus, StoredFolder } from "@/types";

interface BookshelfSettingsProps {
  authStatus: AuthStatus;
  authLoading: boolean;
  hasCheckedAuth: boolean;
  syncedFolders: StoredFolder[];
  isSyncing: boolean;
  checkAuthStatus: () => Promise<AuthStatus | null>;
  saveCredentials: (clientId: string, clientSecret: string) => Promise<boolean>;
  login: () => void;
  logout: () => void;
  removeSyncFolder: (folderId: string) => Promise<boolean>;
  onSync: () => void;
  onBrowseFolders: () => void;
  onClose: () => void;
}

/**
 * Full-screen settings view for Google Drive credentials, login and synced folders
 */
export default function BookshelfSettings({
  authStatus,
  authLoading,
  hasCheckedAuth,
  syncedFolders,
  isSyncing,
  checkAuthStatus,
  saveCredentials,
  login,
  logout,
  removeSyncFolder,
  onSync,
  onBrowseFolders,
  onClose,
}: BookshelfSettingsProps) {
  // Credentials input (for first-time setup)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const handleSaveCredentials = useCallback(async () => {
    if (clientId && clientSecret) {
      await saveCredentials(clientId, clientSecret);
      setClientId("");
      setClientSecret("");
    }
  }, [clientId, clientSecret, saveCredentials]);

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      <div className="flex items-center justify-between px-6 py-4 border-b border-bg-tertiary">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-accent" />
          <span className="text-lg font-medium text-text-primary">
            Bookshelf Settings
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-bg-tertiary rounded"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        {!authStatus.configured && (
          <div className="space-y-4 pb-6 border-b border-bg-tertiary">
            <p className="text-text-secondary">
              Set up OAuth credentials to connect to Google Drive.
            </p>
            <div>
              <label
                htmlFor="bookshelf-client-id"
                className="block text-sm text-text-tertiary mb-2"
              >
                Client ID
              </label>
              <input
                id="bookshelf-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 bg-bg-secondary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
                placeholder="xxxx.apps.googleusercontent.com"
              />
            </div>
            <div>
              <label
                htmlFor="bookshelf-client-secret"
                className="block text-sm text-text-tertiary mb-2"
              >
                Client Secret
              </label>
              <input
                id="bookshelf-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="w-full px-3 py-2 bg-bg-secondary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
                placeholder="GOCSPX-xxxx"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveCredentials}
              disabled={!clientId || !clientSecret || authLoading}
              className="w-full px-4 py-2 bg-accent text-white rounded font-medium disabled:opacity-50 hover:bg-accent/80 transition-colors"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                "Save Credentials"
              )}
            </button>
          </div>
        )}

        {(authStatus.configured || hasCheckedAuth) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-text-primary">
                {authStatus.authenticated
                  ? "Connected to Google"
                  : "Not connected"}
              </span>
              <button
                type="button"
                onClick={authStatus.authenticated ? logout : login}
                disabled={authLoading}
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  authStatus.authenticated
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-accent text-white hover:bg-accent/80"
                }`}
              >
                {authLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : authStatus.authenticated ? (
                  <>
                    <LogOut className="w-5 h-5" />
                    Logout
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Login
                  </>
                )}
              </button>
            </div>

            {(authStatus.authenticated || hasCheckedAuth) && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-text-tertiary">
                    Synced Folders
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      // Ensure auth is checked before browsing folders
                      if (!hasCheckedAuth) {
                        const status = await checkAuthStatus();
                        if (!status?.authenticated) {
                          return;
                        }
                      } else if (!authStatus.authenticated) {
                        return;
                      }
                      onBrowseFolders();
                    }}
                    className="text-sm text-accent hover:underline flex items-center gap-1"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Add Folder
                  </button>
                </div>
                {syncedFolders.length === 0 ? (
                  <p className="text-text-tertiary mb-4">No synced folders</p>
                ) : (
                  <ul className="space-y-2 mb-4">
                    {syncedFolders.map((folder, index) => (
                      <li
                        key={folder.folderId || `synced-${index}`}
                        className="flex items-center justify-between py-2 px-3 bg-bg-tertiary rounded"
                      >
                        <span className="text-text-primary truncate">
                          {folder.folderName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSyncFolder(folder.folderId)}
                          className="text-text-tertiary hover:text-red-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={onSync}
                  disabled={isSyncing}
                  className="w-full px-4 py-2 bg-accent text-white rounded font-medium hover:bg-accent/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-5 h-5 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
