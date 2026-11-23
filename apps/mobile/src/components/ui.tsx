/** Minimal shared mobile components. Colours follow the web tokens. */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useColorScheme, type TextInputProps } from 'react-native';

const light = { bg: '#f6f7f9', surface: '#ffffff', text: '#17202a', muted: '#5b6673', line: '#d5dbe1', accent: '#0b5cad', onAccent: '#ffffff', danger: '#b42318', warnBg: '#fef4e6', warn: '#b54708' };
const dark = { bg: '#0f1419', surface: '#161c23', text: '#e6e9ed', muted: '#9aa5b1', line: '#2c3640', accent: '#5aa3ec', onAccent: '#0b1520', danger: '#f97066', warnBg: '#352510', warn: '#fdb022' };

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.screen, { backgroundColor: t.bg }]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.muted : t.text }]}>{children}</Text>;
}

export function Button({ title, onPress, disabled, busy, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'secondary' }) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? t.accent : t.surface, borderColor: t.line, opacity: disabled || busy ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? t.onAccent : t.text} /> : <Text style={[styles.buttonText, { color: primary ? t.onAccent : t.text }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...props}
        style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: error ? t.danger : t.line }]}
      />
      {error ? <Text style={[styles.small, { color: t.danger }]} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

export function Notice({ title, children, tone = 'info' }: { title?: string; children: ReactNode; tone?: 'info' | 'warning' | 'error' }) {
  const t = useTheme();
  const color = tone === 'error' ? t.danger : tone === 'warning' ? t.warn : t.muted;
  return (
    <View style={[styles.notice, { borderColor: color, backgroundColor: tone === 'warning' ? t.warnBg : t.surface }]}>
      {title ? <Text style={[styles.label, { color: t.text }]}>{title}</Text> : null}
      <Text style={[styles.small, { color: t.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  button: { minHeight: 48, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 17 },
  small: { fontSize: 14, lineHeight: 20 },
  notice: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
});
