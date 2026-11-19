import * as SecureStore from 'expo-secure-store';
import { GuestSummary, ActivityLog } from '@/types';
import { triggerForceLogout } from './authEvents';

// ⚠️ CHANGE THIS TO YOUR RENDER URL WHEN DEPLOYED
// (also supports `EXPO_PUBLIC_API_URL` so the deployment host can be set
// per build without editing source)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.6:8000/api';

export { API_BASE_URL };

console.log('API_BASE_URL:', API_BASE_URL); // Log the API base URL for debugging purposes
/**
 * Single-flight token refresh: when several requests expire at once they all
 * await one refresh call instead of racing to mint new tokens.
 */
let refreshPromise: Promise<boolean> | null = null;

export const refreshTokens = async (): Promise<boolean> => {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            try {
                const refreshToken = await SecureStore.getItemAsync('refresh_token');
                if (!refreshToken) return false;

                const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh: refreshToken }),
                });
                if (!refreshResponse.ok) return false;

                const data = await refreshResponse.json();
                if (!data.access) return false;

                await SecureStore.setItemAsync('access_token', data.access);
                if (data.refresh) {
                    await SecureStore.setItemAsync('refresh_token', data.refresh);
                }
                return true;
            } catch (error) {
                // Network error while refreshing — treat as not-refreshed.
                console.error('Token refresh failed:', error);
                return false;
            } finally {
                refreshPromise = null;
            }
        })();
    }
    return refreshPromise;
};

export const api = async (endpoint: string, options: RequestInit = {}) => {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    const buildHeaders = async () => {
        const token = await SecureStore.getItemAsync('access_token');
        return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
    };

    let response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: await buildHeaders(),
    });

    if (response.status === 401 && !endpoint.startsWith('/auth/login/')) {
        // Only real session expiries get the refresh→retry flow. A 401 from
        // the login endpoint itself means wrong credentials — surfacing the
        // backend's message is more useful than a refresh attempt.
        // Try one refresh; on success mint a brand-new request, otherwise logout.
        const refreshed = await refreshTokens();

        if (!refreshed) {
            await forceLogout();
            throw new Error('Session expired. Please sign in again.');
        }

        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: await buildHeaders(),
        });

        if (response.status === 401) {
            // Refresh "succeeded" but the retry is still rejected — the
            // session is dead; don't loop.
            await forceLogout();
            throw new Error('Session expired. Please sign in again.');
        }
    }

    if (response.status === 404) {
        const errorData  = await response.json();
        let errorMessage = errorData.message || errorData.detail || errorData.error || errorData.non_field_errors?.[0] || 'An error occurred';
        throw new Error(errorMessage)
    }
    
    if (response.status === 409) {
        const errorData  = await response.json();
        let errorMessage = errorData.message || errorData.detail || errorData.error || errorData.non_field_errors?.[0] || 'An error occurred';
        throw new Error(errorMessage)
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // `message` carries the check-in endpoint's friendly contract
        // (403 outside-hours text, 400 location errors, etc.)
        let message = error.error || error.message || error.detail || 'Network request failed';
        if (endpoint.startsWith('/auth/login/') && /no active account/i.test(message)) {
            message = 'Incorrect email or password.';
        }
        throw new Error(message);
    }

    return response.json();
};

const forceLogout = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user');

    triggerForceLogout();
};

export const searchGuests = async (eventId: number, query: string): Promise<GuestSummary[]> => {
    const data = await api(`/events/${eventId}/search-guests/?q=${encodeURIComponent(query)}`);
    return data;
};

export const checkInGuest = async (eventId: number, identifier: string, locationId: number | null) => {
    return api(`/events/${eventId}/check-in/`, {
        method: 'POST',
        body: JSON.stringify({ identifier, location_id: locationId }),
    });
};

export const getActivityLog = async (eventId: number): Promise<ActivityLog[]> => {
    return api(`/events/${eventId}/activity-log/`);
};