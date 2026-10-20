import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { GuestSummary } from '@/types';

interface ResultModalProps {
  success: 'true' | 'false' | 'queued';
  message: string;
  guest: GuestSummary | null;
  onClose: () => void;
}

export default function ResultModal({ success, message, guest, onClose }: ResultModalProps) {
  const isSuccess = success === 'true';
  const isQueued = success === 'queued';

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 200, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getCardStyle = () => {
    if (isQueued) return styles.cardQueued;
    return isSuccess ? styles.cardSuccess : styles.cardError;
  };

  const getIconColor = () => {
    if (isQueued) return '#F59E0B';
    return isSuccess ? '#22C55E' : '#EF4444';
  };

  const getIconBg = () => {
    if (isQueued) return '#FEF3C7';
    return isSuccess ? '#DCFCE7' : '#FEE2E2';
  };

  const getTitle = () => {
    if (isQueued) return 'Queued for Verification';
    return isSuccess ? 'Access Granted' : 'Access Denied';
  };

  const getIcon = () => {
    if (isQueued) return '⏳';
    return isSuccess ? '✓' : '✕';
  };

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Animated.View
        style={[
          styles.card,
          getCardStyle(),
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: getIconBg() }]}>
          <Text style={[styles.icon, { color: getIconColor() }]}>{getIcon()}</Text>
        </View>

        <Text style={[styles.title, { color: getIconColor() }]}>{getTitle()}</Text>
        <Text style={styles.message}>{message}</Text>

        {isSuccess && guest && (
          <View style={styles.details}>
            <Text style={styles.guestName}>{guest.adult_names}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: guest.category_color || '#6B7280' }]}>
                <Text style={styles.badgeText}>{guest.category_name || 'Regular'}</Text>
              </View>
              {guest.kids_count > 0 && (
                <Text style={styles.kidsText}>
                  {guest.kids_count} kid{guest.kids_count !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </View>
        )}

        <Pressable onPress={onClose} style={styles.doneBtn}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center',
    alignItems: 'center', padding: 24, zIndex: 1000,
  },
  card: {
    backgroundColor: '#FFF', width: '100%', padding: 28, borderRadius: 20,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  cardSuccess: { borderTopWidth: 4, borderTopColor: '#22C55E' },
  cardError: { borderTopWidth: 4, borderTopColor: '#EF4444' },
  cardQueued: { borderTopWidth: 4, borderTopColor: '#F59E0B' },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  icon: { fontSize: 32, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  message: {
    fontSize: 15, color: '#6B7280', textAlign: 'center',
    marginBottom: 24, lineHeight: 22,
  },
  details: {
    width: '100%', backgroundColor: '#F9FAFB', padding: 16,
    borderRadius: 12, marginBottom: 24, alignItems: 'flex-start',
  },
  guestName: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  kidsText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  doneBtn: {
    backgroundColor: '#111827', paddingVertical: 16, paddingHorizontal: 48,
    borderRadius: 999, width: '100%', alignItems: 'center',
  },
  doneText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});