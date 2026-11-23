import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Body, Notice, Screen, Title } from '@/components/ui';

export default function Index() {
  const { loading, session } = useSession();

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <Title>Industrial Technician Marketplace</Title>
        <Notice tone="warning" title="Not configured">
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env.local (see docs/setup.md).
        </Notice>
      </Screen>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
        <Body muted>Loading…</Body>
      </View>
    );
  }

  return <Redirect href={session ? '/account' : '/sign-in'} />;
}
