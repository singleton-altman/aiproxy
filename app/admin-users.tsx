import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Eye, EyeOff, Save, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, Page, SearchField } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import {
  adjustAdminUserBalance,
  deleteAdminUser,
  getAdminUsers,
  updateAdminUser,
  type AdminUserItem,
} from '@/src/services/admin';
import type { ApiRecord } from '@/src/types/api';

type StatusFilter = 'all' | 'enabled' | 'disabled';
type UserDraft = { nickname: string; email: string; role: string; password: string; enabled: boolean };

const roleOptions = [
  ['user', '用户'],
  ['admin', '管理员'],
  ['super_admin', '超级管理员'],
] as const;

function userId(item: AdminUserItem) {
  return item.id !== undefined ? String(item.id) : '';
}

function nickname(item: AdminUserItem) {
  return String(item.nickname ?? item.name ?? '未命名用户');
}

function roleLabel(role: unknown) {
  return roleOptions.find(([key]) => key === role)?.[1] ?? String(role ?? '用户');
}

function formatBalance(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : '--';
}

function formatDate(value: unknown) {
  if (!value) return '--';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function initialDraft(item: AdminUserItem): UserDraft {
  return {
    nickname: nickname(item) === '未命名用户' ? '' : nickname(item),
    email: String(item.email ?? ''),
    role: String(item.role ?? 'user'),
    password: '',
    enabled: !item.disabled,
  };
}

function FormField({ label, value, onChangeText, placeholder, secure, onToggleSecure }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secure?: boolean; onToggleSecure?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text><View style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }}><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} secureTextEntry={secure} style={{ flex: 1, minHeight: 42, paddingHorizontal: 11, color: colors.text, fontSize: 12 }} />{onToggleSecure ? <Pressable accessibilityLabel={secure ? '显示密码' : '隐藏密码'} onPress={onToggleSecure} style={{ width: 40, height: 42, alignItems: 'center', justifyContent: 'center' }}>{secure ? <Eye color={colors.subtext} size={15} /> : <EyeOff color={colors.subtext} size={15} />}</Pressable> : null}</View></View>;
}

export default function AdminUsersScreen() {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<AdminUserItem>();
  const [draft, setDraft] = useState<UserDraft>({ nickname: '', email: '', role: 'user', password: '', enabled: true });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState('');

  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => getAdminUsers(undefined, signal) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('未选择用户');
      const body: ApiRecord = {
        nickname: draft.nickname.trim(),
        email: draft.email.trim(),
        role: draft.role,
        status: draft.enabled ? 'active' : 'disabled',
      };
      if (draft.password) body.password = draft.password;
      return updateAdminUser(userId(selected), body);
    },
    onSuccess: () => {
      setSelected(undefined);
      void invalidate();
      Alert.alert('已保存', '用户资料已更新。');
    },
    onError: (error) => Alert.alert('保存失败', error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (item: AdminUserItem) => deleteAdminUser(userId(item)),
    onSuccess: () => setSelected(undefined),
    onSettled: invalidate,
  });
  const balanceMutation = useMutation({
    mutationFn: ({ item, amount }: { item: AdminUserItem; amount: number }) => adjustAdminUserBalance(userId(item), amount),
    onSuccess: () => {
      setBalanceDraft('');
      void invalidate();
      Alert.alert('已提交', '余额调整请求已发送。');
    },
  });

  const counts = useMemo(() => {
    const all = users.data?.items ?? [];
    return { all: all.length, enabled: all.filter((item) => !item.disabled).length, disabled: all.filter((item) => item.disabled).length };
  }, [users.data]);

  const items = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (users.data?.items ?? []).filter((item) => {
      if (statusFilter === 'enabled' && item.disabled) return false;
      if (statusFilter === 'disabled' && !item.disabled) return false;
      return !keyword || `${item.email ?? ''} ${nickname(item)} ${item.role ?? ''}`.toLowerCase().includes(keyword);
    });
  }, [search, statusFilter, users.data]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim());
  const passwordValid = !draft.password || draft.password.length >= 8;
  const canSave = Boolean(selected && draft.nickname.trim() && emailValid && passwordValid && !saveMutation.isPending);

  function openUser(item: AdminUserItem) {
    setSelected(item);
    setDraft(initialDraft(item));
    setPasswordVisible(false);
    setBalanceDraft('');
    saveMutation.reset();
    balanceMutation.reset();
  }

  function confirmDelete(item: AdminUserItem) {
    Alert.alert('删除用户', `确定删除「${String(item.email ?? userId(item))}」吗？该操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(item) },
    ]);
  }

  return <Page title="用户" subtitle="管理用户角色、状态与套餐分配" icon={UsersRound} safeTop={false} contentMaxWidth={1180} scrollable={false} refreshing={users.isFetching} onRefresh={() => users.refetch()}>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 8 }}>
      <View style={{ flex: 1 }}><SearchField value={search} onChangeText={setSearch} placeholder="搜索邮箱或昵称" /></View>
      <View style={{ flexDirection: 'row', gap: 3, padding: 3, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        {([['all', '全部'], ['enabled', '启用'], ['disabled', '禁用']] as const).map(([key, label]) => <Pressable key={key} onPress={() => setStatusFilter(key)} style={{ flex: wide ? undefined : 1, minWidth: wide ? 70 : 0, minHeight: 40, paddingHorizontal: 9, borderRadius: 6, backgroundColor: statusFilter === key ? colors.card : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Text style={{ color: statusFilter === key ? colors.text : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text><Text style={{ color: colors.subtext, fontSize: 9 }}>{counts[key]}</Text></Pressable>)}
      </View>
    </View>
    {users.error ? <ErrorState message={users.error.message} retry={() => users.refetch()} /> : null}
    <FlatList
      data={items}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      keyExtractor={(item, index) => userId(item) || String(index)}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={Platform.OS === 'android'}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ gap: 8, paddingBottom: 20, flexGrow: items.length ? 0 : 1 }}
      ListHeaderComponent={users.data ? <Text style={{ color: colors.subtext, fontSize: 10, paddingBottom: 2 }}>显示 {items.length} / {users.data.items.length}</Text> : null}
      ListEmptyComponent={!users.isFetching ? <EmptyState message="没有匹配的用户" icon={UsersRound} /> : null}
      renderItem={({ item }) => {
        const disabled = Boolean(item.disabled);
        const role = String(item.role ?? 'user');
        return <Pressable onPress={() => openUser(item)} style={({ pressed }) => ({ minHeight: 72, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.68 : 1 })}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800' }}>{nickname(item).slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' }}>{String(item.email ?? '未知邮箱')}</Text><View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: role === 'user' ? colors.mutedCard : colors.primarySoft }}><Text style={{ color: role === 'user' ? colors.subtext : colors.primary, fontSize: 8, fontWeight: '800' }}>{roleLabel(role)}</Text></View><View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: disabled ? colors.dangerBg : colors.successBg }}><Text style={{ color: disabled ? colors.danger : colors.success, fontSize: 8, fontWeight: '800' }}>{disabled ? '禁用' : '启用'}</Text></View></View>
            <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9 }}>{nickname(item)} · 注册 {formatDate(item.created_at)} · 余额 {formatBalance(item.balance ?? 0)}</Text>
          </View>
        </Pressable>;
      }}
    />

    <Modal visible={Boolean(selected)} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setSelected(undefined)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        {selected ? <View style={{ maxHeight: '92%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>编辑用户</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, marginTop: 3 }}>更新 {String(selected.email ?? userId(selected))} 的账户信息</Text></View><Pressable accessibilityLabel="关闭" onPress={() => setSelected(undefined)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
            <FormField label="昵称" value={draft.nickname} onChangeText={(value) => setDraft((current) => ({ ...current, nickname: value }))} />
            <FormField label="邮箱" value={draft.email} onChangeText={(value) => setDraft((current) => ({ ...current, email: value }))} />
            <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>角色</Text><View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>{roleOptions.map(([key, label]) => <Pressable key={key} onPress={() => setDraft((current) => ({ ...current, role: key }))} style={{ flex: 1, minHeight: 38, borderRadius: 9, backgroundColor: draft.role === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: draft.role === key ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text></Pressable>)}</View></View>
            <FormField label="新密码" value={draft.password} onChangeText={(value) => setDraft((current) => ({ ...current, password: value }))} placeholder="留空保持当前密码不变" secure={!passwordVisible} onToggleSecure={() => setPasswordVisible((value) => !value)} />
            {draft.password && !passwordValid ? <Text style={{ color: colors.danger, fontSize: 9 }}>密码至少 8 个字符</Text> : null}
            <View style={{ minHeight: 48, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9 }}><ShieldCheck color={draft.enabled ? colors.success : colors.subtext} size={15} /><Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>账号启用</Text><Switch value={draft.enabled} onValueChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>
            <View style={{ gap: 6 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>余额调整</Text><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>当前 {formatBalance(selected.balance ?? 0)}</Text></View><View style={{ flexDirection: 'row', gap: 7 }}><TextInput value={balanceDraft} onChangeText={setBalanceDraft} placeholder="正数充值，负数扣减" placeholderTextColor={colors.placeholder} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} style={{ flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 11, fontSize: 11 }} /><Pressable disabled={balanceMutation.isPending || !balanceDraft.trim() || !Number.isFinite(Number(balanceDraft))} onPress={() => balanceMutation.mutate({ item: selected, amount: Number(balanceDraft) })} style={{ minWidth: 78, minHeight: 42, borderRadius: 12, backgroundColor: balanceDraft.trim() && Number.isFinite(Number(balanceDraft)) ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{balanceMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <CircleDollarSign color="#fff" size={14} />}<Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>提交</Text></Pressable></View></View>
            {balanceMutation.error ? <Text style={{ color: colors.danger, fontSize: 9 }}>{balanceMutation.error.message}</Text> : null}
            <Pressable disabled={deleteMutation.isPending} onPress={() => confirmDelete(selected)} style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 color={colors.danger} size={14} /><Text style={{ color: colors.danger, fontSize: 11, fontWeight: '800' }}>{deleteMutation.isPending ? '删除中...' : '删除用户'}</Text></Pressable>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => setSelected(undefined)} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>取消</Text></Pressable><Pressable disabled={!canSave} onPress={() => saveMutation.mutate()} style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: canSave ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{saveMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Save color="#fff" size={14} />}<Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>保存</Text></Pressable></View>
        </View> : null}
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
