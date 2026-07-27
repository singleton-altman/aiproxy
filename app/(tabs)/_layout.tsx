import { Redirect, Slot } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useWindowDimensions } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';
import { isAdmin, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');

export default function TabLayout() {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const session = useSnapshot(sessionState);
  if (!session.authenticated) return <Redirect href="/login" />;
  if (width >= 900) return <Slot />;

  return <NativeTabs
    tintColor={colors.primary}
    iconColor={{ default: colors.subtext, selected: colors.primary }}
    labelStyle={{
      default: { color: colors.subtext, fontSize: 11, fontWeight: '600' },
      selected: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    }}
    blurEffect="systemDefault"
    minimizeBehavior="never"
  >
    <NativeTabs.Trigger name="index" hidden />
    <NativeTabs.Trigger name="overview">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'gauge', selected: 'gauge' }}
        md={{ default: 'speed', selected: 'speed' }}
      />
      <NativeTabs.Trigger.Label>总览</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="keys">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'key', selected: 'key.fill' }}
        md={{ default: 'key', selected: 'key' }}
      />
      <NativeTabs.Trigger.Label>密钥</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="chat">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
        md={{ default: 'chat', selected: 'chat' }}
      />
      <NativeTabs.Trigger.Label>聊天</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="admin" hidden={!isAdmin()}>
      <NativeTabs.Trigger.Icon
        sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
        md={{ default: 'grid_view', selected: 'grid_view' }}
      />
      <NativeTabs.Trigger.Label>管理</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="settings">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
        md={{ default: 'settings', selected: 'settings' }}
      />
      <NativeTabs.Trigger.Label>设置</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
