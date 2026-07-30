import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, Page, Panel, SheetHandle } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { createApiKey, deleteApiKey, extractKeySecret, getApiKeys, getModels, getPlans, updateApiKey } from '@/src/services/account';
import { sessionState } from '@/src/store/session';
import type { ApiKeyItem, ApiRecord, ModelItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

const MODEL_FIELDS = ['allowed_models', 'model_ids', 'models'] as const;

function keyId(item: ApiKeyItem) {
  return item.id !== undefined ? String(item.id) : '';
}

function nestedRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : undefined;
}

function keySources(item: ApiKeyItem) {
  const record = item as ApiRecord;
  return [record, record.billing, record.plan, record.subscription, record.limits, record.restrictions]
    .map(nestedRecord)
    .filter((value): value is ApiRecord => Boolean(value));
}

function firstText(item: ApiKeyItem, keys: string[]) {
  for (const source of keySources(item)) {
    for (const key of keys) {
      const value = source[key];
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
    }
  }
  return '';
}

function firstNumber(item: ApiKeyItem, keys: string[]) {
  const value = firstText(item, keys);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function keyPlanLabel(item: ApiKeyItem) {
  const value = firstText(item, ['plan_name', 'plan_label', 'billing_label', 'billing_mode', 'billing_type', 'charge_type', 'plan']);
  if (!value) return '余额扣费';
  if (/balance|wallet|pay.?as.?you.?go|on.?demand|余额|按量/i.test(value)) return '余额扣费';
  if (/inherit|follow|subscription|套餐/i.test(value)) return value === '套餐' ? '跟随套餐' : value;
  return value;
}

function modelIds(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[\n,]/) : [];
  return source.flatMap((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      const id = String(entry).trim();
      return id ? [id] : [];
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as ApiRecord;
    const id = record.id ?? record.model ?? record.model_id ?? record.name;
    return id === undefined || id === null || !String(id).trim() ? [] : [String(id).trim()];
  });
}

function keyModelConfig(item: ApiKeyItem) {
  const sources = keySources(item);
  for (const field of MODEL_FIELDS) {
    for (const source of sources) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      const ids = modelIds(source[field]);
      return { field, ids, followsPlan: !ids.length };
    }
  }
  return { field: 'allowed_models' as const, ids: [], followsPlan: true };
}

function keyModelLabel(item: ApiKeyItem) {
  const config = keyModelConfig(item);
  if (config.ids.length) return `${config.ids.length} 个模型`;
  const count = firstNumber(item, ['model_count', 'models_count', 'allowed_model_count', 'available_model_count']);
  return count > 0 ? `${count} 个模型` : '跟随套餐';
}

function formatCreatedAt(value: unknown) {
  if (!value) return '--';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function keyPreview(item: ApiKeyItem) {
  const raw = extractKeySecret(item)
    || firstText(item, ['prefix', 'key_prefix', 'secret_prefix', 'masked_key', 'masked']);
  if (!raw) return '未返回密钥前缀';
  if (/[*•]/.test(raw) || raw.endsWith('…')) return raw;
  return raw.length > 12 ? `${raw.slice(0, 12)}…` : `${raw}…`;
}

function DetailCell({ label, value, accent, icon: Icon }: { label: string; value: string; accent?: string; icon: typeof Boxes }) {
  const colors = useAppTheme();
  return <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon color={colors.subtext} size={12} /><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, fontWeight: '600' }}>{label}</Text></View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={{ color: accent ?? colors.text, fontSize: 11, lineHeight: 16, fontWeight: '800' }}>{value}</Text>
  </View>;
}

function ActionButton({ label, icon: Icon, onPress, disabled, danger = false }: { label: string; icon: typeof Boxes; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const colors = useAppTheme();
  const color = danger ? colors.danger : colors.text;
  return <Pressable
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => ({
      flex: 1,
      minWidth: 0,
      minHeight: 38,
      borderRadius: 11,
      borderWidth: danger ? 0 : 1,
      borderColor: colors.border,
      backgroundColor: danger ? colors.dangerBg : colors.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      opacity: disabled ? 0.42 : pressed ? 0.65 : 1,
    })}
  >
    <Icon color={color} size={13} />
    <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '800' }}>{label}</Text>
  </Pressable>;
}

function KeyCard({ item, copied, busy, onModels, onToggle, onCopy, onDelete }: {
  item: ApiKeyItem;
  copied: boolean;
  busy: boolean;
  onModels: (item: ApiKeyItem) => void;
  onToggle: (item: ApiKeyItem, disabled: boolean) => void;
  onCopy: (item: ApiKeyItem) => void;
  onDelete: (item: ApiKeyItem) => void;
}) {
  const colors = useAppTheme();
  const disabled = Boolean(item.disabled);
  const statusColor = disabled ? colors.subtext : colors.success;
  const statusBackground = disabled ? colors.mutedCard : colors.successBg;
  const name = String(item.name ?? '未命名密钥');

  return <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <IconTile icon={KeyRound} size={36} iconSize={17} color={disabled ? colors.subtext : colors.primary} background={disabled ? colors.mutedCard : colors.primarySoft} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{name}</Text>
      </View>
      <View style={{ minHeight: 24, borderRadius: 9, backgroundColor: statusBackground, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '800' }}>{disabled ? '已禁用' : '已启用'}</Text>
      </View>
    </View>

    <View style={{ minHeight: 38, borderRadius: 11, backgroundColor: colors.mutedCard, paddingLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.subtext, fontFamily: 'monospace', fontSize: 11 }}>{keyPreview(item)}</Text>
      <Pressable accessibilityLabel={`复制${name}密钥`} onPress={() => onCopy(item)} style={({ pressed }) => ({ width: 38, height: 38, borderLeftWidth: 1, borderLeftColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        {copied ? <Check color={colors.success} size={15} /> : <Copy color={colors.subtext} size={14} />}
      </Pressable>
    </View>

    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
      <DetailCell icon={CircleDollarSign} label="套餐" value={keyPlanLabel(item)} />
      <DetailCell icon={Boxes} label="可用模型" value={keyModelLabel(item)} accent={colors.primary} />
      <DetailCell icon={CalendarDays} label="创建时间" value={formatCreatedAt(item.created_at)} />
    </View>

    <View style={{ flexDirection: 'row', gap: 7 }}>
      <ActionButton label="模型" icon={Boxes} disabled={busy || !keyId(item)} onPress={() => onModels(item)} />
      <ActionButton label={disabled ? '启用' : '禁用'} icon={disabled ? Power : PowerOff} disabled={busy || !keyId(item)} onPress={() => onToggle(item, !disabled)} />
      <ActionButton label="删除" icon={Trash2} danger disabled={busy || !keyId(item)} onPress={() => onDelete(item)} />
    </View>
  </View>;
}

export default function KeysScreen() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const apiKeyMode = session.mode === 'apikey';
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlanId, setNewPlanId] = useState('');
  const [newCustomKey, setNewCustomKey] = useState('');
  const [createModelMode, setCreateModelMode] = useState<'all' | 'restricted'>('all');
  const [createSelectedModels, setCreateSelectedModels] = useState<string[]>([]);
  const [createModelSearch, setCreateModelSearch] = useState('');
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [modelKey, setModelKey] = useState<ApiKeyItem>();
  const [modelMode, setModelMode] = useState<'follow' | 'custom'>('follow');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const keys = useQuery({ queryKey: ['keys'], queryFn: ({ signal }) => getApiKeys(signal), enabled: !apiKeyMode });
  const models = useQuery({ queryKey: ['models'], queryFn: ({ signal }) => getModels(signal), enabled: !apiKeyMode });
  const plans = useQuery({ queryKey: ['user', 'plans'], queryFn: ({ signal }) => getPlans(signal), enabled: !apiKeyMode });
  const visibleModels = useMemo(() => (models.data ?? []).filter((model) => !model.hidden && model.id), [models.data]);
  const selectedPlan = useMemo(() => (plans.data ?? []).find((plan) => String(plan.id ?? '') === newPlanId), [newPlanId, plans.data]);
  const selectedPlanModelIds = useMemo(() => modelIds(selectedPlan?.allowed_models), [selectedPlan]);
  const createAvailableModels = useMemo(() => {
    if (!selectedPlanModelIds.length) return visibleModels;
    const allowed = new Set(selectedPlanModelIds);
    return visibleModels.filter((model) => allowed.has(String(model.id)));
  }, [selectedPlanModelIds, visibleModels]);
  const filteredCreateModels = useMemo(() => {
    const keyword = createModelSearch.trim().toLowerCase();
    if (!keyword) return createAvailableModels;
    return createAvailableModels.filter((model) => `${model.id ?? ''} ${model.display_name ?? ''} ${model.provider ?? model.owned_by ?? ''}`.toLowerCase().includes(keyword));
  }, [createAvailableModels, createModelSearch]);
  const customKeyValid = !newCustomKey.trim() || /^[A-Za-z0-9._~+/=-]{16,200}$/.test(newCustomKey.trim());

  const createMutation = useMutation({
    mutationFn: () => createApiKey({
      name: newName,
      plan_id: newPlanId || undefined,
      key: newCustomKey.trim() || undefined,
      allowed_models: createModelMode === 'all' ? [] : createSelectedModels,
    }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      setCreating(false);
      const value = extractKeySecret(payload) || newCustomKey.trim();
      resetCreateForm();
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
  const modelMutation = useMutation({
    mutationFn: () => {
      if (!modelKey) throw new Error('未选择密钥');
      const field = keyModelConfig(modelKey).field;
      return updateApiKey(keyId(modelKey), { [field]: modelMode === 'follow' ? [] : selectedModels });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      setModelKey(undefined);
    },
  });

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void Promise.allSettled([keys.refetch(), models.refetch(), plans.refetch()]).finally(() => setRefreshing(false));
  };

  function resetCreateForm() {
    setNewName('');
    setNewPlanId('');
    setNewCustomKey('');
    setCreateModelMode('all');
    setCreateSelectedModels([]);
    setCreateModelSearch('');
    setPlanPickerOpen(false);
  }

  function openCreate() {
    createMutation.reset();
    resetCreateForm();
    setCreating(true);
  }

  function closeCreate() {
    if (createMutation.isPending) return;
    setCreating(false);
    setPlanPickerOpen(false);
  }

  function chooseCreatePlan(id: string) {
    setNewPlanId(id);
    setPlanPickerOpen(false);
    const plan = (plans.data ?? []).find((item) => String(item.id ?? '') === id);
    const allowedIds = modelIds(plan?.allowed_models);
    if (allowedIds.length) {
      const allowed = new Set(allowedIds);
      setCreateSelectedModels((current) => current.filter((model) => allowed.has(model)));
    }
  }

  function toggleCreateModel(id: string) {
    setCreateSelectedModels((current) => current.includes(id) ? current.filter((model) => model !== id) : [...current, id]);
  }

  function confirmDelete(item: ApiKeyItem) {
    Alert.alert('删除 API Key', `确定删除「${String(item.name ?? keyId(item))}」吗？使用该 Key 的调用会立即失效。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(item) },
    ]);
  }

  function openModels(item: ApiKeyItem) {
    const config = keyModelConfig(item);
    modelMutation.reset();
    setModelKey(item);
    setModelMode(config.followsPlan ? 'follow' : 'custom');
    setSelectedModels(config.ids);
  }

  function toggleSelectedModel(id: string) {
    setSelectedModels((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function copyExistingKey(item: ApiKeyItem) {
    const value = extractKeySecret(item);
    if (!value) {
      Alert.alert('无法复制完整 Key', '服务器只在创建时返回一次完整 Key，当前列表仅包含展示前缀。请创建新 Key 并在弹窗中立即复制。');
      return;
    }
    await Clipboard.setStringAsync(value);
    const marker = keyId(item) || keyPreview(item);
    setCopiedKey(marker);
    setTimeout(() => setCopiedKey((current) => current === marker ? '' : current), 1600);
  }

  async function copySecret() {
    await Clipboard.setStringAsync(secret);
    Alert.alert('已复制', '完整 Key 已复制到剪贴板，请立即妥善保存。');
  }

  const keyBusy = toggleMutation.isPending || deleteMutation.isPending || modelMutation.isPending;
  const canCreate = Boolean(newName.trim() && customKeyValid && !createMutation.isPending);

  return <Page title="API 密钥" subtitle={apiKeyMode ? 'API Key 登录模式' : '创建和管理用于访问代理服务的密钥。'} icon={KeyRound} contentMaxWidth={920} refreshing={refreshing || keys.isFetching} onRefresh={refresh}>
    {apiKeyMode ? <Panel><Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 18 }}>API Key 登录模式下无法管理密钥列表，请使用邮箱账号登录。</Text></Panel> : <>
      <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: colors.subtext, fontSize: 11, fontWeight: '700' }}>{keys.data ? `${keys.data.length} 个密钥` : '密钥列表'}</Text>
        <Pressable onPress={openCreate} style={({ pressed }) => ({ minHeight: 38, borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
          <Plus color="#fff" size={15} /><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>新建密钥</Text>
        </Pressable>
      </View>

      {keys.error ? <ErrorState message={keys.error.message} retry={() => keys.refetch()} /> : null}
      {(keys.data ?? []).map((item, index) => {
        const marker = keyId(item) || keyPreview(item);
        return <KeyCard
          key={marker || String(index)}
          item={item}
          copied={copiedKey === marker}
          busy={keyBusy}
          onModels={openModels}
          onToggle={(target, disabled) => toggleMutation.mutate({ item: target, disabled })}
          onCopy={(target) => void copyExistingKey(target)}
          onDelete={confirmDelete}
        />;
      })}
      {!keys.data?.length && !keys.isFetching ? <EmptyState message="还没有 API 密钥" icon={KeyRound} /> : null}
    </>}

    <Modal visible={Boolean(modelKey)} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setModelKey(undefined)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ height: '72%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.page, padding: 16, gap: 12 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <IconTile icon={Boxes} size={36} iconSize={17} />
            <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>可用模型</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>{String(modelKey?.name ?? '当前密钥')}</Text></View>
            <Pressable accessibilityLabel="关闭" onPress={() => setModelKey(undefined)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>

          <View style={{ minHeight: 42, padding: 3, borderRadius: 13, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
            {([['follow', '跟随套餐'], ['custom', '自定义模型']] as const).map(([mode, label]) => {
              const selected = modelMode === mode;
              return <Pressable key={mode} onPress={() => setModelMode(mode)} style={{ flex: 1, minHeight: 36, borderRadius: 10, borderWidth: selected ? 1 : 0, borderColor: selected ? colors.border : 'transparent', backgroundColor: selected ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: selected ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '800' }}>{label}</Text></Pressable>;
            })}
          </View>

          {models.error ? <ErrorState message={models.error.message} retry={() => models.refetch()} /> : null}
          {modelMode === 'follow' ? <View style={{ flex: 1, borderRadius: 13, backgroundColor: colors.primarySoft, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 5 }}><Boxes color={colors.primary} size={24} /><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>套餐允许的全部模型</Text></View> : <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
            {models.isFetching ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 18 }} /> : null}
            {visibleModels.map((model: ModelItem) => {
              const id = String(model.id ?? '');
              const selected = selectedModels.includes(id);
              return <Pressable key={id} onPress={() => toggleSelectedModel(id)} style={({ pressed }) => ({ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.68 : 1 })}>
                <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>{selected ? <Check color="#fff" size={13} /> : null}</View>
                <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontFamily: 'monospace', fontWeight: '800' }}>{id}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>{String(model.provider ?? model.owned_by ?? '未知供应商')}</Text></View>
              </Pressable>;
            })}
            {!visibleModels.length && !models.isFetching ? <EmptyState message="暂无可选模型" embedded /> : null}
          </ScrollView>}

          {modelMutation.error ? <Text style={{ color: colors.danger, fontSize: 11, lineHeight: 17 }}>{modelMutation.error.message}</Text> : null}
          <Pressable disabled={modelMutation.isPending || (modelMode === 'custom' && !selectedModels.length)} onPress={() => modelMutation.mutate()} style={{ minHeight: 46, borderRadius: 12, backgroundColor: !modelMutation.isPending && (modelMode === 'follow' || selectedModels.length) ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>{modelMutation.isPending ? '保存中...' : modelMode === 'follow' ? '保存并跟随套餐' : `保存 ${selectedModels.length} 个模型`}</Text></Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>

    <Modal visible={creating} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={closeCreate}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ width: '100%', maxWidth: 560, height: '90%', maxHeight: 760, alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.page, padding: 16, gap: 12 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: '800' }}>创建新密钥</Text>
              <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 17, marginTop: 2 }}>留空密钥则自动生成。</Text>
            </View>
            <Pressable accessibilityLabel="关闭" disabled={createMutation.isPending} onPress={closeCreate} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', opacity: createMutation.isPending ? 0.45 : 1 }}><X color={colors.subtext} size={16} /></Pressable>
          </View>

          <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 13, paddingBottom: 4 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>密钥名称</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder="例如：生产环境" placeholderTextColor={colors.placeholder} autoFocus style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontSize: 13 }} />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>套餐</Text>
              <Pressable onPress={() => setPlanPickerOpen((value) => !value)} style={({ pressed }) => ({ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: planPickerOpen ? colors.primary : colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.68 : 1 })}>
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 12, fontWeight: '600' }}>{selectedPlan?.name ? String(selectedPlan.name) : '余额扣费（不绑定套餐）'}</Text>
                {plans.isFetching && !plans.data ? <ActivityIndicator color={colors.primary} size="small" /> : <ChevronDown color={colors.subtext} size={16} style={{ transform: [{ rotate: planPickerOpen ? '180deg' : '0deg' }] }} />}
              </Pressable>
              {planPickerOpen ? <View style={{ maxHeight: 190, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
                <ScrollView nestedScrollEnabled bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
                  <Pressable onPress={() => chooseCreatePlan('')} style={{ minHeight: 44, paddingHorizontal: 11, borderBottomWidth: plans.data?.length ? 1 : 0, borderBottomColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: newPlanId ? '600' : '800' }}>余额扣费（不绑定套餐）</Text>{!newPlanId ? <Check color={colors.primary} size={15} /> : null}</Pressable>
                  {(plans.data ?? []).map((plan, index) => {
                    const id = String(plan.id ?? '');
                    const selected = id === newPlanId;
                    return <Pressable key={id || String(index)} onPress={() => chooseCreatePlan(id)} style={{ minHeight: 44, paddingHorizontal: 11, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 11, fontWeight: selected ? '800' : '600' }}>{String(plan.name ?? `套餐 ${index + 1}`)}</Text>{selected ? <Check color={colors.primary} size={15} /> : null}</Pressable>;
                  })}
                </ScrollView>
              </View> : null}
              {plans.error ? <Text style={{ color: colors.danger, fontSize: 11, lineHeight: 16 }}>套餐加载失败：{plans.error.message}</Text> : null}
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>密钥</Text>
              <TextInput value={newCustomKey} onChangeText={setNewCustomKey} placeholder="留空则自动生成" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} maxLength={200} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: customKeyValid ? colors.border : colors.danger, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontFamily: 'monospace', fontSize: 12 }} />
              <Text style={{ color: customKeyValid ? colors.subtext : colors.danger, fontSize: 11, lineHeight: 16 }}>16-200 个字符，可用字母、数字与 . _ ~ + / = -</Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>可用模型</Text>
              <View style={{ width: 224, minHeight: 40, padding: 3, borderRadius: 12, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
                {([['all', '全部模型'], ['restricted', '仅限所选模型']] as const).map(([mode, label]) => {
                  const selected = createModelMode === mode;
                  return <Pressable key={mode} onPress={() => { setCreateModelMode(mode); if (mode === 'all') setCreateSelectedModels([]); }} style={{ flex: 1, minWidth: 0, minHeight: 34, borderRadius: 9, borderWidth: selected ? 1 : 0, borderColor: selected ? colors.border : 'transparent', backgroundColor: selected ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={1} style={{ color: selected ? colors.text : colors.subtext, fontSize: 11, fontWeight: selected ? '800' : '600' }}>{label}</Text></Pressable>;
                })}
              </View>
              <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 17 }}>{selectedPlanModelIds.length ? `套餐「${String(selectedPlan?.name ?? '')}」已限制在 ${selectedPlanModelIds.length} 个模型内，密钥只能继续收窄。` : '把这一把 Key 限制在几个模型上，交给单个工具使用时更合适。'}</Text>

              {createModelMode === 'all' ? <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 17 }}>{selectedPlanModelIds.length ? '套餐允许的全部模型都可以调用。' : '网关提供的所有模型都可以调用。'}</Text> : <View style={{ gap: 7 }}>
                <View style={{ minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Search color={colors.subtext} size={14} /><TextInput value={createModelSearch} onChangeText={setCreateModelSearch} placeholder="搜索模型" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 11, paddingVertical: 8 }} /></View>
                <View style={{ maxHeight: 220, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
                  <ScrollView nestedScrollEnabled bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
                    {models.isFetching ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} /> : null}
                    {filteredCreateModels.map((model, index) => {
                      const id = String(model.id ?? '');
                      const selected = createSelectedModels.includes(id);
                      return <Pressable key={id} onPress={() => toggleCreateModel(id)} style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, backgroundColor: selected ? colors.primarySoft : colors.card, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.68 : 1 })}>
                        <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>{selected ? <Check color="#fff" size={13} /> : null}</View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, fontWeight: '800' }}>{id}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{String(model.display_name ?? model.provider ?? model.owned_by ?? '未知供应商')}</Text></View>
                      </Pressable>;
                    })}
                    {!filteredCreateModels.length && !models.isFetching ? <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 18, textAlign: 'center', padding: 16 }}>{createModelSearch.trim() ? '没有匹配的模型' : '暂时没有可选的模型'}</Text> : null}
                  </ScrollView>
                </View>
                <Text style={{ color: createSelectedModels.length ? colors.subtext : colors.warning, fontSize: 11, lineHeight: 16 }}>{createSelectedModels.length ? `已选 ${createSelectedModels.length} 个模型` : '还没有选择模型，按当前规则创建后等同于全部模型。'}</Text>
              </View>}
            </View>
          </ScrollView>

          {createMutation.error ? <Text style={{ color: colors.danger, fontSize: 11 }}>{createMutation.error.message}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Pressable disabled={createMutation.isPending} onPress={closeCreate} style={({ pressed }) => ({ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: createMutation.isPending ? 0.45 : pressed ? 0.65 : 1 })}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>取消</Text></Pressable>
            <Pressable disabled={!canCreate} onPress={() => createMutation.mutate()} style={({ pressed }) => ({ flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: canCreate ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{createMutation.isPending ? '创建中...' : '创建密钥'}</Text></Pressable>
          </View>
        </View>
      </FullScreenSafeArea>
    </Modal>

    <Modal visible={Boolean(secret)} transparent animationType="slide" onRequestClose={() => setSecret('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.page, padding: 20, gap: 14 }}>
          <SheetHandle />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>密钥创建成功</Text>
          <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 18 }}>完整密钥只显示这一次，请立即复制并妥善保存。</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.mutedCard }}>
            <Text selectable numberOfLines={3} style={{ flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 11 }}>{secretVisible ? secret : secret.replace(/./g, '•').slice(0, 40)}</Text>
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
