import { router } from 'expo-router';
import { ChevronRight, KeyRound, LogOut, Package, Server, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { IconTile, Page, Panel } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { logout } from '@/src/services/auth';
import { endSession, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');

export default function SettingsScreen() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setBusy(true);
    try { if (session.mode === 'session') await logout(); } catch { /* 会话已失效时忽略 */ }
    finally {
      await endSession();
      queryClient.clear();
      router.replace('/login');
      setBusy(false);
    }
  };

  const identity = session.mode === 'apikey'
    ? 'API Key 登录'
    : session.mode === 'management' ? '管理令牌登录' : String(session.profile?.name || session.email || '用户');
  const role = session.mode === 'management' ? 'management' : session.profile?.role ? String(session.profile.role) : session.mode === 'apikey' ? 'key' : 'user';
  const credentialDetail = session.mode === 'apikey'
    ? '使用网关 API Key 会话'
    : session.mode === 'management' ? `管理令牌：${session.managementToken.slice(0, 12)}...` : `账号：${session.email || '--'}`;

  return <Page title="设置" subtitle="当前连接与账号" icon={SlidersHorizontal}>
    <Panel>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconTile icon={Server} size={46} iconSize={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{identity}</Text>
          <Text selectable numberOfLines={2} style={{ color: colors.subtext, marginTop: 4, fontSize: 11 }}>{session.baseUrl}</Text>
        </View>
        <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.primarySoft }}>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>{role}</Text>
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <IconTile icon={UserRound} color={colors.subtext} background={colors.mutedCard} size={28} iconSize={14} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 11 }}>{credentialDetail}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <IconTile icon={KeyRound} color={colors.subtext} background={colors.mutedCard} size={28} iconSize={14} />
          <Text style={{ color: colors.subtext, fontSize: 11 }}>凭据由设备安全存储保护</Text>
        </View>
      </View>
      {session.mode === 'session' ? <Pressable onPress={() => router.push('/profile' as never)} style={({ pressed }) => ({ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9, opacity: pressed ? 0.62 : 1 })}>
        <UserRound color={colors.primary} size={16} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}>个人资料与账号管理</Text>
        <ChevronRight color={colors.disabled} size={16} />
      </Pressable> : null}
      {session.mode === 'session' ? <Pressable onPress={() => router.push('/plans' as never)} style={({ pressed }) => ({ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9, opacity: pressed ? 0.62 : 1 })}>
        <Package color={colors.primary} size={16} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}>套餐计划</Text>
        <ChevronRight color={colors.disabled} size={16} />
      </Pressable> : null}
    </Panel>

    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <IconTile icon={ShieldCheck} color={colors.success} background={colors.successBg} />
        <Text style={{ color: colors.text, fontWeight: '700' }}>连接安全</Text>
      </View>
      <Text style={{ color: colors.subtext, lineHeight: 20, fontSize: 13 }}>公网访问时建议为管理端配置 HTTPS。API Key 与管理令牌都属于敏感凭据；请求日志也可能包含敏感 Prompt，注意保护。</Text>
    </Panel>

    <Pressable disabled={busy} onPress={() => Alert.alert('退出登录', '确定结束当前会话吗？', [{ text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: () => void leave() }])} style={{ height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
      <LogOut color={colors.danger} size={18} />
      <Text style={{ color: colors.danger, fontWeight: '700' }}>{busy ? '正在退出' : '退出登录'}</Text>
    </Pressable>
  </Page>;
}
