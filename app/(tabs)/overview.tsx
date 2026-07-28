import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Gauge,
  KeyRound,
  Layers3,
  RefreshCw,
  Timer,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import { StructuredDataView } from '@/src/components/structured-form';
import { EmptyState, ErrorState, IconTile, Page, Panel, SectionHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { getKeyOverview, getModels, getUsageAnalysis, getUsageOverview, getUsageTrend } from '@/src/services/account';
import {
  getAdminRealtimeUsage,
  getAdminStatsOverview,
  getAdminStatsTrend,
  getAdminStatsUsers,
} from '@/src/services/admin';
import { isAdmin, sessionState } from '@/src/store/session';
import type { ApiRecord, UsageTrendItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

type DashboardRange = 'day' | 'week' | 'month';
type DistributionMetric = 'tokens' | 'cost';

type DistributionRow = {
  key: string;
  name: string;
  requests: number;
  tokens: number;
  cost: number;
};

const dashboardRanges: Array<{ value: DashboardRange; label: string }> = [
  { value: 'day', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
];

const dashboardQueryDefaults = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
};

function toNumber(value: unknown) {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' ? Number(value.replace(/[$,%\s]/g, '')) : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstNumber(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return toNumber(record[key]);
  }
  return 0;
}

function unwrapRecord(value: unknown): ApiRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as ApiRecord;
  for (const key of ['data', 'overview', 'usage', 'realtime']) {
    if (record[key] && typeof record[key] === 'object' && !Array.isArray(record[key])) return record[key] as ApiRecord;
  }
  return record;
}

function nestedRecords(value: unknown, keys: string[]): ApiRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as ApiRecord;
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      const items = (record[key] as unknown[]).filter((item): item is ApiRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
      if (items.length) return items;
    }
  }
  for (const item of Object.values(record)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const nested = nestedRecords(item, keys);
    if (nested.length) return nested;
  }
  return [];
}

function formatNumber(value: unknown) {
  const number = toNumber(value);
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return Math.round(number).toLocaleString();
}

function formatCost(value: unknown) {
  const number = toNumber(value);
  return `$${number.toFixed(number >= 100 ? 2 : 4)}`;
}

function formatRate(overview: ApiRecord) {
  const requestCount = firstNumber(overview, ['request_count', 'total_requests', 'requests']);
  const failedCount = firstNumber(overview, ['failed_count', 'failed_requests', 'error_count', 'errors']);
  const supplied = overview.success_rate ?? overview.successRate;
  const raw = supplied === undefined ? (requestCount ? (requestCount - failedCount) / requestCount : 0) : toNumber(supplied);
  const percentage = raw <= 1 ? raw * 100 : raw;
  return `${Math.max(0, Math.min(100, percentage)).toFixed(1)}%`;
}

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dashboardDateRange(range: DashboardRange) {
  const end = new Date();
  const start = new Date(end);
  if (range === 'week') {
    const dayFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayFromMonday);
  } else if (range === 'month') {
    start.setDate(1);
  }
  const from = localDate(start);
  const to = localDate(end);
  return from === to ? from : `${from} 至 ${to}`;
}

function isInternalId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    || /^[0-9a-f]{24,}$/i.test(value)
    || /^\d{8,}$/.test(value);
}

function firstReadableText(item: ApiRecord, keys: string[], rejectInternalId = false) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const text = String(value).trim();
    if (text && (!rejectInternalId || !isInternalId(text))) return text;
  }
  return '';
}

function buildDistributionRows(source: unknown, admin: boolean) {
  let dimension: 'user' | 'provider' | 'model' = admin ? 'user' : 'model';
  let items = admin
    ? nestedRecords(source, ['users', 'by_user', 'user_usage'])
    : nestedRecords(source, ['by_model', 'models', 'model_usage']);

  if (admin && !items.length) {
    dimension = 'provider';
    items = nestedRecords(source, ['by_provider', 'providers', 'provider_usage']);
  }

  return items.map((item, index): DistributionRow => {
    const name = dimension === 'user'
      ? firstReadableText(item, ['display_name', 'nickname', 'username', 'email', 'user_email', 'name', 'user'], true)
      : dimension === 'provider'
        ? firstReadableText(item, ['provider_name', 'provider', 'name', 'slug'], true)
        : firstReadableText(item, ['model_name', 'model', 'id', 'name']);
    return {
      key: `${dimension}-${String(item.user_id ?? item.provider_id ?? item.model ?? item.id ?? index)}`,
      name: name || `${dimension === 'user' ? '用户' : dimension === 'provider' ? '供应商' : '模型'} ${index + 1}`,
      requests: firstNumber(item, ['request_count', 'requests', 'count', 'total_requests']),
      tokens: firstNumber(item, ['total_tokens', 'tokens', 'token_count']),
      cost: firstNumber(item, ['actual_cost', 'actualCost', 'cost', 'cost_usd', 'total_cost', 'amount']),
    };
  }).filter((item) => item.requests || item.tokens || item.cost);
}

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  iconBackground: string;
};

function MetricCard({ label, value, detail, icon: Icon, accent, iconBackground }: MetricCardProps) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: '47%', minWidth: 0, minHeight: 108, borderRadius: 8, borderWidth: 1, borderColor: accent, backgroundColor: colors.card, padding: 11, justifyContent: 'space-between', gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <IconTile icon={Icon} size={30} iconSize={15} color={accent} background={iconBackground} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>{label}</Text>
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.66} style={{ color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    {detail ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={{ color: accent, fontSize: 11, lineHeight: 15, fontWeight: '700' }}>{detail}</Text> : null}
  </View>;
}

function dateLabel(item: UsageTrendItem, index: number, range: DashboardRange) {
  const source = String(item.bucket_start ?? item.date ?? item.day ?? item.hour ?? item.time ?? '');
  if (!source) return String(index + 1);
  if (range === 'day') {
    const time = source.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
    if (time) return `${time[1].padStart(2, '0')}:${time[2]}`;
    const hour = source.match(/^(\d{1,2})(?::\d{2})?$/);
    if (hour) return `${hour[1].padStart(2, '0')}:00`;
  }
  const date = source.slice(0, 10);
  const parts = date.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date.slice(0, 5);
}

function RequestTrendChart({ items, range }: { items: UsageTrendItem[]; range: DashboardRange }) {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(900, Math.max(280, width - 64));
  const chartItems = items.slice(-(range === 'day' ? 24 : range === 'week' ? 7 : 30));
  const values = chartItems.map((item) => toNumber(item.request_count ?? item.count ?? item.requests));
  const maxValue = Math.max(1, ...values);
  const top = Math.max(4, Math.ceil(maxValue * 1.2));
  const plotLeft = 38;
  const plotRight = chartWidth - 12;
  const plotTop = 16;
  const plotBottom = 164;
  const plotHeight = plotBottom - plotTop;
  const slot = (plotRight - plotLeft) / Math.max(1, chartItems.length);
  const barWidth = Math.min(28, Math.max(3, slot * 0.5));
  const labelStep = Math.max(1, Math.ceil(chartItems.length / 6));

  if (!chartItems.length) return <EmptyState embedded icon={BarChart3} message="暂无趋势数据" />;

  return <View style={{ height: 198, overflow: 'hidden' }}>
    <Svg width="100%" height="198" viewBox={`0 0 ${chartWidth} 198`} preserveAspectRatio="none">
      {[0, 1, 2, 3, 4].map((index) => {
        const y = plotBottom - index * plotHeight / 4;
        const label = Math.round(top * index / 4);
        return <Fragment key={index}>
          <Line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke={colors.chartTrack} strokeWidth="1" strokeDasharray="3 4" />
          <SvgText x="29" y={y + 4} fill={colors.subtext} fontSize="10" textAnchor="end">{label}</SvgText>
        </Fragment>;
      })}
      {chartItems.map((item, index) => {
        const value = values[index] ?? 0;
        const height = Math.max(value ? 3 : 0, value / top * plotHeight);
        const x = plotLeft + slot * index + (slot - barWidth) / 2;
        const label = dateLabel(item, index, range);
        const showLabel = index % labelStep === 0 || index === chartItems.length - 1;
        return <Fragment key={`${label}-${index}`}>
          <Rect x={x} y={plotBottom - height} width={barWidth} height={height} rx="2" fill={colors.cyan} />
          {showLabel ? <SvgText x={x + barWidth / 2} y="187" fill={colors.subtext} fontSize="10" textAnchor="middle">{label}</SvgText> : null}
        </Fragment>;
      })}
    </Svg>
  </View>;
}

function visibleDistributionRows(rows: DistributionRow[], metric: DistributionMetric) {
  const ranked = [...rows].sort((left, right) => {
    const metricDiff = metric === 'tokens' ? right.tokens - left.tokens : right.cost - left.cost;
    return metricDiff || right.requests - left.requests;
  });
  if (ranked.length <= 6) return ranked;
  const visible = ranked.slice(0, 5);
  const other = ranked.slice(5).reduce<DistributionRow>((total, item) => ({
    ...total,
    requests: total.requests + item.requests,
    tokens: total.tokens + item.tokens,
    cost: total.cost + item.cost,
  }), { key: 'other', name: '其他', requests: 0, tokens: 0, cost: 0 });
  return [...visible, other];
}

function DistributionPanel({ rows, metric, onMetricChange, wide }: { rows: DistributionRow[]; metric: DistributionMetric; onMetricChange: (value: DistributionMetric) => void; wide: boolean }) {
  const colors = useAppTheme();
  const visible = useMemo(() => visibleDistributionRows(rows, metric), [metric, rows]);
  const values = visible.map((item) => metric === 'tokens' ? item.tokens : item.cost);
  const total = values.reduce((sum, value) => sum + value, 0);
  const circumference = 2 * Math.PI * 44;
  const segmentColors = [colors.primary, colors.success, colors.warning, colors.cyan, colors.accentText, colors.danger];
  let progress = 0;

  return <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 12 }}>
    <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}><SectionHeader icon={Layers3} title="分组使用分布" /></View>
      <View accessibilityRole="tablist" style={{ padding: 3, borderRadius: 8, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 2 }}>
        {([['tokens', 'Token'], ['cost', '实际费用']] as const).map(([value, label]) => {
          const selected = metric === value;
          return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onMetricChange(value)} style={({ pressed }) => ({ minHeight: 30, paddingHorizontal: 9, borderRadius: 6, backgroundColor: selected ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
            <Text style={{ color: selected ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '800' }}>{label}</Text>
          </Pressable>;
        })}
      </View>
    </View>

    {visible.length ? <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 14 }}>
      <View style={{ width: wide ? 178 : '100%', height: 154, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width="150" height="150" viewBox="0 0 150 150">
          <Circle cx="75" cy="75" r="44" fill="none" stroke={colors.chartTrack} strokeWidth="14" />
          {visible.map((item, index) => {
            const ratio = total ? values[index] / total : 0;
            const offset = progress;
            progress += ratio;
            return <Circle key={item.key} cx="75" cy="75" r="44" fill="none" stroke={segmentColors[index]} strokeWidth="14" strokeDasharray={`${ratio * circumference} ${circumference}`} strokeDashoffset={-offset * circumference} rotation="-90" origin="75,75" />;
          })}
          <SvgText x="75" y="69" fill={colors.subtext} fontSize="10" textAnchor="middle">{metric === 'tokens' ? 'Token' : '实际费用'}</SvgText>
          <SvgText x="75" y="88" fill={colors.text} fontSize="14" fontWeight="800" textAnchor="middle">{metric === 'tokens' ? formatNumber(total) : formatCost(total)}</SvgText>
        </Svg>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ minHeight: 34, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flex: 1, minWidth: 0, color: colors.subtext, fontSize: 11, fontWeight: '700' }}>分组</Text>
          <Text style={{ width: 44, color: colors.subtext, fontSize: 11, fontWeight: '700', textAlign: 'right' }}>请求</Text>
          <Text style={{ width: 58, color: colors.subtext, fontSize: 11, fontWeight: '700', textAlign: 'right' }}>Token</Text>
          <Text style={{ width: 70, color: colors.subtext, fontSize: 11, fontWeight: '700', textAlign: 'right' }}>费用</Text>
        </View>
        {visible.map((item, index) => <View key={`${item.key}-row`} style={{ minHeight: 42, paddingHorizontal: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: segmentColors[index] }} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>{item.name}</Text></View>
          <Text style={{ width: 44, color: colors.text, fontSize: 11, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatNumber(item.requests)}</Text>
          <Text style={{ width: 58, color: colors.text, fontSize: 11, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatNumber(item.tokens)}</Text>
          <Text style={{ width: 70, color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatCost(item.cost)}</Text>
        </View>)}
      </View>
    </View> : <EmptyState embedded icon={Layers3} message="暂无分组用量数据" />}
  </View>;
}

function KeyOverview() {
  const colors = useAppTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({ queryKey: ['key-overview'], queryFn: ({ signal }) => getKeyOverview(signal) });
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void query.refetch().finally(() => setRefreshing(false));
  };
  return <Page title="Key 总览" subtitle={sessionState.baseUrl} icon={KeyRound} refreshing={refreshing || query.isFetching} onRefresh={refresh}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {query.data ? <Panel><StructuredDataView value={query.data} /></Panel> : !query.isFetching && !query.error ? <EmptyState message="暂无 Key 总览数据" /> : null}
    <Pressable onPress={() => router.push('/chat' as never)} style={{ minHeight: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>打开聊天测试</Text></Pressable>
  </Page>;
}

function UsageDashboard({ admin }: { admin: boolean }) {
  const colors = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [range, setRange] = useState<DashboardRange>('day');
  const [distributionMetric, setDistributionMetric] = useState<DistributionMetric>('tokens');
  const wide = width >= 700;
  const rangeLabel = dashboardRanges.find((item) => item.value === range)?.label ?? '今日';

  const overview = useQuery({
    queryKey: [admin ? 'admin' : 'user', 'dashboard', 'overview', range],
    queryFn: ({ signal }) => admin ? getAdminStatsOverview({ range }, signal) : getUsageOverview({ range }, signal),
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 10_000 : false,
  });
  const trend = useQuery({
    queryKey: [admin ? 'admin' : 'user', 'dashboard', 'trend', range],
    queryFn: ({ signal }) => admin ? getAdminStatsTrend({ range }, signal) : getUsageTrend({ range }, signal),
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 30_000 : false,
  });
  const realtime = useQuery({
    queryKey: ['admin', 'dashboard', 'realtime'],
    queryFn: ({ signal }) => getAdminRealtimeUsage(signal),
    enabled: admin,
    retry: 0,
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 5_000 : false,
  });
  const breakdown = useQuery({
    queryKey: [admin ? 'admin' : 'user', 'dashboard', 'distribution', range],
    queryFn: ({ signal }) => admin ? getAdminStatsUsers({ range }, signal) : getUsageAnalysis({ range }, signal),
    retry: 0,
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 30_000 : false,
  });
  const models = useQuery({
    queryKey: ['user', 'dashboard', 'model-directory'],
    queryFn: ({ signal }) => getModels(signal),
    enabled: !admin,
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 60_000 : false,
  });

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void queryClient.invalidateQueries({ queryKey: [admin ? 'admin' : 'user', 'dashboard'] });
    return () => setScreenFocused(false);
  }, [admin, queryClient]));

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const refreshes = [overview.refetch(), trend.refetch(), breakdown.refetch()];
    if (admin) refreshes.push(realtime.refetch());
    else refreshes.push(models.refetch());
    void Promise.allSettled(refreshes).finally(() => setRefreshing(false));
  };

  const summary = unwrapRecord(overview.data);
  const live = unwrapRecord(realtime.data);
  const requests = firstNumber(summary, ['request_count', 'total_requests', 'requests']);
  const failed = firstNumber(summary, ['failed_count', 'failed_requests', 'error_count', 'errors']);
  const totalTokens = firstNumber(summary, ['total_tokens', 'tokens']);
  const inputTokens = firstNumber(summary, ['prompt_tokens', 'input_tokens']);
  const outputTokens = firstNumber(summary, ['completion_tokens', 'output_tokens']);
  const cost = firstNumber(summary, ['actual_cost', 'actualCost', 'cost', 'cost_usd', 'total_cost']);
  const liveRequests = firstNumber(live, ['request_count', 'total_requests', 'requests']);
  const liveTokens = firstNumber(live, ['total_tokens', 'tokens']);
  const rpm = firstNumber(live, ['rpm', 'requests_per_minute', 'request_per_minute', 'request_rate'])
    || firstNumber(summary, ['rpm', 'requests_per_minute', 'request_per_minute', 'request_rate'])
    || (admin ? Math.round(liveRequests / 15) : 0);
  const tpm = firstNumber(live, ['tpm', 'tokens_per_minute', 'token_per_minute', 'token_rate'])
    || firstNumber(summary, ['tpm', 'tokens_per_minute', 'token_per_minute', 'token_rate'])
    || (admin ? Math.round(liveTokens / 15) : 0);
  const latencyKeys = ['average_latency_ms', 'avg_latency_ms', 'avg_response_time_ms', 'average_response_time_ms', 'avg_duration_ms', 'latency_ms', 'average_latency'];
  const latency = firstNumber(live, latencyKeys) || firstNumber(summary, latencyKeys);
  const distributionRows = useMemo(() => buildDistributionRows(breakdown.data, admin), [admin, breakdown.data]);
  const adminUserRows = useMemo(() => admin ? nestedRecords(breakdown.data, ['users', 'by_user', 'user_usage']) : [], [admin, breakdown.data]);
  const reportedActiveUsers = firstNumber(summary, ['active_users', 'active_user_count', 'user_count']);
  const activeUsers = reportedActiveUsers || adminUserRows.filter((item) => firstNumber(item, ['request_count', 'requests', 'count', 'total_requests']) > 0).length;
  const availableModels = (models.data ?? []).filter((item) => !item.hidden).length;

  return <Page title="" showHeader={false} contentMaxWidth={960} refreshing={refreshing} onRefresh={refresh}>
    <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' }}>{admin ? '全站用量' : '用量概览'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><CalendarDays color={colors.subtext} size={13} /><Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 11, lineHeight: 16 }}>{dashboardDateRange(range)}</Text></View>
      </View>
      {admin ? <Pressable onPress={() => router.push('/admin-stats' as never)} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.64 : 1 })}><BarChart3 color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>完整统计</Text></Pressable> : null}
      <Pressable accessibilityLabel="刷新" disabled={refreshing} onPress={refresh} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.64 : 1 })}>{refreshing ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}</Pressable>
    </View>

    <View accessibilityRole="tablist" style={{ minHeight: 42, padding: 3, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
      {dashboardRanges.map((option) => {
        const selected = range === option.value;
        return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setRange(option.value)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 34, borderRadius: 6, backgroundColor: selected ? colors.card : 'transparent', borderWidth: selected ? 1 : 0, borderColor: selected ? colors.border : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
          <Text style={{ color: selected ? colors.primary : colors.subtext, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
        </Pressable>;
      })}
    </View>

    {overview.error ? <ErrorState message={overview.error.message} retry={() => overview.refetch()} /> : null}

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <MetricCard label={`${rangeLabel} Token`} value={formatNumber(totalTokens)} detail={`输入 ${formatNumber(inputTokens)}  输出 ${formatNumber(outputTokens)}`} icon={Coins} accent={colors.warning} iconBackground={colors.warningBg} />
      <MetricCard label={`${rangeLabel}费用`} value={formatCost(cost)} detail="实际费用 (USD)" icon={CircleDollarSign} accent={colors.success} iconBackground={colors.successBg} />
      <MetricCard label={`${rangeLabel}请求`} value={formatNumber(requests)} detail={admin ? `近 15 分钟 ${formatNumber(liveRequests)}` : `${rangeLabel}调用总数`} icon={BarChart3} accent={colors.cyan} iconBackground={colors.cyanBg} />
      <MetricCard label="成功率" value={formatRate(summary)} detail={`失败 ${formatNumber(failed)} 次`} icon={CheckCircle2} accent={colors.success} iconBackground={colors.successBg} />
      <MetricCard label="实时性能" value={`RPM ${formatNumber(rpm)}`} detail={`TPM ${formatNumber(tpm)}`} icon={Gauge} accent={colors.primary} iconBackground={colors.primarySoft} />
      <MetricCard label="平均响应" value={`${formatNumber(latency)} ms`} detail={admin ? `活跃用户 ${formatNumber(activeUsers)}` : `可用模型 ${formatNumber(availableModels)}`} icon={Timer} accent={colors.accentText} iconBackground={colors.accentBg} />
    </View>

    {breakdown.error ? <ErrorState message={breakdown.error.message} retry={() => breakdown.refetch()} /> : <DistributionPanel rows={distributionRows} metric={distributionMetric} onMetricChange={setDistributionMetric} wide={wide} />}

    <View style={{ gap: 8 }}>
      <SectionHeader icon={Activity} title={`${rangeLabel}请求趋势`} />
      {trend.error ? <ErrorState message={trend.error.message} retry={() => trend.refetch()} /> : <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8, paddingTop: 8 }}><RequestTrendChart items={trend.data ?? []} range={range} /></View>}
    </View>
  </Page>;
}

export default function OverviewScreen() {
  useSnapshot(sessionState);
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  if (sessionState.mode === 'apikey') return <KeyOverview />;
  return <UsageDashboard admin={isAdmin() && scope !== 'user'} />;
}
