import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarDays, CircleDollarSign, Mail, Pencil, ShieldCheck, Trash2, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ErrorState, FullScreenSafeArea, Page, Panel, SectionHeader } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { deleteProfile, getProfile, updateProfile } from '@/src/services/account';
import { endSession, setSessionProfile } from '@/src/store/session';
import type { UserProfile } from '@/src/types/api';

function nickname(profile: UserProfile) {
  return String(profile.nickname ?? profile.name ?? '未设置');
}

function roleLabel(value: unknown) {
  if (value === 'super_admin') return '超级管理员';
  if (value === 'admin') return '管理员';
  return '用户';
}

function statusValue(profile: UserProfile) {
  if (profile.disabled === true) return { label: '禁用', disabled: true };
  const status = String(profile.status ?? 'active').toLowerCase();
  return { label: status === 'active' || status === 'enabled' ? '启用' : status, disabled: status !== 'active' && status !== 'enabled' };
}

function formatBalance(profile: UserProfile) {
  const value = Number(profile.balance ?? profile.balance_usd);
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : '--';
}

function formatDate(value: unknown) {
  if (!value) return '--';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function DetailItem({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const compactColumns = width >= 390;
  return <View style={{ flexGrow: 1, flexBasis: full || !compactColumns ? '100%' : '46%', minWidth: 0, minHeight: 58, borderRadius: 14, backgroundColor: colors.mutedCard, paddingHorizontal: 11, paddingVertical: 9, gap: 4 }}><Text style={{ color: colors.subtext, fontSize: 9, fontWeight: '600' }}>{label}</Text><Text selectable numberOfLines={full ? 2 : 1} adjustsFontSizeToFit style={{ color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700' }}>{value}</Text></View>;
}

export default function ProfileScreen() {
  const colors = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: async ({ signal }) => {
      const value = await getProfile(signal);
      setSessionProfile(value);
      return value;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateProfile({ nickname: nameDraft.trim() }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('已保存', '昵称已更新。');
    },
    onError: (error) => Alert.alert('保存失败', error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteProfile(),
    onSuccess: async () => {
      await endSession();
      queryClient.clear();
      router.replace('/login');
    },
    onError: (error) => Alert.alert('注销失败', error.message),
  });

  function confirmDelete() {
    Alert.alert('注销账号', '将永久删除当前账号及其数据，且无法恢复。确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '继续', style: 'destructive', onPress: () => Alert.alert('最后确认', '真的要注销账号吗？此操作不可撤销。', [
        { text: '取消', style: 'cancel' },
        { text: '永久注销', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]) },
    ]);
  }

  const data = profile.data;
  const status = data ? statusValue(data) : { label: '--', disabled: false };

  return <Page title="个人资料" subtitle="账户身份与基础信息" icon={UserRound} safeTop={false} contentMaxWidth={860} refreshing={profile.isFetching} onRefresh={() => profile.refetch()}>
    {profile.error ? <ErrorState message={profile.error.message} retry={() => profile.refetch()} /> : null}
    {data ? <Panel>
      <SectionHeader icon={UserRound} title="账号信息" />
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11 }}><View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><UserRound color={colors.primary} size={20} /></View><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{nickname(data)}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{String(data.email ?? '--')}</Text></View><View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: status.disabled ? colors.dangerBg : colors.successBg }}><Text style={{ color: status.disabled ? colors.danger : colors.success, fontSize: 9, fontWeight: '800' }}>{status.label}</Text></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <DetailItem label="用户 ID" value={String(data.id ?? '--')} full />
        <DetailItem label="邮箱" value={String(data.email ?? '--')} />
        <DetailItem label="昵称" value={nickname(data)} />
        <DetailItem label="角色" value={roleLabel(data.role)} />
        <DetailItem label="余额" value={formatBalance(data)} />
        <DetailItem label="创建时间" value={formatDate(data.created_at)} />
        <DetailItem label="更新时间" value={formatDate(data.updated_at)} />
      </View>
      <Pressable onPress={() => { setNameDraft(nickname(data) === '未设置' ? '' : nickname(data)); setEditing(true); saveMutation.reset(); }} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Pencil color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>编辑资料</Text></Pressable>
    </Panel> : null}

    <Panel>
      <SectionHeader icon={Trash2} title="危险操作" />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}><ShieldCheck color={colors.danger} size={16} style={{ marginTop: 1 }} /><Text style={{ flex: 1, color: colors.subtext, fontSize: 11, lineHeight: 18 }}>注销后账号、API Key 和用量记录将永久失效。</Text></View>
      <Pressable disabled={deleteMutation.isPending} onPress={confirmDelete} style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>{deleteMutation.isPending ? <ActivityIndicator color={colors.danger} size="small" /> : <Trash2 color={colors.danger} size={15} />}<Text style={{ color: colors.danger, fontWeight: '800', fontSize: 12 }}>{deleteMutation.isPending ? '注销中...' : '注销账号'}</Text></Pressable>
    </Panel>

    <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>编辑资料</Text><Text style={{ color: colors.subtext, fontSize: 10, marginTop: 3 }}>{String(data?.email ?? '')}</Text></View><Pressable accessibilityLabel="关闭" onPress={() => setEditing(false)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>昵称</Text><View style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }}><UserRound color={colors.subtext} size={15} style={{ marginLeft: 11 }} /><TextInput value={nameDraft} onChangeText={setNameDraft} placeholder="输入昵称" placeholderTextColor={colors.placeholder} style={{ flex: 1, minHeight: 42, paddingHorizontal: 9, color: colors.text, fontSize: 12 }} /></View></View>
          <View style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.mutedCard, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Mail color={colors.subtext} size={15} /><Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 11 }}>{String(data?.email ?? '--')}</Text></View>
          <View style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.mutedCard, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}><CalendarDays color={colors.subtext} size={15} /><Text style={{ flex: 1, color: colors.subtext, fontSize: 11 }}>{roleLabel(data?.role)}</Text><CircleDollarSign color={colors.subtext} size={15} /><Text style={{ color: colors.subtext, fontSize: 11 }}>{data ? formatBalance(data) : '--'}</Text></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => setEditing(false)} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>取消</Text></Pressable><Pressable disabled={saveMutation.isPending || !nameDraft.trim()} onPress={() => saveMutation.mutate()} style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: nameDraft.trim() ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>{saveMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>保存</Text>}</Pressable></View>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
