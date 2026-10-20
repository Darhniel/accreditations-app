import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { api } from '@/services/api';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function HomeScreen() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { signOut } = useAuth();

  const router = useRouter();

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const data = await api('/events/');
      setEvents(data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load events. Please check your connection.');
      console.error('Failed to load events', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await api('/events/');
      setEvents(data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to refresh events. Please check your connection.');
      console.error('Failed to refresh events', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {

    await signOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Events</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#111827" style={{ marginTop: 40 }} />
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No events assigned to you yet.</Text>
          <Text style={styles.emptySubtext}>Contact your admin to get access.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/(main)/event/[id]', params: { id: item.id.toString() } })}
            >
              <Text style={styles.eventName}>{item.name}</Text>
              <Text style={styles.eventDate}>📅 {item.start_date} to {item.end_date}</Text>
              <Text style={styles.eventLocation}>📍 {item.location_text || 'Location TBD'}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#E55353', fontWeight: '600', fontSize: 16 },
  listContent: { padding: 16 },
  card: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  eventName: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  eventDate: { fontSize: 14, color: '#6B7280', marginBottom: 4 },
  eventLocation: { fontSize: 14, color: '#6B7280' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#6B7280', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
});