import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Plus,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, Page, SearchField } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import {
  createAdminModel,
  deleteAdminModel,
  getAdminModels,
  runAdminModelAction,
  setAdminModelsEnabled,
  updateAdminModel,
} from '@/src/services/admin';
import type { ApiRecord } from '@/src/types/api';

type ModelGroup = { provider: string; items: ApiRecord[] };
type ListEntry = { kind: 'provider'; group: ModelGroup } | { kind: 'model'; provider: string; item: ApiRecord };
type FormMode = 'create' | 'edit' | '';
type ModelDraft = {
  id: string;
  provider: string;
  display_name: string;
  upstream_model: string;
  family: string;
  input_price_per_1m: string;
  output_price_per_1m: string;
  cache_read_per_1m: string;
  cache_write_per_1m: string;
  enabled: boolean;
  registry_hidden: boolean;
  user_hidden: boolean;
};

function modelId(item: ApiRecord) {
  return String(item.id ?? item.model ?? item.model_id ?? item.name ?? '');
}

function providerName(item: ApiRecord) {
  return String(item.provider ?? item.provider_name ?? item.owned_by ?? item.family ?? '未分组');
}

function displayName(item: ApiRecord) {
  return String(item.display_name ?? item.label ?? item.title ?? '—');
}

function upstreamModel(item: ApiRecord) {
  return String(item.upstream_model ?? item.upstream_id ?? item.source_model ?? '—');
}

function numberValue(item: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const number = Number(item[key]);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function price(item: ApiRecord, keys: string[]) {
  const value = numberValue(item, keys);
  return `$${value.toFixed(value >= 10 ? 2 : value >= 1 ? 3 : 4)}`;
}

function modalities(item: ApiRecord) {
  const value = item.modalities ?? item.modality ?? item.mode;
  if (Array.isArray(value)) return value.map(String).join(' / ');
  return String(value ?? '对话');
}

function accountCount(item: ApiRecord) {
  const count = numberValue(item, ['account_count', 'accounts_count', 'route_count']);
  if (count) return `${count} 个账号`;
  const accounts = item.accounts ?? item.routes;
  return Array.isArray(accounts) ? `${accounts.length} 个账号` : '—';
}

function emptyDraft(provider = ''): ModelDraft {
  return {
    id: '', provider, display_name: '', upstream_model: '', family: 'openai',
    input_price_per_1m: '0', output_price_per_1m: '0', cache_read_per_1m: '0', cache_write_per_1m: '0',
    enabled: true, registry_hidden: false, user_hidden: false,
  };
}

function draftFrom(item: ApiRecord): ModelDraft {
  return {
    id: modelId(item),
    provider: providerName(item) === '未分组' ? '' : providerName(item),
    display_name: String(item.display_name ?? item.label ?? ''),
    upstream_model: String(item.upstream_model ?? item.upstream_id ?? item.source_model ?? ''),
    family: String(item.family ?? 'openai'),
    input_price_per_1m: String(item.input_price_per_1m ?? item.prompt_price_per_1m ?? 0),
    output_price_per_1m: String(item.output_price_per_1m ?? item.completion_price_per_1m ?? 0),
    cache_read_per_1m: String(item.cache_read_per_1m ?? 0),
    cache_write_per_1m: String(item.cache_write_per_1m ?? 0),
    enabled: item.enabled !== false,
    registry_hidden: item.registry_hidden === true,
    user_hidden: item.user_hidden === true,
  };
}

function draftBody(draft: ModelDraft): ApiRecord {
  return {
    id: draft.id.trim(),
    provider: draft.provider.trim(),
    display_name: draft.display_name.trim(),
    upstream_model: draft.upstream_model.trim(),
    family: draft.family.trim(),
    input_price_per_1m: Number(draft.input_price_per_1m) || 0,
    output_price_per_1m: Number(draft.output_price_per_1m) || 0,
    cache_read_per_1m: Number(draft.cache_read_per_1m) || 0,
    cache_write_per_1m: Number(draft.cache_write_per_1m) || 0,
    enabled: draft.enabled,
    registry_hidden: draft.registry_hidden,
    user_hidden: draft.user_hidden,
  };
}

function CompactButton({ label, icon: Icon, onPress, primary = false, busy = false, danger = false }: { label: string; icon: typeof Plus; onPress: () => void; primary?: boolean; busy?: boolean; danger?: boolean }) {
  const colors = useAppTheme();
  const foreground = primary ? '#fff' : danger ? colors.danger : colors.text;
  return <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: primary ? 0 : 1, borderColor: danger ? colors.danger : colors.border, backgroundColor: primary ? colors.primary : colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.55 : pressed ? 0.65 : 1 })}>{busy ? <ActivityIndicator color={foreground} size="small" /> : <Icon color={foreground} size={15} />}<Text style={{ color: foreground, fontSize: 11, fontWeight: '800' }}>{label}</Text></Pressable>;
}

function PriceCell({ label, value }: { label: string; value: string }) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: '46%', minWidth: 0, gap: 3 }}><Text style={{ color: colors.subtext, fontSize: 9 }}>{label}</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text></View>;
}

function MobileModelCard({ item, busy, onToggle, onEdit, onDelete }: { item: ApiRecord; busy: boolean; onToggle: (enabled: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useAppTheme();
  return <View style={{ marginHorizontal: 1, borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Switch value={item.enabled !== false} disabled={busy} onValueChange={onToggle} trackColor={{ false: colors.disabled, true: colors.primary }} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, fontWeight: '800', fontFamily: 'monospace' }}>{modelId(item) || '未命名模型'}</Text>{displayName(item) !== '—' ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{displayName(item)}</Text> : null}</View>
      <Pressable accessibilityLabel="编辑模型" onPress={onEdit} style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><SlidersHorizontal color={colors.primary} size={15} /></Pressable>
      <Pressable accessibilityLabel="删除模型" onPress={onDelete} style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}><Trash2 color={colors.danger} size={15} /></Pressable>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <View style={{ flexGrow: 1, flexBasis: '46%' }}><Text style={{ color: colors.subtext, fontSize: 9 }}>上游模型</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, marginTop: 3 }}>{upstreamModel(item)}</Text></View>
      <View style={{ flexGrow: 1, flexBasis: '46%' }}><Text style={{ color: colors.subtext, fontSize: 9 }}>模态 / 分布</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, marginTop: 3 }}>{modalities(item)} · {accountCount(item)}</Text></View>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, padding: 10, borderRadius: 14, backgroundColor: colors.mutedCard }}>
      <PriceCell label="输入 / 1M" value={price(item, ['input_price_per_1m', 'prompt_price_per_1m'])} />
      <PriceCell label="输出 / 1M" value={price(item, ['output_price_per_1m', 'completion_price_per_1m'])} />
      <PriceCell label="缓存读取 / 1M" value={price(item, ['cache_read_per_1m'])} />
      <PriceCell label="缓存写入 / 1M" value={price(item, ['cache_write_per_1m'])} />
    </View>
  </View>;
}

function DesktopHeader() {
  const colors = useAppTheme();
  const cells: [string, number][] = [['启用', 0.45], ['模型 ID', 1.25], ['显示名称', 0.9], ['上游模型', 0.9], ['模态', 0.55], ['出口分布', 0.75], ['协议', 0.55], ['输入/1M', 0.62], ['输出/1M', 0.62], ['缓存读', 0.62], ['缓存写', 0.62], ['', 0.45]];
  return <View style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, backgroundColor: colors.mutedCard, paddingHorizontal: 8 }}>{cells.map(([label, flex], index) => <Text key={`${label}-${index}`} numberOfLines={1} style={{ flex, color: colors.subtext, fontSize: 9, fontWeight: '700', paddingHorizontal: 4 }}>{label}</Text>)}</View>;
}

function DesktopModelRow({ item, busy, onToggle, onEdit, onDelete }: { item: ApiRecord; busy: boolean; onToggle: (enabled: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useAppTheme();
  const textStyle = { color: colors.text, fontSize: 10, paddingHorizontal: 4 } as const;
  return <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8 }}>
    <View style={{ flex: 0.45, paddingHorizontal: 4 }}><Switch value={item.enabled !== false} disabled={busy} onValueChange={onToggle} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>
    <Text numberOfLines={2} style={[textStyle, { flex: 1.25, fontWeight: '800', fontFamily: 'monospace' }]}>{modelId(item)}</Text>
    <Text numberOfLines={2} style={[textStyle, { flex: 0.9 }]}>{displayName(item)}</Text>
    <Text numberOfLines={2} style={[textStyle, { flex: 0.9 }]}>{upstreamModel(item)}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.55 }]}>{modalities(item)}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.75, color: colors.primary }]}>{accountCount(item)}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.55, color: colors.subtext }]}>{String(item.family ?? '—')}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.62 }]}>{price(item, ['input_price_per_1m', 'prompt_price_per_1m'])}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.62 }]}>{price(item, ['output_price_per_1m', 'completion_price_per_1m'])}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.62 }]}>{price(item, ['cache_read_per_1m'])}</Text>
    <Text numberOfLines={1} style={[textStyle, { flex: 0.62 }]}>{price(item, ['cache_write_per_1m'])}</Text>
    <View style={{ flex: 0.45, flexDirection: 'row', justifyContent: 'flex-end' }}><Pressable accessibilityLabel="编辑模型" onPress={onEdit} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}><SlidersHorizontal color={colors.primary} size={13} /></Pressable><Pressable accessibilityLabel="删除模型" onPress={onDelete} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}><Trash2 color={colors.danger} size={13} /></Pressable></View>
  </View>;
}

function FormField({ label, value, onChangeText, numeric = false, editable = true }: { label: string; value: string; onChangeText: (value: string) => void; numeric?: boolean; editable?: boolean }) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: '46%', minWidth: 0, gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text><TextInput editable={editable} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: editable ? colors.card : colors.mutedCard, paddingHorizontal: 11, color: editable ? colors.text : colors.subtext, fontSize: 13 }} /></View>;
}

export default function AdminModelsScreen() {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const initializedExpansion = useRef(false);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('全部供应商');
  const [filterVisible, setFilterVisible] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyModel, setBusyModel] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('');
  const [editing, setEditing] = useState<ApiRecord>();
  const [draft, setDraft] = useState<ModelDraft>(emptyDraft());

  const query = useQuery({ queryKey: ['admin', 'models', 'catalog'], queryFn: ({ signal }) => getAdminModels(signal) });
  const groups = useMemo(() => {
    const grouped = new Map<string, ApiRecord[]>();
    for (const item of query.data ?? []) {
      const provider = providerName(item);
      const values = grouped.get(provider) ?? [];
      values.push(item);
      grouped.set(provider, values);
    }
    return Array.from(grouped, ([provider, items]) => ({ provider, items })).sort((a, b) => a.provider.localeCompare(b.provider));
  }, [query.data]);

  useEffect(() => {
    if (!initializedExpansion.current && groups[0]) {
      initializedExpansion.current = true;
      setExpanded(new Set([groups[0].provider]));
    }
  }, [groups]);

  const providers = useMemo(() => ['全部供应商', ...groups.map((group) => group.provider)], [groups]);
  const visibleGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return groups.flatMap((group) => {
      if (providerFilter !== '全部供应商' && group.provider !== providerFilter) return [];
      if (!keyword) return [group];
      const items = group.items.filter((item) => `${modelId(item)} ${displayName(item)} ${upstreamModel(item)} ${group.provider}`.toLowerCase().includes(keyword));
      return items.length ? [{ ...group, items }] : [];
    });
  }, [groups, providerFilter, search]);

  const listData = useMemo<ListEntry[]>(() => visibleGroups.flatMap((group) => {
    const open = Boolean(search.trim()) || expanded.has(group.provider);
    return [{ kind: 'provider' as const, group }, ...(open ? group.items.map((item) => ({ kind: 'model' as const, provider: group.provider, item })) : [])];
  }), [expanded, search, visibleGroups]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'models', 'catalog'] });
  const toggleMutation = useMutation({
    mutationFn: ({ item, enabled }: { item: ApiRecord; enabled: boolean }) => setAdminModelsEnabled({ ids: [modelId(item)], enabled }),
    onMutate: ({ item }) => setBusyModel(modelId(item)),
    onError: (error) => Alert.alert('更新失败', error.message),
    onSettled: () => { setBusyModel(''); void invalidate(); },
  });
  const removeMutation = useMutation({
    mutationFn: deleteAdminModel,
    onSuccess: () => void invalidate(),
    onError: (error) => Alert.alert('删除失败', error.message),
  });
  const formMutation = useMutation({
    mutationFn: () => formMode === 'create' ? createAdminModel(draftBody(draft)) : updateAdminModel(modelId(editing ?? {}), draftBody(draft)),
    onSuccess: () => { setFormMode(''); setEditing(undefined); void invalidate(); },
    onError: (error) => Alert.alert('保存失败', error.message),
  });

  async function maintenance(action: 'sync' | 'probe' | 'cleanup', value: ApiRecord = {}) {
    setBusyAction(`${action}-${String(value.provider ?? '')}`);
    try {
      await runAdminModelAction(action, value);
      await invalidate();
      Alert.alert('已完成', action === 'sync' ? '模型价格已同步。' : action === 'probe' ? '模型探测已完成。' : '失效模型已清理。');
    } catch (error) {
      Alert.alert('操作失败', error instanceof Error ? error.message : '请求失败');
    } finally {
      setBusyAction('');
    }
  }

  function openCreate() {
    const provider = providerFilter === '全部供应商' ? '' : providerFilter;
    setDraft(emptyDraft(provider)); setEditing(undefined); setFormMode('create');
  }

  function openEdit(item: ApiRecord) {
    setDraft(draftFrom(item)); setEditing(item); setFormMode('edit');
  }

  function confirmDelete(item: ApiRecord) {
    Alert.alert('删除模型', `确定删除「${modelId(item)}」吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => removeMutation.mutate(modelId(item)) }]);
  }

  function toggleGroup(provider: string) {
    setExpanded((current) => { const next = new Set(current); next.has(provider) ? next.delete(provider) : next.add(provider); return next; });
  }

  return <Page title="模型" subtitle="模型定价、能力与上游分布" icon={Boxes} safeTop={false} contentMaxWidth={1180} scrollable={false} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <CompactButton label="重新探测" icon={Radar} busy={busyAction === 'probe-'} onPress={() => void maintenance('probe')} />
      <CompactButton label="同步价格" icon={RefreshCw} busy={busyAction === 'sync-'} onPress={() => void maintenance('sync')} />
      <CompactButton label="添加模型" icon={Plus} primary onPress={openCreate} />
    </View>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 8 }}>
      <View style={{ flex: 1 }}><SearchField value={search} onChangeText={setSearch} placeholder="搜索模型或供应商…" /></View>
      <Pressable onPress={() => setFilterVisible(true)} style={{ minWidth: wide ? 220 : undefined, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}><SlidersHorizontal color={colors.subtext} size={15} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>{providerFilter}</Text><ChevronDown color={colors.subtext} size={15} /></Pressable>
    </View>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}

    <FlatList
      data={listData}
      keyExtractor={(entry, index) => entry.kind === 'provider' ? `provider-${entry.group.provider}` : `model-${entry.provider}-${modelId(entry.item)}-${index}`}
      initialNumToRender={18}
      maxToRenderPerBatch={16}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ paddingBottom: 20, flexGrow: listData.length ? 0 : 1 }}
      ListEmptyComponent={!query.isFetching ? <EmptyState icon={Boxes} message="没有匹配的模型" /> : null}
      renderItem={({ item: entry }) => {
        if (entry.kind === 'provider') {
          const open = Boolean(search.trim()) || expanded.has(entry.group.provider);
          const groupBusy = busyAction === `probe-${entry.group.provider}`;
          return <View>
            <Pressable onPress={() => toggleGroup(entry.group.provider)} style={({ pressed }) => ({ marginTop: 10, minHeight: 56, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: open ? 0 : 8, borderBottomRightRadius: open ? 0 : 8, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.7 : 1 })}>
              {open ? <ChevronDown color={colors.subtext} size={16} /> : <ChevronRight color={colors.subtext} size={16} />}
              <View style={{ width: 30, height: 30, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><Boxes color={colors.text} size={15} /></View>
              <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' }}>{entry.group.provider}</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.text, fontSize: 9, fontWeight: '700' }}>{entry.group.items.length} 个模型</Text></View>
              <Pressable disabled={groupBusy} onPress={(event) => { event.stopPropagation(); void maintenance('probe', { provider: entry.group.provider }); }} style={{ minHeight: 34, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}>{groupBusy ? <ActivityIndicator color={colors.primary} size="small" /> : <Radar color={colors.primary} size={13} />}<Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>探测</Text></Pressable>
            </Pressable>
            {open && wide ? <DesktopHeader /> : null}
          </View>;
        }
        const id = modelId(entry.item);
        const rowProps = { item: entry.item, busy: busyModel === id, onToggle: (enabled: boolean) => toggleMutation.mutate({ item: entry.item, enabled }), onEdit: () => openEdit(entry.item), onDelete: () => confirmDelete(entry.item) };
        return wide ? <DesktopModelRow {...rowProps} /> : <MobileModelCard {...rowProps} />;
      }}
    />

    <Modal visible={filterVisible} transparent animationType="fade" onRequestClose={() => setFilterVisible(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' }}><View style={{ width: '100%', maxWidth: 420, maxHeight: '75%', alignSelf: 'center', borderRadius: 18, backgroundColor: colors.page, padding: 16, gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '800' }}>筛选供应商</Text><Pressable accessibilityLabel="关闭" onPress={() => setFilterVisible(false)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View><FlatList data={providers} keyExtractor={(item) => item} renderItem={({ item }) => <Pressable onPress={() => { setProviderFilter(item); setFilterVisible(false); }} style={{ minHeight: 44, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: providerFilter === item ? '800' : '600' }}>{item}</Text>{providerFilter === item ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}</Pressable>} /></View></FullScreenSafeArea>
    </Modal>

    <Modal visible={Boolean(formMode)} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setFormMode('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}><View style={{ maxHeight: '90%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{formMode === 'create' ? '添加模型' : '编辑模型'}</Text><Pressable accessibilityLabel="关闭" onPress={() => setFormMode('')} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable></View>
        <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 }}>
          <FormField label="模型 ID" value={draft.id} editable={formMode === 'create'} onChangeText={(value) => setDraft((current) => ({ ...current, id: value }))} />
          <FormField label="供应商" value={draft.provider} onChangeText={(value) => setDraft((current) => ({ ...current, provider: value }))} />
          <FormField label="显示名称" value={draft.display_name} onChangeText={(value) => setDraft((current) => ({ ...current, display_name: value }))} />
          <FormField label="上游模型" value={draft.upstream_model} onChangeText={(value) => setDraft((current) => ({ ...current, upstream_model: value }))} />
          <FormField label="协议" value={draft.family} onChangeText={(value) => setDraft((current) => ({ ...current, family: value }))} />
          <View style={{ flexGrow: 1, flexBasis: '46%' }} />
          <FormField label="输入价格 / 1M" value={draft.input_price_per_1m} numeric onChangeText={(value) => setDraft((current) => ({ ...current, input_price_per_1m: value }))} />
          <FormField label="输出价格 / 1M" value={draft.output_price_per_1m} numeric onChangeText={(value) => setDraft((current) => ({ ...current, output_price_per_1m: value }))} />
          <FormField label="缓存读取 / 1M" value={draft.cache_read_per_1m} numeric onChangeText={(value) => setDraft((current) => ({ ...current, cache_read_per_1m: value }))} />
          <FormField label="缓存写入 / 1M" value={draft.cache_write_per_1m} numeric onChangeText={(value) => setDraft((current) => ({ ...current, cache_write_per_1m: value }))} />
          {([['启用模型', 'enabled'], ['注册表隐藏', 'registry_hidden'], ['用户隐藏', 'user_hidden']] as const).map(([label, key]) => <View key={key} style={{ flexGrow: 1, flexBasis: '30%', minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text><Switch value={draft[key]} onValueChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>)}
        </ScrollView>
        <Pressable disabled={formMutation.isPending || !draft.id.trim()} onPress={() => formMutation.mutate()} style={{ minHeight: 48, borderRadius: 12, backgroundColor: draft.id.trim() ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>{formMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>保存模型</Text>}</Pressable>
      </View></FullScreenSafeArea>
    </Modal>
  </Page>;
}
