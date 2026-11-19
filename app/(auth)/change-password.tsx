import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from "@react-native-vector-icons/ionicons"
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChangePasswordScreen() {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { completePasswordChange } = useAuth();

    const handleChangePassword = async () => {
        if (!oldPassword || !newPassword) return Alert.alert('Error', 'Please fill in all fields');
        if (newPassword.length < 8) return Alert.alert('Error', 'The new password must be at least 8 characters');
        setLoading(true);

        try {
            await api('/auth/change-password/', {
                method: 'PUT',
                body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
            });

            await completePasswordChange();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.form}>
                        <Text style={styles.title}>Change Temporary Password</Text>
                        <Text style={styles.subtitle}>For security, please set a new password.</Text>

                        <Text style={styles.label}>Current Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Current Password"
                                value={oldPassword}
                                onChangeText={setOldPassword}
                                secureTextEntry={!showOldPassword}
                                textContentType="password"
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowOldPassword(!showOldPassword)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={showOldPassword ? 'Hide password' : 'Show password'}
                            >
                                <Ionicons
                                    name={showOldPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={22}
                                    color="#6B7280"
                                />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>New Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="New Password"
                                value={newPassword}
                                onChangeText={setNewPassword}
                                secureTextEntry={!showNewPassword}
                                textContentType="newPassword"
                                onSubmitEditing={handleChangePassword}
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowNewPassword(!showNewPassword)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                            >
                                <Ionicons
                                    name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={22}
                                    color="#6B7280"
                                />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.button} onPress={handleChangePassword} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Update Password</Text>}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    // Caps the form on tablets/foldables and lets it grow on small phones.
    form: { width: '100%', maxWidth: 420, alignSelf: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#111827' },
    subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 32, color: '#6B7280' },
    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginLeft: 4 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    input: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: '#111827'
    },
    eyeIcon: {
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    button: { backgroundColor: '#111827', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});