'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { platform } from '@tauri-apps/plugin-os';

export type PlatformName = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | '';

interface PlatformContextValue {
    platform: PlatformName;
    isMacOS: boolean;
    isWindows: boolean;
    isLinux: boolean;
    isLoading: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

/**
 * Sync detection from userAgent (client-side only)
 */
function detectPlatformFromUserAgent(): PlatformName {
    if (typeof navigator === 'undefined') return '';
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('win')) return 'windows';
    if (ua.includes('linux')) return 'linux';
    return '';
}

/**
 * Provider component that wraps the application with platform detection.
 * 
 * To avoid SSR hydration mismatch:
 * - Initial render uses empty platform (same on server and client)
 * - After mount, detect platform via userAgent (sync) then verify with Tauri API (async)
 */
export function PlatformProvider({ children }: { children: ReactNode }) {
    // Start with empty to match SSR
    const [platformName, setPlatformName] = useState<PlatformName>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // First: sync detection from userAgent for immediate update
        const detected = detectPlatformFromUserAgent();
        if (detected) {
            setPlatformName(detected);
        }

        // Then: verify with Tauri's platform() API (more accurate)
        async function verifyWithTauri() {
            try {
                const p = await platform();
                setPlatformName(p as PlatformName);
            } catch (e) {
                console.error('Failed to get platform from Tauri:', e);
                // Keep the userAgent-based detection as fallback
            } finally {
                setIsLoading(false);
            }
        }
        verifyWithTauri();
    }, []);

    const value: PlatformContextValue = {
        platform: platformName,
        isMacOS: platformName === 'macos',
        isWindows: platformName === 'windows',
        isLinux: platformName === 'linux',
        isLoading,
    };

    return (
        <PlatformContext.Provider value={value}>
            {children}
        </PlatformContext.Provider>
    );
}

/**
 * Hook to access platform information from context
 * Must be used within a PlatformProvider
 */
export function usePlatform(): PlatformContextValue {
    const context = useContext(PlatformContext);
    if (context === null) {
        throw new Error('usePlatform must be used within a PlatformProvider');
    }
    return context;
}
