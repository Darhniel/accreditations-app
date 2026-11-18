import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { triggerSync } from '@/services/sync';

/**
 * Runs the offline check-in queue whenever the app can actually sync:
 * when the authenticated area mounts (right after login or session restore),
 * when connectivity returns, and when the app comes back to the foreground.
 *
 * Previously sync was only started from the event screen, so a user who
 * logged out offline and logged back in had to navigate into an event before
 * their queued scans were replayed.
 */
export function useSyncManager(): void {
    useEffect(() => {
        // Fires immediately with the current state, which covers app launch
        // and the post-login mount.
        const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
            if (state.isConnected && state.isInternetReachable !== false) {
                triggerSync();
            }
        });

        const appStateSubscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                // Don't queue a doomed batch while the device is offline.
                NetInfo.fetch().then((state) => {
                    if (state.isConnected && state.isInternetReachable !== false) {
                        triggerSync();
                    }
                });
            }
        });

        return () => {
            unsubscribeNetInfo();
            appStateSubscription.remove();
        };
    }, []);
}
