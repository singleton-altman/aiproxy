import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  KeyRound,
  RefreshCw,
  Server,
  UsersRound,
  X,
} from 'lucide-react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ProviderIcon } from '@/src/components/provider-icon';
import { AppSwitch, EmptyState, ErrorState, FullScreenSafeArea, SheetHandle } from '@/src/components/ui';
import { accountIdentity, accountProvider } from '@/src/lib/account-display';
import { apiJson, firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import { useScreenFocus } from '@/src/lib/use-screen-focus';
import { getAdminLogsRequests } from '@/src/services/admin';
import type { ApiRecord } from '@/src/types/api';

const PAGE_SIZE = 20;
const ranges = [['24h', '近 24 小时'], ['7d', '最近 7 天'], ['30d', '最近 30 天']] as const;
const resultOptions = [['all', '全部'], ['ok', '正常'], ['failed', '失败']] as const;
const logColumns = [
  ['time', '时间'],
  ['source', '来源'],
  ['account', '账号'],
  ['apiKey', 'API 密钥'],
  ['model', '模型'],
  ['modelAlias', '模型别名'],
  ['reasoningEffort', '推理强度'],
  ['speedMode', '速度模式'],
  ['result', '结果'],
  ['type', '类型'],
  ['endpoint', '端点'],
  ['ttft', '首包延迟'],
  ['latency', '总延迟'],
  ['genSpeed', '生成速度'],
  ['inputTokens', '输入 Token'],
  ['cacheReadTokens', '缓存读取'],
  ['cacheWriteTokens', '缓存写入'],
  ['outputTokens', '输出 Token'],
  ['reasoningTokens', '推理 Token'],
  ['cost', '费用'],
  ['error', '错误正文'],
] as const;

type Range = typeof ranges[number][0];
type ResultFilter = typeof resultOptions[number][0];
type LogColumnId = typeof logColumns[number][0];
type PickerMode = 'account' | 'columns' | '';

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function records(value: unknown): ApiRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ['items', 'events', 'requests', 'logs', 'rows', 'list', 'data']) {
    if (Array.isArray(value[key])) return (value[key] as unknown[]).filter(isRecord);
  }
  return isRecord(value.data) ? records(value.data) : [];
}

function firstText(item: ApiRecord, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function firstNumber(item: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const raw = item[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function formatTimestamp(item: ApiRecord) {
  const raw = firstText(item, ['timestamp', 'created_at', 'time', 'occurred_at', 'started_at'], '--');
  if (raw === '--') return raw;
  const numeric = /^\d{9,13}$/.test(raw) ? Number(raw) : undefined;
  const date = numeric === undefined ? new Date(raw) : new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(value: number) {
  if (!value) return '--';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

function formatTokens(value: number, estimated: boolean, emptyWhenZero = false) {
  return !value && emptyWhenZero ? '--' : `${estimated ? '~' : ''}${Math.round(value).toLocaleString()}`;
}

function eventFailed(item: ApiRecord) {
  const statusCode = firstNumber(item, ['status_code', 'http_status']);
  const failed = item.failed === true || item.failed === 1 || String(item.failed).toLowerCase() === 'true';
  return failed || Boolean(item.error_body ?? item.error) || statusCode >= 400 || firstText(item, ['status']).toLowerCase() === 'failed';
}

function accountLabel(item: ApiRecord) {
  return firstText(item, ['account_label', 'account_name', 'account_email', 'auth_label', 'auth_index', 'account_id'], '--');
}

function generationSpeed(item: ApiRecord) {
  const output = firstNumber(item, ['output_tokens', 'completion_tokens']);
  const latency = firstNumber(item, ['latency_ms', 'duration_ms']);
  const firstToken = item.streaming ? firstNumber(item, ['first_token_ms', 'ttft_ms']) : 0;
  const generationMs = Math.max(0, latency - firstToken);
  if (!output || !generationMs) return '--';
  return `${item.tokens_estimated ? '~' : ''}${(output / generationMs * 1000).toFixed(1)} t/s`;
}

function columnValue(item: ApiRecord, id: LogColumnId) {
  const estimated = item.tokens_estimated === true;
  switch (id) {
    case 'time': return formatTimestamp(item);
    case 'source': return [firstText(item, ['nickname', 'user_name', 'user_id'], '--'), firstText(item, ['provider'])].filter(Boolean).join(' · ');
    case 'account': return accountLabel(item);
    case 'apiKey': return firstText(item, ['api_key_name', 'key_name', 'api_key_id'], '--');
    case 'model': return firstText(item, ['model', 'model_id'], '--');
    case 'modelAlias': return firstText(item, ['requested_model', 'model_alias'], '--');
    case 'reasoningEffort': return firstText(item, ['reasoning_effort'], '--');
    case 'speedMode': return firstText(item, ['speed_mode'], '--');
    case 'result': {
      const statusCode = firstNumber(item, ['status_code', 'http_status']);
      return `${eventFailed(item) ? '失败' : '正常'}${statusCode ? ` · HTTP ${statusCode}` : ''}`;
    }
    case 'type': return item.streaming ? 'SSE' : 'JSON';
    case 'endpoint': return firstText(item, ['endpoint', 'path', 'route'], '--');
    case 'ttft': return item.streaming ? formatDuration(firstNumber(item, ['first_token_ms', 'ttft_ms'])) : '--';
    case 'latency': return formatDuration(firstNumber(item, ['latency_ms', 'duration_ms']));
    case 'genSpeed': return generationSpeed(item);
    case 'inputTokens': return formatTokens(firstNumber(item, ['input_tokens', 'prompt_tokens']), estimated);
    case 'cacheReadTokens': return formatTokens(firstNumber(item, ['cached_tokens', 'cache_read_tokens']), estimated, true);
    case 'cacheWriteTokens': return formatTokens(firstNumber(item, ['cache_write_tokens']), estimated, true);
    case 'outputTokens': return formatTokens(firstNumber(item, ['output_tokens', 'completion_tokens']), estimated);
    case 'reasoningTokens': return formatTokens(firstNumber(item, ['reasoning_tokens']), estimated);
    case 'cost': return `$${firstNumber(item, ['cost_usd', 'cost']).toFixed(6)}`;
    case 'error': return firstText(item, ['error_body', 'error'], '--');
  }
}

function requestPage(value: unknown) {
  const outer = isRecord(value) ? value : {};
  const root = isRecord(outer.data) ? outer.data : outer;
  const pagination = isRecord(root.pagination) ? root.pagination : isRecord(root.meta) ? root.meta : {};
  const items = records(value);
  const page = firstNumber(root, ['page']) || firstNumber(pagination, ['page', 'current_page']) || 1;
  const pageSize = firstNumber(root, ['page_size']) || firstNumber(pagination, ['page_size', 'per_page']) || PAGE_SIZE;
  const total = firstNumber(root, ['total']) || firstNumber(pagination, ['total', 'total_count']) || items.length;
  return { items, page, pageSize, total };
}

function useDebouncedValue(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function FilterInput({ icon: Icon, value, onChangeText, placeholder, basis }: { icon: LucideIcon; value: string; onChangeText: (value: string) => void; placeholder: string; basis: `${number}%` }) {
  const colors = useAppTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ flexGrow: 1, flexBasis: basis, minWidth: 0, height: 42, borderRadius: 12, borderWidth: 1, borderColor: focused ? colors.primary : colors.border, backgroundColor: colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
    <Icon color={focused ? colors.primary : colors.subtext} size={14} />
    <TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 11, paddingVertical: 8 }} />
    {value ? <Pressable accessibilityLabel={`清除${placeholder}`} onPress={() => onChangeText('')} hitSlop={6}><X color={colors.subtext} size={13} /></Pressable> : null}
  </View>;
}

const RequestCard = memo(function RequestCard({ item, visibleColumns }: { item: ApiRecord; visibleColumns: Set<LogColumnId> }) {
  const colors = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const failed = eventFailed(item);
  const model = columnValue(item, 'model');
  const requestId = firstText(item, ['id', 'request_id', 'trace_id'], '请求记录');
  const coreIds = new Set<LogColumnId>(['time', 'source', 'account', 'model', 'result']);
  const metricIds = (['type', 'endpoint', 'latency', 'genSpeed', 'inputTokens', 'outputTokens', 'cost'] as LogColumnId[]).filter((id) => visibleColumns.has(id)).slice(0, 4);
  const shown = new Set<LogColumnId>([...coreIds, ...metricIds]);
  const detailColumns = logColumns.filter(([id]) => visibleColumns.has(id) && !shown.has(id));
  const primary = visibleColumns.has('model') ? model : visibleColumns.has('endpoint') ? columnValue(item, 'endpoint') : requestId;

  return <Pressable onPress={() => detailColumns.length && setExpanded((value) => !value)} style={({ pressed }) => ({ borderRadius: 16, borderWidth: 1, borderColor: failed ? colors.dangerBg : colors.border, backgroundColor: pressed ? colors.mutedCard : colors.card, padding: 10, gap: 7, opacity: pressed ? 0.75 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <ProviderIcon provider={firstText(item, ['provider'])} size={34} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '800', fontFamily: visibleColumns.has('model') ? 'monospace' : undefined }}>{primary}</Text>
        {visibleColumns.has('time') ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{columnValue(item, 'time')}</Text> : null}
      </View>
      {visibleColumns.has('result') ? <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: failed ? colors.dangerBg : colors.successBg }}><Text style={{ color: failed ? colors.danger : colors.success, fontSize: 11, fontWeight: '800' }}>{failed ? '失败' : '正常'}</Text></View> : null}
      {detailColumns.length ? <ChevronDown color={colors.subtext} size={15} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} /> : null}
    </View>

    {(visibleColumns.has('source') || visibleColumns.has('account')) ? <View style={{ marginLeft: 43, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      {visibleColumns.has('source') ? <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.subtext, fontSize: 11 }}>{columnValue(item, 'source')}</Text> : <View style={{ flex: 1 }} />}
      {visibleColumns.has('account') ? <Text numberOfLines={1} style={{ maxWidth: '45%', color: colors.subtext, fontSize: 11 }}>{columnValue(item, 'account')}</Text> : null}
    </View> : null}

    {metricIds.length ? <View style={{ marginLeft: 43, flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 5 }}>{metricIds.map((id) => <Text key={id} style={{ color: colors.subtext, fontSize: 11 }}><Text style={{ color: id === 'cost' ? colors.success : colors.text, fontWeight: '700' }}>{logColumns.find(([key]) => key === id)?.[1]}</Text> {columnValue(item, id)}</Text>)}</View> : null}

    {expanded && detailColumns.length ? <View style={{ marginLeft: 43, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.rowBorder, gap: 6 }}>
      {detailColumns.map(([id, label]) => <View key={id} style={{ flexDirection: 'row', gap: 10 }}><Text style={{ width: 78, color: colors.subtext, fontSize: 11 }}>{label}</Text><Text selectable numberOfLines={id === 'error' ? 5 : 2} style={{ flex: 1, color: id === 'error' && failed ? colors.danger : colors.text, fontSize: 11, lineHeight: 16, fontFamily: ['apiKey', 'modelAlias', 'endpoint', 'error'].includes(id) ? 'monospace' : undefined }}>{columnValue(item, id)}</Text></View>)}
    </View> : null}
  </Pressable>;
});

export function AdminRequestLogs() {
  const colors = useAppTheme();
  const screenFocused = useScreenFocus();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const inputBasis: `${number}%` = wide ? '31%' : '47%';
  const [range, setRange] = useState<Range>('7d');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [result, setResult] = useState<ResultFilter>('all');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('');
  const [visibleColumns, setVisibleColumns] = useState<Set<LogColumnId>>(() => new Set(logColumns.map(([id]) => id)));
  const debouncedModel = useDebouncedValue(model.trim());
  const debouncedProvider = useDebouncedValue(provider.trim());
  const debouncedApiKey = useDebouncedValue(apiKey.trim());

  useEffect(() => setPage(1), [accountId, debouncedApiKey, debouncedModel, debouncedProvider, range, result]);

  const accounts = useQuery({
    queryKey: ['admin', 'accounts', 'request-log-filter'],
    queryFn: async ({ signal }) => firstArray<ApiRecord>(await apiJson<unknown>('/admin/accounts', { signal, cache: 'no-store' }), ['accounts', 'items', 'data', 'list']),
    retry: 0,
    staleTime: 30_000,
  });
  const accountItems = useMemo(() => [...(accounts.data ?? [])].sort((left, right) => accountIdentity(left).primary.localeCompare(accountIdentity(right).primary, 'zh-CN')), [accounts.data]);
  const accountOptions = useMemo<Array<{ id: string; label: string; item?: ApiRecord }>>(() => [
    { id: '', label: '全部账号' },
    ...accountItems.map((item) => ({ id: firstText(item, ['id', 'auth_index']), label: accountIdentity(item).primary, item })),
  ], [accountItems]);
  const selectedAccount = accountItems.find((item) => firstText(item, ['id', 'auth_index']) === accountId);

  const query = useQuery<unknown, Error>({
    queryKey: ['admin', 'request-logs', range, page, debouncedModel, debouncedProvider, debouncedApiKey, accountId, result],
    queryFn: ({ signal }) => getAdminLogsRequests({
      range,
      page,
      page_size: PAGE_SIZE,
      model: debouncedModel || undefined,
      provider: debouncedProvider || undefined,
      api_key_id: debouncedApiKey || undefined,
      auth_index: accountId || undefined,
      failed: result === 'all' ? undefined : result === 'failed',
    }, signal),
    retry: 0,
    staleTime: 0,
    placeholderData: (previous: unknown) => previous,
    refetchInterval: autoRefresh && screenFocused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const data = requestPage(query.data);
  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize)));
  const hasNext = data.total ? data.page < totalPages : data.items.length >= data.pageSize;
  const filtersActive = Boolean(model.trim() || provider.trim() || apiKey.trim() || accountId || result !== 'all');

  function resetFilters() {
    setModel('');
    setProvider('');
    setApiKey('');
    setAccountId('');
    setResult('all');
  }

  function toggleColumn(id: LogColumnId) {
    setVisibleColumns((current) => {
      if (current.has(id) && current.size <= 1) return current;
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const listHeader = <View style={{ gap: 8, paddingBottom: 2 }}>
    <View accessibilityRole="tablist" style={{ minHeight: 40, padding: 3, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
      {ranges.map(([id, label]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: range === id }} onPress={() => setRange(id)} style={{ flex: 1, minWidth: 0, minHeight: 32, borderRadius: 10, borderWidth: range === id ? 1 : 0, borderColor: range === id ? colors.border : 'transparent', backgroundColor: range === id ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={1} style={{ color: range === id ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      <FilterInput icon={Boxes} value={model} onChangeText={setModel} placeholder="模型" basis={inputBasis} />
      <FilterInput icon={Server} value={provider} onChangeText={setProvider} placeholder="供应商" basis={inputBasis} />
      <FilterInput icon={KeyRound} value={apiKey} onChangeText={setApiKey} placeholder="API 密钥" basis={inputBasis} />
    </View>

    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 7 }}>
      <Pressable onPress={() => setPickerMode('account')} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: accountId ? colors.primary : colors.border, backgroundColor: colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.68 : 1 })}>
        {selectedAccount ? <ProviderIcon provider={selectedAccount} size={27} /> : <UsersRound color={colors.subtext} size={15} />}
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: accountId ? colors.text : colors.subtext, fontSize: 11, fontWeight: '700' }}>{selectedAccount ? accountIdentity(selectedAccount).primary : accountId || '全部账号'}</Text>
        {accounts.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <ChevronDown color={colors.subtext} size={15} />}
      </Pressable>
      <View style={{ flex: wide ? undefined : 1, width: wide ? 220 : undefined, minHeight: 42, padding: 3, borderRadius: 12, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
        {resultOptions.map(([id, label]) => <Pressable key={id} onPress={() => setResult(id)} style={{ flex: 1, minWidth: 0, borderRadius: 9, backgroundColor: result === id ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: result === id ? id === 'failed' ? colors.danger : colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </View>
    </View>

    <View style={{ minHeight: 38, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
      <Text style={{ flexGrow: 1, minWidth: 58, color: colors.subtext, fontSize: 11, fontWeight: '700' }}>{data.total.toLocaleString()} 条</Text>
      {filtersActive ? <Pressable accessibilityLabel="清除筛选" onPress={resetFilters} style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={15} /></Pressable> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '600' }}>自动刷新</Text><AppSwitch accessibilityLabel="请求日志自动刷新" value={autoRefresh} onValueChange={setAutoRefresh} /></View>
      <Pressable accessibilityLabel="选择显示项" onPress={() => setPickerMode('columns')} style={({ pressed }) => ({ minWidth: 52, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? 0.65 : 1 })}><Columns3 color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{visibleColumns.size}</Text></Pressable>
      <Pressable accessibilityLabel="刷新请求日志" disabled={query.isFetching} onPress={() => query.refetch()} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: query.isFetching ? 0.5 : pressed ? 0.65 : 1 })}>{query.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={15} />}</Pressable>
    </View>

    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
  </View>;

  return <View style={{ flex: 1, minHeight: 0 }}>
    <FlatList
      data={data.items}
      extraData={visibleColumns}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      scrollToOverflowEnabled={false}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyExtractor={(item, index) => `${firstText(item, ['id', 'request_id', 'trace_id'], 'request')}-${index}`}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={false}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ gap: 7, paddingBottom: 10, flexGrow: data.items.length ? 0 : 1 }}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={!query.isFetching && !query.error ? <EmptyState embedded icon={Server} message={filtersActive ? '没有匹配的请求记录' : '暂无请求记录'} /> : query.isLoading ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} /> : null}
      ListFooterComponent={data.items.length ? <View style={{ minHeight: 46, paddingTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}><Pressable accessibilityLabel="上一页" disabled={page <= 1 || query.isFetching} onPress={() => setPage((value) => Math.max(1, value - 1))} style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: page <= 1 || query.isFetching ? 0.4 : 1 }}><ChevronLeft color={colors.text} size={16} /></Pressable><Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>第 {data.page} / {totalPages} 页</Text><Pressable accessibilityLabel="下一页" disabled={!hasNext || query.isFetching} onPress={() => setPage((value) => value + 1)} style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: !hasNext || query.isFetching ? 0.4 : 1 }}><ChevronRight color={colors.text} size={16} /></Pressable></View> : null}
      renderItem={({ item }) => <RequestCard item={item} visibleColumns={visibleColumns} />}
    />

    <Modal visible={Boolean(pickerMode)} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setPickerMode('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <Pressable accessibilityLabel="关闭筛选" onPress={() => setPickerMode('')} style={{ flex: 1 }} />
        <View style={{ maxHeight: '76%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.page, padding: 16, gap: 10 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{pickerMode === 'account' ? '筛选账号' : '显示项目'}</Text><Pressable accessibilityLabel="关闭" onPress={() => setPickerMode('')} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable></View>
          {pickerMode === 'account' ? <FlatList
            data={accountOptions}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            keyExtractor={(item, index) => item.id || `all-${index}`}
            style={{ flexGrow: 0 }}
            ListEmptyComponent={!accounts.isFetching ? <EmptyState embedded icon={UsersRound} message="暂无账号" /> : null}
            ListFooterComponent={accounts.isFetching ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 14 }} /> : null}
            renderItem={({ item, index }) => <Pressable onPress={() => { setAccountId(item.id); setPickerMode(''); }} style={({ pressed }) => ({ minHeight: 50, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.62 : 1 })}>{item.item ? <ProviderIcon provider={item.item} size={32} /> : <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><UsersRound color={colors.subtext} size={15} /></View>}<View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: accountId === item.id ? '800' : '600' }}>{item.label}</Text>{item.item ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{accountProvider(item.item).label}</Text> : null}</View>{accountId === item.id ? <Check color={colors.primary} size={16} /> : null}</Pressable>}
          /> : <FlatList
            data={logColumns}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            keyExtractor={([id]) => id}
            style={{ flexGrow: 0 }}
            renderItem={({ item: [id, label], index }) => { const selected = visibleColumns.has(id); return <Pressable onPress={() => toggleColumn(id)} style={({ pressed }) => ({ minHeight: 46, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.62 : 1 })}><View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>{selected ? <Check color="#fff" size={13} /> : null}</View><Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: selected ? '800' : '600' }}>{label}</Text></Pressable>; }}
            ListFooterComponent={<Pressable disabled={visibleColumns.size === logColumns.length} onPress={() => setVisibleColumns(new Set(logColumns.map(([id]) => id)))} style={{ minHeight: 44, borderTopWidth: 1, borderTopColor: colors.rowBorder, alignItems: 'center', justifyContent: 'center', opacity: visibleColumns.size === logColumns.length ? 0.4 : 1 }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>恢复全部</Text></Pressable>}
          />}
        </View>
      </FullScreenSafeArea>
    </Modal>
  </View>;
}
