import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleDollarSign, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';

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

function userId(item: AdminUserItem) {
  return item.id !== undefined ? String(item.id) : '';
}

export default function AdminUsersScreen() {
  const colors = useAppTheme();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUserItem>();
  const [balanceDraft, setBalanceDraft] = useState('');

  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => getAdminUsers(undefined, signal) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  const toggleMutation = useMutation({
    mutationFn: ({ item, disabled }: { item: AdminUserItem; disabled: boolean }) => updateAdminUser(userId(item), { disabled }),
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (item: AdminUserItem) => deleteAdminUser(userId(item)),
    onSuccess: () => setSelected(undefined),
    onSettled: invalidate,
  });
  const balanceMutation = useMutation({
    mutationFn: ({ item, amount }: { item: AdminUserItem; amount: number }) => adjustAdminUserBalance(userId(item), { amount }),
    onSuccess: () => {
      setBalanceDraft('');
      Alert.alert('已提交', '余额调整请求已发送。');
    },
    onSettled: invalidate,
  });

  const items = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const list = users.data?.items ?? [];
    if (!keyword) return list;
    return list.filter((item) => `${item.email ?? ''} ${item.name ?? ''} ${item.role ?? ''}`.toLowerCase().includes(keyword));
  }, [users.data, search]);

  function confirmDelete(item: AdminUserItem) {
    Alert.alert('删除用户', `确定删除「${String(item.email ?? userId(item))}」吗？该操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(item) },
    ]);
  }

  return <Page title="用户管理" subtitle={users.data ? `${users.data.items.length} 个用户` : undefined} icon={UsersRound} safeTop={false} scrollable={false} refreshing={users.isFetching} onRefresh={() => users.refetch()}>
    <SearchField value={search} onChangeText={setSearch} placeholder="搜索邮箱、名称或角色" />
    {users.error ? <ErrorState message={users.error.message} retry={() => users.refetch()} /> : null}
    <FlatList
      data={items}
      keyExtractor={(item, index) => userId(item) || String(index)}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={Platform.OS === 'android'}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ gap: 10, paddingBottom: 96, flexGrow: items.length ? 0 : 1 }}
      ListEmptyComponent={!users.isFetching ? <EmptyState message="没有匹配的用户" icon={UsersRound} /> : null}
      renderItem={({ item }) => {
        const disabled = Boolean(item.disabled);
        return <Pressable onPress={() => { setSelected(item); setBalanceDraft(''); }} style={({ pressed }) => ({ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 6, opacity: pressed ? 0.7 : 1 })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: disabled ? colors.danger : colors.success }} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}>{String(item.email ?? '未知邮箱')}</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: item.role === 'admin' || item.role === 'super_admin' ? colors.warningBg : colors.mutedCard }}>
              <Text style={{ color: item.role === 'admin' || item.role === 'super_admin' ? colors.warning : colors.subtext, fontSize: 9, fontWeight: '800' }}>{String(item.role ?? 'user')}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>
            {item.name ? `${item.name} · ` : ''}余额 {typeof item.balance === 'number' ? item.balance : '--'} · 注册 {String(item.created_at ?? '--')}
          </Text>
        </Pressable>;
      }}
    />

    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(undefined)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        {selected ? <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' }}>{String(selected.email ?? userId(selected))}</Text>
            <Pressable accessibilityLabel="关闭" onPress={() => setSelected(undefined)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>

          <View style={{ gap: 6 }}>
            {([['ID', selected.id], ['名称', selected.name], ['角色', selected.role], ['余额', selected.balance], ['注册时间', selected.created_at], ['最近登录', selected.last_login_at]] as const)
              .filter(([, value]) => value !== undefined && value !== null && value !== '')
              .map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ width: 70, color: colors.subtext, fontSize: 12 }}>{label}</Text>
                <Text selectable style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '600' }}>{String(value)}</Text>
              </View>)}
          </View>

          <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 12 }}>
            <ShieldCheck color={colors.subtext} size={16} />
            <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }}>账号启用</Text>
            <Switch
              value={!selected.disabled}
              disabled={toggleMutation.isPending}
              onValueChange={(enabled) => {
                toggleMutation.mutate({ item: selected, disabled: !enabled });
                setSelected({ ...selected, disabled: !enabled });
              }}
              trackColor={{ false: colors.disabled, true: colors.primary }}
            />
          </View>

          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>余额调整（正数充值，负数扣减）</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={balanceDraft} onChangeText={setBalanceDraft} placeholder="例如 10 或 -5" placeholderTextColor={colors.placeholder} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12 }} />
              <Pressable
                disabled={balanceMutation.isPending || !balanceDraft.trim() || !Number.isFinite(Number(balanceDraft))}
                onPress={() => balanceMutation.mutate({ item: selected, amount: Number(balanceDraft) })}
                style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: balanceDraft.trim() && Number.isFinite(Number(balanceDraft)) ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <CircleDollarSign color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>提交</Text>
              </Pressable>
            </View>
            {balanceMutation.error ? <Text style={{ color: colors.danger, fontSize: 11 }}>{balanceMutation.error.message}</Text> : null}
          </View>

          <Pressable disabled={deleteMutation.isPending} onPress={() => confirmDelete(selected)} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Trash2 color={colors.danger} size={16} /><Text style={{ color: colors.danger, fontWeight: '800' }}>{deleteMutation.isPending ? '删除中…' : '删除用户'}</Text>
          </Pressable>
        </View> : null}
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
