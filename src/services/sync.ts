import * as SecureStore from 'expo-secure-store';
import {
    getPendingCheckIns,
    markCheckInSynced,
    markCheckInConflict,
    markLocalGuestCheckedIn,
    findLocalGuestByTicket,
    getPendingCount,
} from './database';
import { API_BASE_URL, refreshTokens } from './api';

// ==========================================
// EVENT TYPES
// ==========================================

export type SyncEvent =
    | { type: 'sync_start'; total: number }
    | { type: 'sync_progress'; current: number; total: number; identifier: string }
    | { type: 'sync_success'; identifier: string; guest: any; message: string }
    | { type: 'sync_conflict'; identifier: string; message: string }
    | { type: 'sync_error'; identifier: string; message: string }
    | { type: 'sync_complete' }
    | { type: 'pending_count_changed'; count: number };

// ==========================================
// EVENT EMITTER
// ==========================================

type Listener = (event: SyncEvent) => void;
const listeners = new Set<Listener>();

export const subscribeToSync = (callback: Listener): (() => void) => {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
};

const emit = (event: SyncEvent) => {
    listeners.forEach((cb) => {
        try {
            cb(event);
        } catch (e) {
            console.error('Sync listener error:', e);
        }
    });
};

// ==========================================
// SYNC STATE
// ==========================================

let isSyncing = false;

export const getIsSyncing = () => isSyncing;

const notifyPendingCount = async () => {
    const count = await getPendingCount();
    emit({ type: 'pending_count_changed', count });
};

// ==========================================
// SYNC LOGIC
// ==========================================

// These responses mean "try again later", not "this scan is invalid".
// 403 is included deliberately: the backend returns it for outside-hours
// check-ins (and other temporary permission states), and discarding a queued
// scan that arrived at the venue would lose a real check-in.
const TRANSIENT_STATUSES = new Set([403, 408, 425, 429]);

const isTransientStatus = (status: number): boolean =>
    TRANSIENT_STATUSES.has(status) || status >= 500;

export const syncPendingCheckIns = async (): Promise<void> => {
    if (isSyncing) return;

    // Claim the flag before the first await: mount + reconnect (or any two
    // triggers in the same tick) must not start two batches at once.
    isSyncing = true;

    let started = false;

    try {
        // The queue is already filtered to the signed-in user; it returns an
        // empty list when nobody is signed in, so scans are never replayed
        // under another ambassador's token.
        const pending = await getPendingCheckIns();
        if (pending.length === 0) return;

        let token = await SecureStore.getItemAsync('access_token');
        if (!token) return;

        started = true;
        const total = pending.length;

        emit({ type: 'sync_start', total });

        const postCheckIn = (item: any) =>
            fetch(`${API_BASE_URL}/events/${item.event_id}/check-in/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    identifier: item.guest_identifier,
                    location_id: item.location_id,
                }),
            });

        for (let i = 0; i < pending.length; i++) {
            const item = pending[i] as any;

            emit({
                type: 'sync_progress',
                current: i + 1,
                total,
                identifier: item.guest_identifier,
            });

            try {
                let response = await postCheckIn(item);

                if (response.status === 401) {
                    // 🔑 Access token expired mid-batch — refresh once (the
                    // api.ts helper handles rotation) and retry this item.
                    const refreshed = await refreshTokens();
                    if (!refreshed) {
                        console.warn('Sync aborted: cannot refresh expired token.');
                        break;
                    }

                    const refreshedToken = await SecureStore.getItemAsync('access_token');
                    if (!refreshedToken) {
                        console.warn('Sync aborted: token missing after refresh.');
                        break;
                    }
                    token = refreshedToken;

                    response = await postCheckIn(item);

                    if (response.status === 401) {
                        console.warn('Sync aborted: still unauthorized after refresh.');
                        break;
                    }
                }

                // Safely parse JSON, fallback to empty object if it fails
                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    // ✅ SUCCESS (Handles 200, 201, etc.)
                    await markCheckInSynced(item.id);

                    const guest = await findLocalGuestByTicket(item.guest_identifier);
                    if (guest) {
                        await markLocalGuestCheckedIn(guest.id);
                    }

                    emit({
                        type: 'sync_success',
                        identifier: item.guest_identifier,
                        guest: data.guest || data,
                        message: data.message || 'Guest successfully accredited.',
                    });
                } else if (response.status === 409) {
                    // ⚠️ CONFLICT (Already checked in)
                    const serverMessage = data.message || data.detail || 'Already checked in by another user';
                    await markCheckInConflict(item.id, serverMessage);

                    emit({
                        type: 'sync_conflict',
                        identifier: item.guest_identifier,
                        message: serverMessage,
                    });
                } else if (isTransientStatus(response.status)) {
                    // ⏳ TEMPORARY FAILURE (outside hours, throttled, server error)
                    // Keep the row queued and stop this batch — the next sync
                    // (connectivity change, app foreground, new login) retries.
                    const serverMessage = data.message || data.detail || `Server unavailable (${response.status})`;
                    emit({
                        type: 'sync_error',
                        identifier: item.guest_identifier,
                        message: `${serverMessage} Will retry automatically.`,
                    });
                    break;
                } else {
                    // ❌ PERMANENT ERROR (400 Bad Request, 404, 410, 422, etc.)
                    // The server rejected this payload/guest, so retrying can
                    // never succeed: mark it as a conflict and move on.
                    const serverMessage = data.message || data.detail || `Failed: ${response.status}`;
                    await markCheckInConflict(item.id, serverMessage);

                    emit({
                        type: 'sync_conflict',
                        identifier: item.guest_identifier,
                        message: serverMessage,
                    });
                }
            } catch {
                // 🌐 TRUE NETWORK ERROR (No internet, DNS failure, server unreachable)
                emit({
                    type: 'sync_error',
                    identifier: item.guest_identifier,
                    message: 'Network error. Will retry when connection returns.',
                });
                // Leave in queue, stop the batch until connectivity returns.
                break;
            }

            await notifyPendingCount();

            // Small delay between syncs to avoid overwhelming the server
            if (i < pending.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 600));
            }
        }
    } catch (error) {
        console.error('Sync error:', error);
    } finally {
        isSyncing = false;
        if (started) {
            emit({ type: 'sync_complete' });
            await notifyPendingCount();
        }
    }
};

export const triggerSync = (): void => {
    if (isSyncing) return;

    syncPendingCheckIns().catch((error) => {
        console.error('Sync trigger failed:', error);
    });
};