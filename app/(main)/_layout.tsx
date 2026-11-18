import { Stack } from 'expo-router';
import { useSyncManager } from '@/hooks/use-sync-manager';

export default function MainLayout() {
    // Authenticated shell: start replaying the offline queue as soon as the
    // user is signed in, and keep retrying on reconnect/foreground.
    useSyncManager();

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
        </Stack>
    );
}
