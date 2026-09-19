import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { c, radius, sp, type } from "../lib/theme";
import { Btn } from "./ui";

/**
 * A GAVETA DE BAIXO.
 *
 * Tudo que é ação sobre uma coisa específica abre aqui, e não numa tela
 * nova: na quadra a pessoa está de pé, com uma mão só, e voltar de uma
 * tela empilhada custa um gesto que ninguém acerta no escuro. A gaveta
 * fecha tocando fora.
 *
 * `Alert.alert` do sistema serviria pra parte disso, mas não aceita
 * lista de nomes — e metade das ações daqui é "escolher quem".
 */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
        onPress={onClose}
      />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: c.surface }}>
        <View
          style={{
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: c.border,
            paddingHorizontal: sp(4),
            paddingTop: sp(3),
            maxHeight: 560,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.border,
              marginBottom: sp(3),
            }}
          />
          <Text style={[type.title, { color: c.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[type.body, { color: c.dim, marginTop: sp(1) }]}>
              {subtitle}
            </Text>
          ) : null}
          <ScrollView
            style={{ marginTop: sp(4) }}
            contentContainerStyle={{ paddingBottom: sp(4), gap: sp(2) }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Confirmação para o que não dá pra desfazer.
 *
 * §12 do `reasonable.md`: encerrar, resetar e remover pedem um segundo
 * toque. A frase do meio não é enfeite — é onde se diz o que exatamente
 * some, porque "tem certeza?" sozinho não informa nada.
 */
export function Confirm({
  visible,
  title,
  message,
  confirmLabel = "confirmar",
  danger = true,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Text style={[type.body, { color: c.dim, marginBottom: sp(2) }]}>
        {message}
      </Text>
      <Btn
        title={confirmLabel}
        variant={danger ? "danger" : "primary"}
        loading={busy}
        onPress={onConfirm}
      />
      <Btn title="cancelar" variant="ghost" onPress={onClose} disabled={busy} />
    </Sheet>
  );
}

/** Uma linha tocável dentro da gaveta — o formato de "escolha um nome". */
export function SheetRow({
  title,
  hint,
  left,
  onPress,
  disabled,
}: {
  title: string;
  hint?: string;
  left?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: sp(3),
        backgroundColor: c.surface2,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: c.border,
        paddingVertical: sp(3),
        paddingHorizontal: sp(3.5),
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {hint ? <Text style={[type.tiny, { color: c.faint }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
