import '@/src/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { AppShell } from '@/src/components/app-shell';
import { hydrateSession, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');

export default function RootLayout() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => { hydrateSession(); }, []);
  useEffect(() => {
    if (!session.hydrated || session.authenticated || segments[0] === 'login') return;
    router.replace('/login');
  }, [router, segments, session.hydrated, session.authenticated]);

  return <GestureHandlerRootView style={{ flex: 1 }}>
    <StatusBar style={colors.mode === 'dark' ? 'light' : 'dark'} />
    <QueryClientProvider client={queryClient}>
      {!session.hydrated ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}><ActivityIndicator color={colors.primary} /></View> :
        <AppShell enabled={session.authenticated && segments[0] !== 'login'}><Stack screenOptions={{ headerStyle: { backgroundColor: colors.page }, headerTintColor: colors.primary, headerShadowVisible: false, headerTitleStyle: { color: colors.text, fontWeight: '600' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="requests" options={{ title: '请求日志', headerBackTitle: '返回' }} />
          <Stack.Screen name="profile" options={{ title: '个人资料', headerBackTitle: '返回' }} />
          <Stack.Screen name="plans" options={{ title: '套餐计划', headerBackTitle: '返回' }} />
          <Stack.Screen name="images" options={{ title: '图像生成', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-users" options={{ title: '用户管理', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-system" options={{ title: '系统管理', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-invites" options={{ title: '邀请码', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-plans" options={{ title: '套餐管理', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-accounts" options={{ title: '上游账号', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-account-import" options={{ title: '账号导入', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-providers" options={{ title: 'Providers', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-proxies" options={{ title: '代理管理', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-proxy-system" options={{ title: '系统代理', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-tokens" options={{ title: 'Management Tokens', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-traces" options={{ title: 'Traces', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-models" options={{ title: '模型目录', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-stats" options={{ title: '统计与日志', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-quota" options={{ title: '额度管理', headerBackTitle: '返回' }} />
          <Stack.Screen name="admin-config" options={{ title: '配置中心', headerBackTitle: '返回' }} />
          <Stack.Screen name="modules/[module]" options={{ title: '模块接口', headerBackTitle: '返回' }} />
          <Stack.Screen name="endpoints/[id]" options={{ title: '接口调试', headerBackTitle: '返回' }} />
        </Stack></AppShell>}
    </QueryClientProvider>
  </GestureHandlerRootView>;
}
