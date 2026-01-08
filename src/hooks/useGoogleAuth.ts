"use client";

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthStatus, DriveFolder, DriveItem, StoredFolder } from "@/types";

/**
 * Hook for managing Google OAuth authentication and Drive folder configuration
 *
 * Note: Auth status is NOT checked automatically on mount to avoid Keychain prompts
 * for users who only use local files. Call `checkAuthStatus()` explicitly when
 * the user wants to use Google Drive features.
 */
export function useGoogleAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authenticated: false,
    configured: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedFolders, setSyncedFolders] = useState<StoredFolder[]>([]);
  // Track if auth has been checked at least once
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  // Track if folders have been loaded
  const foldersLoadedRef = useRef(false);

  /**
   * Load synced folders from database (does NOT access Keychain)
   */
  const loadSyncedFolders = useCallback(async () => {
    try {
      const folders = await invoke<StoredFolder[]>("get_drive_folders");
      setSyncedFolders(folders);
    } catch (err) {
      console.error("Failed to load synced folders:", err);
    }
  }, []);

  // Load synced folders on mount (this does NOT access Keychain)
  useEffect(() => {
    if (foldersLoadedRef.current) return;
    foldersLoadedRef.current = true;
    loadSyncedFolders();
  }, [loadSyncedFolders]);

  /**
   * Check current authentication status
   * This will trigger Keychain access - only call when user wants to use Google Drive
   * @returns The auth status, or null if an error occurred
   */
  const checkAuthStatus = useCallback(async (): Promise<AuthStatus | null> => {
    try {
      setIsLoading(true);
      const status = await invoke<AuthStatus>("get_google_auth_status");
      setAuthStatus(status);
      setHasCheckedAuth(true);
      setError(null);
      return status;
    } catch (err) {
      console.error("Failed to check auth status:", err);
      setError(String(err));
      setHasCheckedAuth(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Save OAuth credentials
   */
  const saveCredentials = useCallback(
    async (clientId: string, clientSecret: string) => {
      try {
        setIsLoading(true);
        await invoke("save_oauth_credentials", { clientId, clientSecret });
        await checkAuthStatus();
        setError(null);
        return true;
      } catch (err) {
        console.error("Failed to save credentials:", err);
        setError(String(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [checkAuthStatus],
  );

  /**
   * Start OAuth login flow
   */
  const login = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get OAuth URL from backend
      const authUrl = await invoke<string>("start_google_auth");

      // Open in default browser
      await open(authUrl);

      // Poll for auth completion (the callback server handles token exchange)
      // We poll every 2 seconds for up to 5 minutes
      const maxAttempts = 150;
      let attempts = 0;

      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const status = await invoke<AuthStatus>("get_google_auth_status");
          if (status.authenticated) {
            clearInterval(pollInterval);
            setAuthStatus(status);
            setHasCheckedAuth(true);
            setIsLoading(false);
          }
        } catch {
          // Ignore polling errors
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setError("Authentication timed out. Please try again.");
          setIsLoading(false);
        }
      }, 2000);
    } catch (err) {
      console.error("Failed to start login:", err);
      setError(String(err));
      setIsLoading(false);
    }
  }, []);

  /**
   * Logout from Google
   */
  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await invoke("logout_google");
      setAuthStatus({ authenticated: false, configured: true });
      setError(null);
    } catch (err) {
      console.error("Failed to logout:", err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * List folders in Google Drive
   */
  const listDriveFolders = useCallback(
    async (parentId?: string): Promise<DriveFolder[]> => {
      try {
        const folders = await invoke<DriveFolder[]>("list_drive_folders", {
          parentId,
        });
        return folders;
      } catch (err) {
        console.error("Failed to list drive folders:", err);
        setError(String(err));
        return [];
      }
    },
    [],
  );

  /**
   * List both folders and files in Google Drive
   */
  const listDriveItems = useCallback(
    async (parentId?: string): Promise<DriveItem[]> => {
      try {
        const items = await invoke<DriveItem[]>("list_drive_items", {
          parentId,
        });
        return items;
      } catch (err) {
        console.error("Failed to list drive items:", err);
        setError(String(err));
        return [];
      }
    },
    [],
  );

  /**
   * Import specific files from Google Drive
   * @returns The number of files imported
   */
  const importDriveFiles = useCallback(
    async (files: DriveItem[], parentFolderId?: string): Promise<number> => {
      try {
        const count = await invoke<number>("import_drive_files", {
          files,
          parentFolderId,
        });
        return count;
      } catch (err) {
        console.error("Failed to import drive files:", err);
        setError(String(err));
        return 0;
      }
    },
    [],
  );

  /**
   * Add a folder to sync list
   */
  const addSyncFolder = useCallback(
    async (folderId: string, folderName: string) => {
      try {
        await invoke("add_drive_folder", { folderId, folderName });
        await loadSyncedFolders();
        return true;
      } catch (err) {
        console.error("Failed to add sync folder:", err);
        setError(String(err));
        return false;
      }
    },
    [loadSyncedFolders],
  );

  /**
   * Remove a folder from sync list
   */
  const removeSyncFolder = useCallback(
    async (folderId: string) => {
      try {
        await invoke("remove_drive_folder", { folderId });
        await loadSyncedFolders();
        return true;
      } catch (err) {
        console.error("Failed to remove sync folder:", err);
        setError(String(err));
        return false;
      }
    },
    [loadSyncedFolders],
  );

  return {
    // State
    authStatus,
    isLoading,
    error,
    syncedFolders,
    hasCheckedAuth,

    // Auth actions
    checkAuthStatus,
    saveCredentials,
    login,
    logout,

    // Folder actions
    loadSyncedFolders,
    listDriveFolders,
    listDriveItems,
    importDriveFiles,
    addSyncFolder,
    removeSyncFolder,
  };
}
