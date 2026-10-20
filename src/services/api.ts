import * as SecureStore from 'expo-secure-store';
import { GuestSummary, ActivityLog } from '@/types';
import { triggerForceLogout } from './authEvents';

// ⚠️ CHANGE THIS TO YOUR RENDER URL WHEN DEPLOYED
const API_BASE_URL = 'http://192.168.43.198:8000/api';

export const api = async (endpoint: string, options: RequestInit = {}) => {
    let token = await SecureStore.getItemAsync('access_token');

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> || {}),
    };

    let response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

    if (response.status === 401) {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');

        if (refreshToken) {
            try {
                // 3. Attempt to get a new access token
                // ⚠️ IMPORTANT: Adjust this endpoint and payload to match YOUR backend!
                // Example for Django SimpleJWT: endpoint = '/auth/token/refresh/', body = { refresh: refreshToken }
                // Example for Node/Firebase: endpoint = '/auth/refresh', body = { refreshToken: refreshToken }
                const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh: refreshToken }),
                });

                if (refreshResponse.ok) {
                    const data = await refreshResponse.json();

                    // 4. Save the new tokens
                    await SecureStore.setItemAsync('access_token', data.access);
                    if (data.refresh) {
                        await SecureStore.setItemAsync('refresh_token', data.refresh);
                    }

                    // 5. Retry the ORIGINAL request with the brand new access token
                    headers['Authorization'] = `Bearer ${data.access}`;
                    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
                } else {
                    // Refresh token is also expired or invalid
                    await forceLogout();
                }
            } catch (error) {
                // Network error occurred while trying to refresh
                console.error('Token refresh failed:', error);
                await forceLogout();
            }
        } else {
            // No refresh token exists in storage
            await forceLogout();
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
        throw new Error(error.error || error.detail || 'Network request failed');
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