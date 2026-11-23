import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { sendOtp, verifyOtp } from '@itm/api';
import { reportError, toAppError, type AppError } from '@itm/core';
import { supabase } from '@/lib/supabase';
import { Body, Button, Field, Notice, Screen, Title, useTheme } from '@/components/ui';

export default function SignIn() {
  const t = useTheme();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function run(fn: () => Promise<void>) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const err = toAppError(e);
      reportError(err, { where: 'mobile.sign-in' });
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Title>Sign in or create an account</Title>
        {!sentTo ? (
          <>
            <Body muted>We&apos;ll send a 6-digit code to your mobile number.</Body>
            <Field
              label="Mobile number"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="98765 43210"
              value={phone}
              onChangeText={setPhone}
              error={error?.fieldErrors?.phone?.[0]}
            />
            {error && !error.fieldErrors ? <Notice tone="error">{error.userMessage}</Notice> : null}
            <Button title="Send code" busy={busy} onPress={() => run(async () => setSentTo(await sendOtp(supabase!, phone)))} />
          </>
        ) : (
          <>
            <Body>Code sent to {sentTo}.</Body>
            <Field
              label="6-digit code"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              error={error?.fieldErrors?.token?.[0]}
            />
            {error && !error.fieldErrors ? <Notice tone="error">{error.userMessage}</Notice> : null}
            <Button
              title="Verify and continue"
              busy={busy}
              disabled={code.length !== 6}
              onPress={() =>
                run(async () => {
                  await verifyOtp(supabase!, sentTo, code);
                  router.replace('/account');
                })
              }
            />
            <Pressable accessibilityRole="button" onPress={() => { setSentTo(null); setCode(''); setError(null); }}>
              <Text style={{ color: t.accent, textAlign: 'center', padding: 8 }}>Change number</Text>
            </Pressable>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
