import * as SecureStore from 'expo-secure-store';
import {
    getPendingCheckIns,
    markCheckInSynced,
    markCheckInConflict,
    markLocalGuestCheckedIn,
    findLocalGuestByTicket,
    getPendingCount,
} from './database';

const API_BASE_URL = 'http://192.168.43.198:8000/api'; // ⚠️ Update with your IP

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

export const syncPendingCheckIns = async (): Promise<void> => {
    if (isSyncing) return;

    const pending = await getPendingCheckIns();
    if (pending.length === 0) return;

    isSyncing = true;
    const total = pending.length;

    emit({ type: 'sync_start', total });

    try {
        const token = await SecureStore.getItemAsync('access_token');
        if (!token) {
            isSyncing = false;
            return;
        }

        for (let i = 0; i < pending.length; i++) {
            const item = pending[i] as any;

            emit({
                type: 'sync_progress',
                current: i + 1,
                total,
                identifier: item.guest_identifier,
            });

            try {
                const response = await fetch(`${API_BASE_URL}/events/${item.event_id}/check-in/`, {
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
                } else if (response.status === 401) {
                    // 🔑 UNAUTHORIZED - Token expired. Abort sync entirely.
                    console.warn('Sync aborted: Unauthorized (401). Token may be expired.');
                    // Optional: You can import triggerForceLogout here to kick them to login
                    break;
                } else {
                    // ❌ PERMANENT ERROR (400 Bad Request, 403, 500, etc.)
                    // Mark as conflict so it is REMOVED from the pending queue and doesn't block future syncs.
                    const serverMessage = data.message || data.detail || `Failed: ${response.status}`;
                    await markCheckInConflict(item.id, serverMessage);

                    emit({
                        type: 'sync_conflict', // Treat permanent errors as conflicts to clear the queue
                        identifier: item.guest_identifier,
                        message: serverMessage,
                    });

                    // ✅ Use 'continue' instead of 'break' so the loop moves on to the NEXT guest!
                    continue;
                }
            } catch (networkError: any) {
                // 🌐 TRUE NETWORK ERROR (No internet, DNS failure, server unreachable)
                emit({
                    type: 'sync_error',
                    identifier: item.guest_identifier,
                    message: 'Network error. Will retry when connection returns.',
                });
                // ✅ Break on network errors, leave in queue to try again later
                break;
            }

            await notifyPendingCount();

            // Small delay between syncs to avoid overwhelming the server
            if (i < pending.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 600));
                // each
            }
        }
    } catch (error) {
        console.error('Sync error:', error);
    } finally {
        isSyncing = false;
        emit({ type: 'sync_complete' });
        await notifyPendingCount();
    }
};

export const triggerSync = () => {
    if (!isSyncing) {
        syncPendingCheckIns();
    }
};