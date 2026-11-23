import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import Constants from 'expo-constants';
import { acceptLegalDocuments, registerRole, signOut } from '@itm/api';
import { ROLE_LABELS, reportError, toAppError } from '@itm/core';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { Body, Button, Notice, Screen, Title } from '@/components/ui';

export default function Account() {
  const { loading, session, context, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !session) return <Redirect href="/sign-in" />;
  if (!context || !supabase) return <Screen><Body muted>Loading…</Body></Screen>;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      const err = toAppError(e);
      reportError(err, { where: 'mobile.account' });
      setError(err.userMessage);
    } finally {
      setBusy(false);
    }
  }

  if (context.profile.account_status !== 'active') {
    return (
      <Screen>
        <Notice tone="error" title="Your account is not active">Contact the Grievance Officer if you think this is a mistake.</Notice>
      </Screen>
    );
  }

  if (context.roles.length === 0) {
    return (
      <Screen>
        <Title>How will you use the app?</Title>
        <Button title="I need a technician" busy={busy} onPress={() => run(() => registerRole(supabase!, 'customer'))} />
        <Button title="I am an independent technician" variant="secondary" busy={busy} onPress={() => run(() => registerRole(supabase!, 'technician'))} />
        <Body muted>Service companies: register on the website first, then sign in here.</Body>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Screen>
    );
  }

  if (context.pending_documents.length > 0) {
    const anyDraft = context.pending_documents.some((d) => d.review_status !== 'approved');
    return (
      <ScrollView>
        <Screen>
          <Title>Please review and accept</Title>
          {anyDraft ? (
            <Notice tone="warning" title="DRAFT — LEGAL REVIEW REQUIRED">
              These documents are drafts for the pilot and have not yet been reviewed by a lawyer.
            </Notice>
          ) : null}
          {context.pending_documents.map((d) => (
            <Body key={d.id}>• {d.title} (v{d.version})</Body>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Switch value={agree} onValueChange={setAgree} accessibilityLabel="I have read and agree to these documents" />
            <Body>I have read and agree to these documents.</Body>
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            title="Agree and continue"
            busy={busy}
            disabled={!agree}
            onPress={() =>
              run(() =>
                acceptLegalDocuments(supabase!, context.pending_documents.map((d) => d.id), 'android', Constants.expoConfig?.version),
              )
            }
          />
        </Screen>
      </ScrollView>
    );
  }

  return (
    <Screen>
      <Title>My account</Title>
      <Body muted>{context.profile.phone ?? ''}</Body>
      {context.roles.map((r) => (
        <Body key={r.id}>{ROLE_LABELS[r.role]}</Body>
      ))}
      <Notice title="More coming soon">Profiles, machine selection and service requests arrive in the next development phases.</Notice>
      <Button
        title="Sign out"
        variant="secondary"
        busy={busy}
        onPress={() =>
          run(async () => {
            await signOut(supabase!);
            router.replace('/sign-in');
          })
        }
      />
    </Screen>
  );
}
