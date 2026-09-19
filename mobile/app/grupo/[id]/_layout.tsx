import { Text } from "react-native";
import { Tabs, useLocalSearchParams } from "expo-router";
import { GrupoProvider } from "../../../lib/grupo-ctx";
import { c } from "../../../lib/theme";

/** Ícone em emoji: zero dependência de fonte de ícones, e legível no escuro. */
function Icon({ char, focused }: { char: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{char}</Text>;
}

export default function GrupoLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <GrupoProvider peladaId={id}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: "800" },
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: c.surface,
            borderTopColor: c.border,
          },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.faint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
          sceneStyle: { backgroundColor: c.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Pelada",
            headerShown: false,
            tabBarIcon: ({ focused }) => <Icon char="🏐" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="lista"
          options={{
            title: "Lista",
            headerShown: false,
            tabBarIcon: ({ focused }) => <Icon char="✅" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="destaques"
          options={{
            title: "Destaques",
            headerShown: false,
            tabBarIcon: ({ focused }) => <Icon char="⭐" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Números",
            headerShown: false,
            tabBarIcon: ({ focused }) => <Icon char="📊" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="gestao"
          options={{
            title: "Grupo",
            headerShown: false,
            tabBarIcon: ({ focused }) => <Icon char="⚙️" focused={focused} />,
          }}
        />
      </Tabs>
    </GrupoProvider>
  );
}
