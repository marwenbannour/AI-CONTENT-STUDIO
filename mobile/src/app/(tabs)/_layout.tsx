import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../session';
import { WorkspaceProvider } from '../../workspace';
import { colors } from '../../ui';

const tabs = [
  { name: 'index', title: 'Accueil', icon: '⌂' },
  { name: 'create', title: 'Créer', icon: '✳' },
  { name: 'library', title: 'Contenus', icon: '▤' },
  { name: 'calendar', title: 'Agenda', icon: '▦' },
  { name: 'brand', title: 'Marque', icon: '◈' },
  { name: 'settings', title: 'Compte', icon: '⚙' },
];

export default function TabsLayout() {
  const { user, loading } = useSession();
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/sign-in" />;

  return (
    <WorkspaceProvider>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerTitle: 'studio.',
          headerTitleStyle: { color: colors.green, fontWeight: '800' },
          headerStyle: { backgroundColor: colors.white },
          tabBarActiveTintColor: colors.green,
          tabBarInactiveTintColor: '#889188',
          tabBarLabelStyle: { fontSize: 9 },
          tabBarStyle: { backgroundColor: colors.white },
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{tab.icon}</Text>,
            }}
          />
        ))}
      </Tabs>
    </WorkspaceProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
});
