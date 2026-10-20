import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN_HERE',
  tracesSampleRate: 0.1,
  environment: __DEV__ ? 'development' : 'production',
})

SplashScreen.preventAutoHideAsync()

function AuthGate() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  console.log("Segments: ", segments)

  useEffect(() => {
    if (isLoading) return;
    if (segments.length < 1) return;

    // Case 1: No session → only the login screen is allowed
    if (!user) {
      if (segments[1] !== 'login') {
        router.replace('/(auth)/login');
      }
      return;
    }

    // Case 2: Session exists but password must be changed
    if (user.first_login) {
      if (segments[1] !== 'change-password') {
        router.replace('/(auth)/change-password');
      }
      return;
    }

    // Case 3: Fully authenticated → never allow them to sit in (auth)
    if (segments[0] === '(auth)') {
      router.replace('/(main)');
    }
  }, [user, isLoading, segments, router]);

  useEffect(() => {
    if (!isLoading && segments.length > 0) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, segments]);

  if (isLoading) {
    return null
  }

  return (
    <Slot />
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}