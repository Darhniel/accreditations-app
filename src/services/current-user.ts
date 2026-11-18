import * as SecureStore from 'expo-secure-store';

// The offline queue is scoped per account so one ambassador's queued scans can
// never be replayed with a different ambassador's token. The id is cached in
// memory (SecureStore reads hit the keychain/keystore) and refreshed by
// AuthContext on sign-in, sign-out and session restore.
let cachedUserId: number | null | undefined;

export const setCurrentUserId = (userId: number | null): void => {
    cachedUserId = userId;
};

export const getCurrentUserId = async (): Promise<number | null> => {
    if (cachedUserId !== undefined) return cachedUserId;

    try {
        const raw = await SecureStore.getItemAsync('user');
        if (!raw) {
            cachedUserId = null;
            return null;
        }

        const parsed = JSON.parse(raw);
        const parsedId = typeof parsed?.id === 'number' ? parsed.id : null;
        cachedUserId = parsedId;
        return parsedId;
    } catch {
        cachedUserId = null;
        return null;
    }
};
