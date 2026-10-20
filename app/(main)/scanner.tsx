import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { checkInGuest } from '@/services/api';
import { queueCheckIn, getPendingCount } from '@/services/database';

export default function ScannerScreen() {
    const { eventId, locationId } = useLocalSearchParams<{ eventId: string; locationId: string }>();
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(state.isConnected ?? false);
        });
        return () => unsubscribe();
    }, [])

    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        if (isProcessing) return;
        setIsProcessing(true);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const parsedEventId = parseInt(eventId);
        const parsedLocationId = locationId && locationId !== 'null' ? parseInt(locationId) : null;

        // OFFLINE PATH
        if (!isOnline) {
            try {
                await queueCheckIn(data, parsedEventId, parsedLocationId);
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

                router.replace({
                    pathname: '/(main)/result',
                    params: {
                        success: 'queued',
                        message: 'Scan recorded offline. Will verify when internet is restored.',
                        guest: 'null',
                        eventId,
                    }
                });
            } catch (e) {
                Alert.alert('Error', 'Failed to queue scan');
            } finally {
                setIsProcessing(false);
            }
            return;
        }

        // ONLINE PATH
        try {
            const res = await checkInGuest(
                parsedEventId,
                data,
                parsedLocationId
            );

            if (res.status === 200) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.replace({
                    pathname: '/(main)/result',
                    params: {
                        success: 'true',
                        message: res.message,
                        guest: JSON.stringify(res.guest),
                        eventId,
                        locationId: locationId || "null"
                    }
                });
            }
        } catch (error: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            let errorMessage = error.message || 'Check-in failed';

            if (errorMessage.includes('not a registered guest') || errorMessage.includes('not found')) {
                errorMessage = 'This QR code is not registered for this event.';
            } else if (errorMessage.includes('Already checked in')) {
                errorMessage = 'This guest has already been checked in today.';
            } else if (errorMessage.includes('outside allowed hours')) {
                errorMessage = 'Check-ins are not allowed at this time.';
            }

            router.replace({
                pathname: '/(main)/result',
                params: {
                    success: 'false',
                    message: errorMessage,
                    guest: 'null',
                    eventId,
                    locationId: locationId || "null"
                }
            });
        } finally {
            setIsProcessing(false);
        }
    };

    if (!permission) {
        return <View style={styles.container}><Text>Requesting camera permission...</Text></View>;
    }
    if (!permission.granted) {
        return (
            <View style={[styles.container, { justifyContent: "center" }]}>
                <Text style={styles.errorText}>Camera access required</Text>
                <Pressable onPress={requestPermission} style={styles.button}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                onBarcodeScanned={isProcessing ? undefined : handleBarCodeScanned}
            />

            {/* Overlay */}
            <View style={styles.overlay} pointerEvents="box-none">
                {!isOnline && (
                    <View style={styles.offlineIndicator}>
                        <Text style={styles.offlineText}>📴 Offline — Scans will sync later</Text>
                    </View>
                )}
                {/* Crosshair */}
                <View style={styles.crosshairBox}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                </View>

                {/* Cancel Button */}
                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    offlineIndicator: { position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: 'rgba(245, 158, 11, 0.9)', padding: 12, borderRadius: 12 },
    offlineText: { color: '#FFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    crosshairBox: { width: 260, height: 260, position: 'relative' },
    corner: { position: 'absolute', width: 30, height: 30, borderColor: '#22C55E' },
    cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
    cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
    cancelBtn: { marginTop: 48, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
    cancelText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
    errorText: { color: '#EF4444', fontSize: 16, textAlign: 'center', marginBottom: 16 },
    button: { backgroundColor: '#111827', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignSelf: 'center' },
    buttonText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
});