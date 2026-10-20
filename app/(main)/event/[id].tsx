import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Animated, Easing, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { searchGuests, checkInGuest, getActivityLog, api } from '@/services/api';
import { GuestSummary, ActivityLog, Location } from '@/types';
import NetInfo from '@react-native-community/netinfo';
import {
    initDatabase,
    cacheGuestList,
    searchLocalGuests,
    queueCheckIn,
    getPendingCount,
    getEventLastSynced
} from '@/services/database';
import {
    triggerSync,
    subscribeToSync,
    SyncEvent,
    getIsSyncing
} from '@/services/sync';
import ResultModal from '../../../components/ResultModal';

export default function CheckInScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const eventId = parseInt(id);
    const router = useRouter();

    const [isOnline, setIsOnline] = useState(true);
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<GuestSummary[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [syncStatus, setSyncStatus] = useState<{
        active: boolean;
        current: number;
        total: number;
        identifier: string;
    } | null>(null);

    // ✅ NEW: Auto-triggered result modal state
    const [autoResult, setAutoResult] = useState<{
        success: 'true' | 'false' | 'queued';
        message: string;
        guest: any | null;
    } | null>(null);

    const autoResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const unsubscribe = subscribeToSync((event: SyncEvent) => {
            switch (event.type) {
                case 'sync_start':
                    setSyncStatus({ active: true, current: 0, total: event.total, identifier: '' });
                    break;

                case 'sync_progress':
                    setSyncStatus({
                        active: true,
                        current: event.current,
                        total: event.total,
                        identifier: event.identifier,
                    });
                    break;

                case 'sync_success':
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setAutoResult({
                        success: 'true',
                        message: event.message,
                        guest: event.guest,
                    });
                    fetchActivityLog();
                    break;

                case 'sync_conflict':
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    setAutoResult({
                        success: 'false',
                        message: `${event.identifier}: ${event.message}`,
                        guest: null,
                    });
                    break;

                case 'sync_error':
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setAutoResult({
                        success: 'false',
                        message: `${event.identifier}: ${event.message}`,
                        guest: null,
                    });
                    break;

                case 'sync_complete':
                    setSyncStatus(null);
                    break;

                case 'pending_count_changed':
                    setPendingCount(event.count);
                    break;
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // ==========================================
    // AUTO-DISMISS RESULT MODAL
    // ==========================================
    useEffect(() => {
        if (autoResult) {
            if (autoResultTimer.current) clearTimeout(autoResultTimer.current);
            autoResultTimer.current = setTimeout(() => {
                setAutoResult(null);
            }, 2500); // Auto-dismiss after 2.5 seconds
        }
        return () => {
            if (autoResultTimer.current) clearTimeout(autoResultTimer.current);
        };
    }, [autoResult]);

    useEffect(() => {
        initDatabase();
    }, [])

    useFocusEffect(
        useCallback(() => {
            loadEventData();
            updatePendingCount();
            // Trigger sync if there are pending items and we're online
            if (isOnline) {
                getPendingCount(eventId).then((count) => {
                    if (count > 0 && !getIsSyncing()) {
                        triggerSync();
                    }
                });
            }
        }, [eventId, isOnline])
    );

    // useEffect(() => {

    //     setOnConflictCallback((message, guestIdentifier) => {
    //         Alert.alert(
    //             '⚠️ Check-In Conflict',
    //             `${guestIdentifier}: ${message}\n\nThis check-in was already processed by another ambassador.`,
    //             [{ text: 'OK' }]
    //         );
    //     })

    //     setOnPendingCountChangeCallback((count) => {
    //         setPendingCount(count)
    //     })

    //     return () => {
    //         setOnConflictCallback(null)
    //         setOnPendingCountChangeCallback(null)
    //     }
    // }, []);

    // ==========================================
    // NETWORK LISTENER
    // ==========================================
    
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state) => {
            const connected = state.isConnected ?? false;
            setIsOnline(connected);
            if (connected) {
                triggerSync();
            }
        });
        return () => unsubscribe();
    }, []);

    const updatePendingCount = async () => {
        const count = await getPendingCount(eventId);
        setPendingCount(count);
    };

    const loadEventData = async () => {
        // if (isOnline) return;

        try {
            const event = await api(`/events/${eventId}/`);
            setLocations(event.locations || []);
            if (event.locations && event.locations.length === 1) {
                setSelectedLocation(event.locations[0]);
            }

            // Fetch and cache guest list
            const guests = await api(`/events/${eventId}/guests/`);
            // console.log('Guests response:', guests)
            await cacheGuestList(eventId, guests);

            await fetchActivityLog();
        } catch (e) {
            console.error('Failed to load event data', e);
            Alert.alert('Error', 'Failed to load event data. Please check your connection.');
            throw e; // Re-throw so handleRefresh knows it failed
        }
    };

    const fetchLocations = async () => {
        try {
            const event = await api(`/events/${eventId}/`);
            setLocations(event.locations || []);
            if (event.locations && event.locations.length === 1) {
                setSelectedLocation(event.locations[0]);
            }
        } catch (e) {
            console.error('Failed to fetch event details', e);
        }
    };

    const fetchActivityLog = async () => {
        try {
            const data = await getActivityLog(eventId);
            setActivityLog(data);
        } catch (e) {
            console.error('Failed to fetch activity log', e);
        }
    };

    const handleRefresh = async () => {
        if (!isOnline) return;
        setIsRefreshing(true);

        try {
            await loadEventData();
            await updatePendingCount();
        } catch (error) {
            console.error('Refresh failed: ', error)
        } finally {
            setIsRefreshing(false);
        }
    };


    // Debounced Search
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (searchQuery.trim().length < 3) {
            setSearchResults([]);
            return;
        }
        searchTimer.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                if (isOnline) {
                    const results = await searchGuests(eventId, searchQuery.trim());
                    setSearchResults(results);
                } else {
                    const results = await searchLocalGuests(eventId, searchQuery.trim());
                    setSearchResults(results);
                }
            } catch (e) {
                console.error('Search failed', e);
            } finally {
                setIsSearching(false);
            }
        }, 400);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [searchQuery, isOnline]);

    const handleCheckIn = async (identifier: string) => {
        if (!identifier.trim() || isProcessing) return;
        if (!selectedLocation && locations.length > 1) {
            Alert.alert('Location Required', 'Please select your accreditation location first.');
            return;
        }

        setIsProcessing(true);

        // OFFLINE PATH
        if (!isOnline) {
            try {
                await queueCheckIn(identifier.trim(), eventId, selectedLocation?.id || null);
                await updatePendingCount();
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

                router.push({
                    pathname: '/(main)/result',
                    params: {
                        success: 'queued',
                        message: 'Scan recorded offline. Will verify when internet is restored.',
                        guest: 'null',
                        eventId: id,
                    }
                });
            } catch (e) {
                Alert.alert('Error', 'Failed to queue check-in');
            } finally {
                setIsProcessing(false);
                setSearchQuery('');
                setSearchResults([]);
            }
            return;
        }

        // ONLINE PATH
        try {
            const data = await checkInGuest(eventId, identifier.trim(), selectedLocation?.id || null);

            if (data.status === 200) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.push({
                    pathname: '/(main)/result',
                    params: {
                        success: 'true',
                        message: data.message,
                        guest: JSON.stringify(data.guest),
                        eventId: id
                    }
                });
                fetchActivityLog(); // Refresh log
            }
        } catch (error: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            let errorMessage = error.message || 'Check-in failed';
            if (errorMessage.includes('not a registered guest') || errorMessage.includes('not found')) {
                errorMessage = 'This QR code is not registered for this event.';
            } else if (errorMessage.includes('already been checked in') || errorMessage.includes('Already checked in')) {
                errorMessage = error.message;
            }

            router.push({
                pathname: '/(main)/result',
                params: {
                    success: 'false',
                    message: errorMessage,
                    guest: 'null',
                    eventId: id,
                }
            })
        } finally {
            setIsProcessing(false);
            setSearchQuery('');
            setSearchResults([]);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRight}>
                    {pendingCount > 0 && (
                        <View style={styles.pendingBadge}>
                            <Text style={styles.pendingText}>{pendingCount}</Text>
                        </View>
                    )}
                    <View style={[styles.statusPill, { backgroundColor: isOnline ? '#F0FDF4' : '#FEF2F2' }]}>
                        <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22C55E' : '#EF4444' }]} />
                        <Text style={[styles.statusText, { color: isOnline ? '#15803D' : '#B91C1C' }]}>
                            {isOnline ? 'Online' : 'Offline'}
                        </Text>
                    </View>
                </View>
            </View>

            {syncStatus && syncStatus.active && (
                <View style={styles.syncBanner}>
                    <ActivityIndicator size="small" color="#1D4ED8" />
                    <Text style={styles.syncText}>
                        Syncing {syncStatus.current} of {syncStatus.total}...
                    </Text>
                </View>
            )}

            <FlatList
                data={activityLog}
                keyExtractor={(item) => item.id.toString()}

                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        enabled={isOnline}
                        tintColor="#111827"
                    />
                }
                ListHeaderComponent={
                    <View style={styles.controls}>
                        {!isOnline && (
                            <View style={styles.offlineBanner}>
                                <Text style={styles.offlineBannerText}>
                                    📴 Offline Mode — Scans will sync when connection returns
                                </Text>
                            </View>
                        )}
                        {/* Location Selector */}
                        {locations.length > 1 && (
                            <View style={styles.locationPicker}>
                                <Text style={styles.locationLabel}>Your Location:</Text>
                                <FlatList
                                    horizontal
                                    data={locations}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.locationChip, selectedLocation?.id === item.id && styles.locationChipActive]}
                                            onPress={() => setSelectedLocation(item)}
                                        >
                                            <Text style={[styles.locationChipText, selectedLocation?.id === item.id && styles.locationChipTextActive]}>
                                                {item.name}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={{ gap: 8 }}
                                />
                            </View>
                        )}

                        {/* Manual Search */}
                        <View style={styles.searchContainer}>
                            <TextInput
                                style={styles.searchInput}
                                placeholder={isOnline ? "Scan QR or type guest name..." : "Search cached guests..."}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="words"
                                returnKeyType="search"
                                onSubmitEditing={() => searchQuery.trim().length >= 3 && handleCheckIn(searchQuery)}
                            />
                            {isSearching && <ActivityIndicator style={styles.searchSpinner} color="#111827" />}

                            {/* Search Dropdown */}
                            {searchResults.length > 0 && (
                                <View style={styles.dropdown}>
                                    {searchResults.map((guest) => (
                                        <TouchableOpacity
                                            key={guest.id}
                                            style={styles.dropdownItem}
                                            onPress={() => handleCheckIn(guest.ticket_number)}
                                            disabled={guest.is_checked_in_today}
                                        >
                                            <View style={styles.dropdownLeft}>
                                                <Text style={styles.dropdownName}>{guest.adult_names}</Text>
                                                {guest.kids_count > 0 && (
                                                    <Text style={styles.dropdownKids}>{guest.kids_count} kid{guest.kids_count !== 1 ? 's' : ''}</Text>
                                                )}
                                            </View>
                                            <View style={[styles.dropdownDot, { backgroundColor: guest.category_color || '#6B7280' }]} />
                                            {guest.is_checked_in_today && <Text style={styles.checkedInBadge}>✓ Checked In</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Scan Button */}
                        <TouchableOpacity
                            style={styles.scanButton}
                            onPress={() => router.push({
                                pathname: '/(main)/scanner',
                                params: {
                                    eventId: id,
                                    locationId: selectedLocation?.id ? selectedLocation.id.toString() : "null"
                                }
                            })}
                        >
                            <Text style={styles.scanButtonText}>📷 Open QR Scanner</Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionTitle}>Recent Activity</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={{ paddingHorizontal: 16 }}>
                        <View style={styles.activityItem}>
                            <View style={[styles.activityDot, { backgroundColor: item.is_accredited ? '#22C55E' : '#EF4444' }]} />
                            <View style={styles.activityInfo}>
                                <Text style={styles.activityName}>{item.guest_name}</Text>
                                <Text style={styles.activityMeta}>
                                    {item.location_name ? `${item.location_name} • ` : ''}{item.time}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>No check-ins yet for today.</Text>
                }
                contentContainerStyle={{ paddingBottom: 40 }}
            />

            {autoResult && (
                <ResultModal
                    success={autoResult.success}
                    message={autoResult.message}
                    guest={autoResult.guest}
                    onClose={() => setAutoResult(null)}
                />
            )}
        </View>
    );
}

// Emil Kowalski inspired styles
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 60, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    backBtn: { padding: 8 },
    backText: { fontSize: 16, color: '#111827', fontWeight: '600' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    pendingBadge: {
        backgroundColor: '#F59E0B', minWidth: 28, height: 28, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10,
    },
    pendingText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    statusText: { fontSize: 13, fontWeight: '600' },
    syncBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, backgroundColor: '#DBEAFE', paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#BFDBFE',
    },
    syncText: { color: '#1D4ED8', fontSize: 13, fontWeight: '600' },
    controls: { padding: 16 },
    offlineBanner: { backgroundColor: '#FEF3C7', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
    offlineBannerText: { color: '#92400E', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    locationPicker: { marginBottom: 16 },
    locationLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    locationChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
    locationChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
    locationChipText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
    locationChipTextActive: { color: '#FFF', fontWeight: '600' },
    searchContainer: { position: 'relative', marginBottom: 16 },
    searchInput: { backgroundColor: '#FFF', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 16, color: '#111827' },
    searchSpinner: { position: 'absolute', right: 16, top: 18 },
    dropdown: { position: 'absolute', top: 56, left: 0, right: 0, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    dropdownLeft: { flex: 1 },
    dropdownName: { fontSize: 15, fontWeight: '600', color: '#111827' },
    dropdownKids: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    dropdownDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    checkedInBadge: { fontSize: 12, color: '#22C55E', fontWeight: '600' },
    scanButton: { backgroundColor: '#111827', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 24 },
    scanButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: '#6B7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    activityItem: { flexDirection: 'row', backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 8 },
    activityDot: { width: 10, height: 10, borderRadius: 5, marginRight: 16, marginTop: 4 },
    activityInfo: { flex: 1 },
    activityName: { fontSize: 15, fontWeight: '600', color: '#111827' },
    activityMeta: { fontSize: 13, color: '#6B7280', marginTop: 4 },
    emptyText: { textAlign: 'center', color: '#9CA3AF', fontSize: 14, marginTop: 24 },
});