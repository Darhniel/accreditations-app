import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { api } from '../../src/services/api';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const handleLogin = async () => {
        if (!email || !password) return Alert.alert('Error', 'Please fill in all fields');
        setLoading(true);

        try {
            const data = await api('/auth/login/', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            await signIn(data)

        } catch (error: any) {
            Alert.alert('Login Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.form}>
                        <Image
                            source={require('../../assets/images/logo-text.png')}
                            style={styles.logo}
                            resizeMode="contain"
                            accessibilityRole="image"
                            accessibilityLabel="Accredit Interactive"
                        />
                        <Text style={styles.title}>Guest Accreditation</Text>

                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Email"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                autoComplete="email"
                                textContentType="emailAddress"
                            />
                        </View>

                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Password"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoComplete="current-password"
                                textContentType="password"
                                onSubmitEditing={handleLogin}
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowPassword(!showPassword)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={22}
                                    color="#6B7280"
                                />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Login</Text>}
                        </TouchableOpacity>
                        {/* <TouchableOpacity onPress={() => router.navigate("/_sitemap")}>
                            <Text>SITEMAP</Text>
                        </TouchableOpacity> */}
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
    logo: { width: '100%', maxWidth: 300, aspectRatio: 594 / 152, alignSelf: 'center', marginBottom: 16 },
    title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 32, color: '#111827' },
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