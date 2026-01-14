import { type as osType } from "@tauri-apps/plugin-os";

// Cache the OS type to avoid repeated calls
let cachedOsType: string | null = null;

/**
 * Check if running in browser environment (not SSR)
 */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Get the OS type using @tauri-apps/plugin-os
 * Returns: 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown' (SSR)
 */
export function getOsType(): string {
  if (!isBrowser()) {
    return "unknown";
  }
  if (cachedOsType === null) {
    cachedOsType = osType();
  }
  return cachedOsType;
}

/**
 * Check if the current platform is macOS
 */
export function isMacOS(): boolean {
  return getOsType() === "macos";
}

/**
 * Check if the current platform is Windows
 */
export function isWindows(): boolean {
  return getOsType() === "windows";
}

/**
 * Check if the current platform is Linux
 */
export function isLinux(): boolean {
  return getOsType() === "linux";
}

/**
 * Check if the current platform is a desktop OS
 */
export function isDesktop(): boolean {
  const os = getOsType();
  return os === "macos" || os === "windows" || os === "linux";
}
