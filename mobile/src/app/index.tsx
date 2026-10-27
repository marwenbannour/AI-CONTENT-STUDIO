import { Redirect } from 'expo-router';
import { useSession } from '../session';

export default function IndexRoute() {
  const { user } = useSession();
  return <Redirect href={user ? '/(tabs)' : '/(auth)/sign-in'} />;
}
