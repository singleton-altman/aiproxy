import { router } from 'expo-router';
import { Braces, ChevronRight, KeyRound, LogOut, Server, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { IconTile, Page, Panel, SectionHeader } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { logout } from '@/src/services/auth';
import { getApiModules } from '@/src/services/endpoints';
import { endSession, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');

export default function SettingsScreen() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const [busy, setBusy] = useState(false);
  const userModules = getApiModules().filter((module) => !module.key.startsWith('admin-'));

  const leave = async () => {
    setBusy(true);
    try { await logout(); } catch { /* 会话已失效时忽略 */ }
    finally {
      await endSession();
      queryClient.clear();
      router.replace('/login');
      setBusy(false);
    }
  };

  const identity = session.mode === 'apikey'
    ? 'API Key 登录'
    : String(session.profile?.name || session.email || '用户');
  const role = session.profile?.role ? String(session.profile.role) : session.mode === 'apikey' ? 'key' : 'user';

  return <Page title="设置" subtitle="当前连接与账号" icon={SlidersHorizontal}>
    <Panel>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconTile icon={Server} size={46} iconSize={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{identity}</Text>
          <Text selectable numberOfLines={2} style={{ color: colors.subtext, marginTop: 4, fontSize: 12 }}>{session.baseUrl}</Text>
        </View>
        <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.primarySoft }}>
          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{role}</Text>
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <IconTile icon={UserRound} color={colors.subtext} background={colors.mutedCard} size={28} iconSize={14} />
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{session.mode === 'apikey' ? '使用网关 API Key 会话' : `账号：${session.email || '--'}`}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <IconTile icon={KeyRound} color={colors.subtext} background={colors.mutedCard} size={28} iconSize={14} />
          <Text style={{ color: colors.subtext, fontSize: 12 }}>凭据由设备安全存储保护</Text>
        </View>
      </View>
      {session.mode === 'session' ? <Pressable onPress={() => router.push('/profile' as never)} style={({ pressed }) => ({ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9, opacity: pressed ? 0.62 : 1 })}>
        <UserRound color={colors.primary} size={16} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}>个人资料与账号管理</Text>
        <ChevronRight color={colors.disabled} size={16} />
      </Pressable> : null}
    </Panel>

    <SectionHeader icon={Braces} title="用户端接口" meta={`${userModules.reduce((sum, item) => sum + item.endpointCount, 0)} 个端点`} />
    <Panel>
      {userModules.map((module, index) => <Pressable key={module.key} onPress={() => router.push(`/modules/${encodeURIComponent(module.key)}` as never)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, opacity: pressed ? 0.62 : 1 })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{module.label}</Text>
          <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{module.endpointCount} 个端点 · {module.methodCount} 个方法</Text>
        </View>
        <ChevronRight color={colors.disabled} size={16} />
      </Pressable>)}
    </Panel>

    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <IconTile icon={ShieldCheck} color={colors.success} background={colors.successBg} />
        <Text style={{ color: colors.text, fontWeight: '700' }}>连接安全</Text>
      </View>
      <Text style={{ color: colors.subtext, lineHeight: 20, fontSize: 13 }}>公网访问时建议为管理端配置 HTTPS。新建 API Key 的完整密钥只显示一次；请求日志可能包含敏感 Prompt，注意保护。</Text>
    </Panel>

    <Pressable disabled={busy} onPress={() => Alert.alert('退出登录', '确定结束当前会话吗？', [{ text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: () => void leave() }])} style={{ height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
      <LogOut color={colors.danger} size={18} />
      <Text style={{ color: colors.danger, fontWeight: '700' }}>{busy ? '正在退出' : '退出登录'}</Text>
    </Pressable>
  </Page>;
}
