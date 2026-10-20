import {
    createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { User } from '@/types';
import { setForceLogoutCallback } from '@/services/authEvents';

type AuthContextValue = {
    user: User | null;
    isLoading: boolean;
    signIn: (payload: { access: string; refresh: string; user: User }) => Promise<void>;
    signOut: () => Promise<void>;
    completePasswordChange: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session once on startup
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const token = await SecureStore.getItemAsync('access_token');
                const raw = await SecureStore.getItemAsync('user');

                if (alive && token && raw) {
                    setUser(JSON.parse(raw));
                }
            } catch (error) {
                console.warn('Session restore failed:', error);
            } finally {
                if (alive) setIsLoading(false);
            }
        })();

        return () => { alive = false; };
    }, []);

    const signIn = useCallback(async (payload: {
        access: string; refresh: string; user: User;
    }) => {
        await SecureStore.setItemAsync('access_token', payload.access);
        await SecureStore.setItemAsync('refresh_token', payload.refresh);
        await SecureStore.setItemAsync('user', JSON.stringify(payload.user));

        setUser(payload.user); // ✅ root guard now learns the user is authenticated
        console.log('Restored user:', JSON.stringify(payload.user));
    }, []);

    const signOut = useCallback(async () => {
        await Promise.all([
            SecureStore.deleteItemAsync('access_token'),
            SecureStore.deleteItemAsync('refresh_token'),
            SecureStore.deleteItemAsync('user'),
        ]);
        setUser(null);
    }, []);

    // Inside AuthProvider:
    useEffect(() => {
        // Register signOut as the force logout handler
        setForceLogoutCallback(() => {
            signOut();
        });

        // Cleanup on unmount
        return () => {
            setForceLogoutCallback(null);
        };
    }, [signOut]);

    const completePasswordChange = useCallback(async () => {
        const raw = await SecureStore.getItemAsync('user');
        const next: User | null = raw ? { ...JSON.parse(raw), first_login: false } : null;
        
        console.log("Complete Password Change Log: \n", next)
        if (next) {
            await SecureStore.setItemAsync('user', JSON.stringify(next));
        }

        setUser(next); // ✅ root guard now learns first_login is finished
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoading, signIn, signOut, completePasswordChange }}>
            {children}
        </AuthContext.Provider>
    );
}