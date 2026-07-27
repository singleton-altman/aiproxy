import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Boxes, Copy, Eye, EyeOff, KeyRound, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, Switch, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, Page, Panel, SectionHeader } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import {
  createApiKey,
  deleteApiKey,
  extractKeySecret,
  getApiKeys,
  getModels,
  getModelVisibility,
  setModelVisibility,
  updateApiKey,
} from '@/src/services/account';
import { sessionState } from '@/src/store/session';
import type { ApiKeyItem, ApiRecord } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

function keyId(item: ApiKeyItem) {
  return item.id !== undefined ? String(item.id) : '';
}

function keyUsageLabel(item: ApiKeyItem) {
  if (item.last_used_at) {
    const date = new Date(String(item.last_used_at));
    const value = Number.isNaN(date.getTime())
      ? String(item.last_used_at)
      : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `最近使用 ${value}`;
  }
  const count = Number(item.usage_count ?? item.request_count ?? item.total_requests);
  return Number.isFinite(count) && count > 0 ? `已使用 ${count} 次` : '未使用';
}

function KeyRow({ item, onToggle, onCopy, onDelete, busy }: { item: ApiKeyItem; onToggle: (item: ApiKeyItem, disabled: boolean) => void; onCopy: (item: ApiKeyItem) => void; onDelete: (item: ApiKeyItem) => void; busy: boolean }) {
  const colors = useAppTheme();
  const disabled = Boolean(item.disabled);
  return <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.rowBorder }}>
    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: disabled ? colors.mutedCard : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <KeyRound color={disabled ? colors.subtext : colors.primary} size={16} />
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{String(item.name ?? '未命名 Key')}</Text>
      <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, fontFamily: 'monospace' }}>
        {String(item.prefix ?? '')}{item.prefix ? '…' : ''} · {keyUsageLabel(item)}
      </Text>
      {item.expires_at ? <Text numberOfLines={1} style={{ color: colors.warning, fontSize: 10 }}>到期：{String(item.expires_at)}</Text> : null}
    </View>
    <Switch value={!disabled} disabled={busy || !keyId(item)} onValueChange={(enabled) => onToggle(item, !enabled)} trackColor={{ false: colors.disabled, true: colors.primary }} />
    <Pressable accessibilityLabel="复制 Key" onPress={() => onCopy(item)} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.62 : 1 })}>
      <Copy color={colors.primary} size={15} />
    </Pressable>
    <Pressable accessibilityLabel="删除 Key" disabled={busy || !keyId(item)} onPress={() => onDelete(item)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
      <Trash2 color={colors.danger} size={15} />
    </Pressable>
  </View>;
}

export default function KeysScreen() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const apiKeyMode = session.mode === 'apikey';
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [secret, setSecret] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const keys = useQuery({ queryKey: ['keys'], queryFn: ({ signal }) => getApiKeys(signal), enabled: !apiKeyMode });
  const models = useQuery({ queryKey: ['models'], queryFn: ({ signal }) => getModels(signal) });
  const visibility = useQuery({ queryKey: ['models', 'visibility'], queryFn: ({ signal }) => getModelVisibility(signal), retry: 0 });

  const createMutation = useMutation({
    mutationFn: () => createApiKey({ name: newName, expires_at: newExpiry.trim() || undefined }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      setCreating(false);
      setNewName('');
      setNewExpiry('');
      const value = extractKeySecret(payload);
      if (value) {
        setSecret(value);
        setSecretVisible(false);
      } else {
        Alert.alert('创建成功，但未返回完整 Key', '服务器不会在列表中再次显示完整 Key。如需使用，请删除该 Key 后重新创建。');
      }
    },
  });
  const toggleMutation = useMutation({
    mutationFn: ({ item, disabled }: { item: ApiKeyItem; disabled: boolean }) => updateApiKey(keyId(item), { disabled }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['keys'] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (item: ApiKeyItem) => deleteApiKey(keyId(item)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['keys'] }),
  });
  const visibilityMutation = useMutation({
    mutationFn: (value: ApiRecord) => setModelVisibility(value),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      queryClient.invalidateQueries({ queryKey: ['models', 'visibility'] });
    },
  });

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void Promise.allSettled([keys.refetch(), models.refetch(), visibility.refetch()]).finally(() => setRefreshing(false));
  };

  function confirmDelete(item: ApiKeyItem) {
    Alert.alert('删除 API Key', `确定删除「${String(item.name ?? keyId(item))}」吗？使用该 Key 的调用会立即失效。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(item) },
    ]);
  }

  function toggleModelHidden(modelId: string, hidden: boolean) {
    visibilityMutation.mutate({ id: modelId, hidden });
  }

  async function copyExistingKey(item: ApiKeyItem) {
    const value = extractKeySecret(item);
    if (!value) {
      Alert.alert('无法复制完整 Key', '出于安全原因，服务器只在创建时返回一次完整 Key，当前列表仅包含展示前缀。请创建新 Key 并在弹窗中立即复制。');
      return;
    }
    await Clipboard.setStringAsync(value);
    Alert.alert('已复制', '完整 Key 已复制到剪贴板。');
  }

  async function copySecret() {
    await Clipboard.setStringAsync(secret);
    Alert.alert('已复制', '完整 Key 已复制到剪贴板，请立即妥善保存。');
  }

  return <Page title="密钥与模型" subtitle={apiKeyMode ? 'API Key 登录模式' : '网关 API Key 与可见模型'} icon={KeyRound} refreshing={refreshing || keys.isFetching} onRefresh={refresh}>
    {apiKeyMode ? <Panel><Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>API Key 登录模式下无法管理 Key 列表，请使用邮箱账号登录。</Text></Panel> : <>
      {keys.error ? <ErrorState message={keys.error.message} retry={() => keys.refetch()} /> : null}
      <Panel>
        <SectionHeader icon={KeyRound} title="API Keys" meta={keys.data ? `${keys.data.length} 个` : undefined} />
        {(keys.data ?? []).map((item, index) => <KeyRow
          key={keyId(item) || String(index)}
          item={item}
          busy={toggleMutation.isPending || deleteMutation.isPending}
          onToggle={(target, disabled) => toggleMutation.mutate({ item: target, disabled })}
          onCopy={(target) => void copyExistingKey(target)}
          onDelete={confirmDelete}
        />)}
        {!keys.data?.length && !keys.isFetching ? <EmptyState message="还没有 API Key，点击下方创建" embedded /> : null}
        <Pressable onPress={() => setCreating(true)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Plus color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>创建 API Key</Text>
        </Pressable>
      </Panel>
    </>}

    <Panel>
      <SectionHeader icon={Boxes} title="可见模型" meta={models.data ? `${models.data.length} 个` : undefined} />
      {models.error ? <ErrorState message={models.error.message} retry={() => models.refetch()} /> : null}
      {(models.data ?? []).map((model) => {
        const id = String(model.id ?? '');
        return <View key={id} style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingVertical: 6 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontFamily: 'monospace', fontWeight: '700' }}>{id}</Text>
            <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>
              {String(model.provider ?? model.owned_by ?? '')}{model.family ? ` · ${model.family}` : ''}
              {typeof model.prompt_price_per_1m === 'number' ? ` · 输入 ${model.prompt_price_per_1m}/1M` : ''}
              {typeof model.completion_price_per_1m === 'number' ? ` · 输出 ${model.completion_price_per_1m}/1M` : ''}
              {model.free ? ' · 免费' : ''}
            </Text>
          </View>
          {!apiKeyMode ? <Switch value={!model.hidden} disabled={visibilityMutation.isPending} onValueChange={(visible) => toggleModelHidden(id, !visible)} trackColor={{ false: colors.disabled, true: colors.primary }} /> : null}
        </View>;
      })}
      {!models.data?.length && !models.isFetching ? <EmptyState message="暂无模型" embedded /> : null}
    </Panel>

    <Modal visible={creating} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setCreating(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' }}>创建 API Key</Text>
            <Pressable accessibilityLabel="关闭" onPress={() => setCreating(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>名称</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="例如：手机端调试" placeholderTextColor={colors.placeholder} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12 }} />
          </View>
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>过期时间（可选，ISO 格式）</Text>
            <TextInput value={newExpiry} onChangeText={setNewExpiry} placeholder="2026-12-31T00:00:00Z" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontFamily: 'monospace', fontSize: 13 }} />
          </View>
          {createMutation.error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{createMutation.error.message}</Text> : null}
          <Pressable disabled={!newName.trim() || createMutation.isPending} onPress={() => createMutation.mutate()} style={{ minHeight: 48, borderRadius: 13, backgroundColor: newName.trim() && !createMutation.isPending ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{createMutation.isPending ? '创建中…' : '创建'}</Text>
          </Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>

    <Modal visible={Boolean(secret)} transparent animationType="fade" onRequestClose={() => setSecret('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 22 }}>
        <View style={{ borderRadius: 20, backgroundColor: colors.page, padding: 20, gap: 14 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Key 创建成功</Text>
          <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 18 }}>完整 Key 只显示这一次，请立即复制并妥善保存。</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.mutedCard }}>
            <Text selectable numberOfLines={3} style={{ flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 12 }}>{secretVisible ? secret : secret.replace(/./g, '•').slice(0, 40)}</Text>
            <Pressable accessibilityLabel={secretVisible ? '隐藏' : '显示'} onPress={() => setSecretVisible(!secretVisible)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              {secretVisible ? <EyeOff color={colors.subtext} size={16} /> : <Eye color={colors.subtext} size={16} />}
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => void copySecret()} style={{ flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Copy color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800' }}>复制</Text>
            </Pressable>
            <Pressable onPress={() => setSecret('')} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>我已保存</Text>
            </Pressable>
          </View>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
