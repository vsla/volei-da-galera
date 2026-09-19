import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { c, radius, sp, type } from "../lib/theme";
import { initials } from "../lib/types";

export function Screen({
  children,
  scroll = true,
  edges = ["top"],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: ("top" | "bottom")[];
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: sp(4), paddingBottom: sp(24) }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: sp(4) }}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={[type.hero, { color: c.text }]}>{children}</Text>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <Text style={[type.title, { color: c.text, marginBottom: sp(2) }]}>
      {children}
    </Text>
  );
}

export function Section({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: sp(6),
        marginBottom: sp(2),
      }}
    >
      <Text style={[type.section, { color: c.dim }]}>
        {String(children).toUpperCase()}
      </Text>
      {right}
    </View>
  );
}

export function Muted({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[type.body, { color: c.dim }, style]}>{children}</Text>;
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const inner = (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.border,
          padding: sp(4),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  );
}

type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  small?: boolean;
};

export function Btn({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  small,
}: BtnProps) {
  const bg = {
    primary: c.accent,
    ghost: "transparent",
    subtle: c.surface2,
    danger: "transparent",
  }[variant];
  const fg = {
    primary: c.accentInk,
    ghost: c.text,
    subtle: c.text,
    danger: c.danger,
  }[variant];
  const off = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingVertical: small ? sp(2.5) : sp(4),
          paddingHorizontal: sp(4),
          alignItems: "center",
          justifyContent: "center",
          borderWidth: variant === "ghost" || variant === "danger" ? 1 : 0,
          borderColor: variant === "danger" ? c.danger : c.border,
          opacity: off ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text
          style={{
            color: fg,
            fontSize: small ? 13 : 15,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: sp(3) }}>
      {label ? (
        <Text style={[type.label, { color: c.dim, marginBottom: sp(1.5) }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.faint}
        {...rest}
        style={[
          {
            backgroundColor: c.surface2,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: c.border,
            paddingHorizontal: sp(3.5),
            paddingVertical: sp(3.5),
            color: c.text,
            fontSize: 16,
          },
          rest.style,
        ]}
      />
    </View>
  );
}

export function Avatar({
  name,
  size = 40,
  color = c.surface2,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Text style={{ color: c.text, fontSize: size * 0.36, fontWeight: "800" }}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function Pill({
  children,
  tone = "dim",
}: {
  children: React.ReactNode;
  tone?: "dim" | "accent" | "ok" | "warn";
}) {
  const fg = { dim: c.dim, accent: c.accent, ok: c.ok, warn: c.warn }[tone];
  return (
    <View
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: fg,
        paddingHorizontal: sp(2),
        paddingVertical: sp(0.75),
      }}
    >
      <Text style={[type.tiny, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Row({
  children,
  gap = 2,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: sp(gap) }, style]}>
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: sp(3) }}>
      <ActivityIndicator color={c.accent} size="large" />
      {label ? <Muted>{label}</Muted> : null}
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: sp(8) }}>
      <Text style={[type.label, { color: c.text, marginBottom: sp(1) }]}>{title}</Text>
      {hint ? <Text style={[type.body, { color: c.faint, textAlign: "center" }]}>{hint}</Text> : null}
    </Card>
  );
}
