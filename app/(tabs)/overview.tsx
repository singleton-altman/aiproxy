import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Activity,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Gauge,
  KeyRound,
  RefreshCw,
  Server,
  Timer,
  UsersRound,
  Waypoints,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { StructuredDataView } from '@/src/components/structured-form';
import { EmptyState, ErrorState, IconTile, Page, Panel, SectionHeader } from '@/src/components/ui';
import { apiJson, firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import { getKeyOverview, getModels, getUsageOverview, getUsageTrend } from '@/src/services/account';
import {
  getAdminRealtimeUsage,
  getAdminStatsOverview,
  getAdminStatsTrend,
  getAdminStatsUsers,
} from '@/src/services/admin';
import { isAdmin, sessionState } from '@/src/store/session';
import type { ApiRecord, ModelItem, UsageTrendItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

type DashboardRange = 'day' | 'week' | 'month';

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

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  iconBackground: string;
  basis: `${number}%`;
};

function MetricCard({ label, value, detail, icon: Icon, accent, iconBackground, basis }: MetricCardProps) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: basis, minWidth: 0, minHeight: 92, borderRadius: 16, borderWidth: 1, borderColor: iconBackground, backgroundColor: colors.card, padding: 10, justifyContent: 'space-between', gap: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <IconTile icon={Icon} size={27} iconSize={14} color={accent} background={iconBackground} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: colors.text, fontSize: 21, lineHeight: 25, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    {detail ? <Text numberOfLines={1} style={{ color: accent, fontSize: 9, lineHeight: 12, fontWeight: '600' }}>{detail}</Text> : null}
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
  const chartItems = items.slice(-(range === 'day' ? 24 : range === 'week' ? 7 : 30));
  const values = chartItems.map((item) => toNumber(item.request_count ?? item.count ?? item.requests));
  const maxValue = Math.max(1, ...values);
  const top = Math.max(4, Math.ceil(maxValue * 1.2));
  const plotLeft = 34;
  const plotRight = 586;
  const plotTop = 18;
  const plotBottom = 176;
  const plotHeight = plotBottom - plotTop;
  const slot = (plotRight - plotLeft) / Math.max(1, chartItems.length);
  const barWidth = Math.min(30, slot * 0.46);
  const labelStep = Math.max(1, Math.ceil(chartItems.length / 7));

  if (!chartItems.length) return <EmptyState embedded icon={BarChart3} message="暂无趋势数据" />;

  return <View style={{ height: 220, overflow: 'hidden' }}>
    <Svg width="100%" height="220" viewBox="0 0 600 220" preserveAspectRatio="none">
      {[0, 1, 2, 3, 4].map((index) => {
        const y = plotBottom - index * plotHeight / 4;
        const label = Math.round(top * index / 4);
        return <Fragment key={index}>
          <Line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke={colors.chartTrack} strokeWidth="1" strokeDasharray="3 4" />
          <SvgText x="21" y={y + 4} fill={colors.subtext} fontSize="9" textAnchor="end">{label}</SvgText>
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
          {showLabel ? <SvgText x={x + barWidth / 2} y="201" fill={colors.subtext} fontSize="9" textAnchor="middle">{label}</SvgText> : null}
        </Fragment>;
      })}
    </Svg>
  </View>;
}

function rankingName(item: ApiRecord, type: 'model' | 'user', index: number) {
  if (type === 'model') return String(item.model ?? item.id ?? item.name ?? `模型 ${index + 1}`);
  const candidates = [item.display_name, item.nickname, item.username, item.email, item.user_email, item.name, item.user];
  const value = candidates.find((candidate) => {
    if (typeof candidate !== 'string' && typeof candidate !== 'number') return false;
    const text = String(candidate).trim();
    return text && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
  });
  return value ? String(value) : `用户 ${index + 1}`;
}

function RankingPanel({ title, icon, items, type, wide }: { title: string; icon: LucideIcon; items: ApiRecord[]; type: 'model' | 'user'; wide: boolean }) {
  const colors = useAppTheme();
  const visible = items.slice(0, 5);
  const maxCost = Math.max(0, ...visible.map((item) => firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount'])));
  if (type === 'user') return <View style={{ flexGrow: 1, flexBasis: wide ? 0 : '100%', minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 10 }}>
    <SectionHeader icon={icon} title={title} />
    {visible.length ? <>
      <View style={{ minHeight: 28, paddingHorizontal: 8, borderRadius: 9, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ flex: 1, minWidth: 0, color: colors.subtext, fontSize: 9 }}>用户</Text>
        <Text style={{ width: 42, color: colors.subtext, fontSize: 9, textAlign: 'right' }}>次数</Text>
        <Text style={{ width: 54, color: colors.subtext, fontSize: 9, textAlign: 'right' }}>Token</Text>
        <Text style={{ width: 66, color: colors.subtext, fontSize: 9, textAlign: 'right' }}>费用</Text>
      </View>
      {visible.map((item, index) => {
        const requests = firstNumber(item, ['request_count', 'requests', 'count', 'total_requests']);
        const tokens = firstNumber(item, ['total_tokens', 'tokens', 'token_count']);
        const cost = firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount']);
        return <View key={`${rankingName(item, type, index)}-${index}`} style={{ minHeight: 36, paddingHorizontal: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 11, fontWeight: '700' }}>{rankingName(item, type, index)}</Text>
          <Text style={{ width: 42, color: colors.text, fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatNumber(requests)}</Text>
          <Text style={{ width: 54, color: colors.text, fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatNumber(tokens)}</Text>
          <Text style={{ width: 66, color: colors.text, fontSize: 10, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatCost(cost)}</Text>
        </View>;
      })}
    </> : <EmptyState embedded icon={icon} message="暂无用户数据" />}
  </View>;
  return <View style={{ flexGrow: 1, flexBasis: wide ? 0 : '100%', minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 12 }}>
    <SectionHeader icon={icon} title={title} />
    {visible.map((item, index) => {
      const cost = firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount']);
      const requests = firstNumber(item, ['request_count', 'requests', 'count', 'total_requests']);
      const width = `${Math.max(3, maxCost ? cost / maxCost * 100 : 3)}%` as `${number}%`;
      return <View key={`${rankingName(item, type, index)}-${index}`} style={{ gap: 6 }}>
        <View style={{ minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>{rankingName(item, type, index)}</Text>
          <Text style={{ color: colors.subtext, fontSize: 10 }}>{formatNumber(requests)} 次</Text>
          <Text style={{ minWidth: 62, color: colors.text, fontSize: 10, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatCost(cost)}</Text>
        </View>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.chartTrack, overflow: 'hidden' }}><View style={{ width, height: 3, borderRadius: 2, backgroundColor: colors.cyan }} /></View>
      </View>;
    })}
    {!visible.length ? <EmptyState embedded icon={icon} message="暂无排行数据" /> : null}
  </View>;
}

function breakdownName(item: ApiRecord, type: 'provider' | 'account', index: number) {
  const candidates = type === 'provider'
    ? [item.provider_name, item.provider, item.name, item.id]
    : [item.account_name, item.account, item.email, item.label, item.name];
  const value = candidates.find((candidate) => {
    if (typeof candidate !== 'string' && typeof candidate !== 'number') return false;
    const text = String(candidate).trim();
    return text && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
  });
  return value ? String(value) : `${type === 'provider' ? '供应商' : '账号'} ${index + 1}`;
}

function BreakdownTable({ title, icon, items, type }: { title: string; icon: LucideIcon; items: ApiRecord[]; type: 'provider' | 'account' }) {
  const colors = useAppTheme();
  const visible = items.slice(0, 8);
  const account = type === 'account';
  if (account) return <View style={{ width: '100%', minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 10 }}>
    <SectionHeader icon={icon} title={title} />
    {visible.length ? visible.map((item, index) => {
      const requests = firstNumber(item, ['request_count', 'requests', 'count', 'total_requests']);
      const tokens = firstNumber(item, ['total_tokens', 'tokens', 'token_count']);
      const failed = firstNumber(item, ['failed_count', 'failed_requests', 'errors', 'error_count']);
      const suppliedRate = item.success_rate ?? item.successRate;
      const successRate = suppliedRate === undefined ? (requests ? (requests - failed) / requests * 100 : 0) : (toNumber(suppliedRate) <= 1 ? toNumber(suppliedRate) * 100 : toNumber(suppliedRate));
      const cost = firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount']);
      return <View key={`${breakdownName(item, type, index)}-${index}`} style={{ minHeight: 66, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 12, fontWeight: '800' }}>{breakdownName(item, type, index)}</Text>
          <View style={{ maxWidth: '34%', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.mutedCard }}><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, fontWeight: '700' }}>{String(item.provider_name ?? item.provider ?? '--')}</Text></View>
          <Text style={{ minWidth: 62, color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatCost(cost)}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: colors.subtext, fontSize: 10 }}>请求 <Text style={{ color: colors.text, fontWeight: '700' }}>{formatNumber(requests)}</Text></Text>
          <Text style={{ color: colors.subtext, fontSize: 10 }}>Token <Text style={{ color: colors.text, fontWeight: '700' }}>{formatNumber(tokens)}</Text></Text>
          <Text style={{ color: colors.subtext, fontSize: 10 }}>失败 <Text style={{ color: failed ? colors.danger : colors.text, fontWeight: '700' }}>{formatNumber(failed)}</Text></Text>
          <Text style={{ color: colors.subtext, fontSize: 10 }}>成功率 <Text style={{ color: failed ? colors.danger : colors.success, fontWeight: '700' }}>{successRate.toFixed(1)}%</Text></Text>
        </View>
      </View>;
    }) : <EmptyState embedded icon={icon} message="暂无账号数据" />}
  </View>;
  return <View style={{ width: '100%', minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 10 }}>
    <SectionHeader icon={icon} title={title} />
    {visible.length ? <>
      <View style={{ minHeight: 28, paddingHorizontal: 7, borderRadius: 9, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ flex: 1, minWidth: 0, color: colors.subtext, fontSize: 9 }}>供应商</Text>
        <Text style={{ width: 42, color: colors.subtext, fontSize: 9, textAlign: 'right' }}>次数</Text>
        <Text style={{ width: 54, color: colors.subtext, fontSize: 9, textAlign: 'right' }}>Token</Text>
        <Text style={{ width: 66, color: colors.subtext, fontSize: 9, textAlign: 'right' }}>费用</Text>
      </View>
      {visible.map((item, index) => {
        const requests = firstNumber(item, ['request_count', 'requests', 'count', 'total_requests']);
        const tokens = firstNumber(item, ['total_tokens', 'tokens', 'token_count']);
        const cost = firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount']);
        return <View key={`${breakdownName(item, type, index)}-${index}`} style={{ minHeight: 36, paddingHorizontal: 7, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 11, fontWeight: '700' }}>{breakdownName(item, type, index)}</Text>
          <Text style={{ width: 42, color: colors.text, fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatNumber(requests)}</Text>
          <Text style={{ width: 54, color: colors.text, fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatNumber(tokens)}</Text>
          <Text style={{ width: 66, color: colors.text, fontSize: 10, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatCost(cost)}</Text>
        </View>;
      })}
    </> : <EmptyState embedded icon={icon} message={`暂无${type === 'provider' ? '供应商' : '账号'}数据`} />}
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
  const dashboardScope = admin ? 'admin' : 'user';
  const wide = width >= 720;
  const metricBasis: `${number}%` = wide ? '31%' : width >= 350 ? '47%' : '100%';
  const rangeLabel = dashboardRanges.find((item) => item.value === range)?.label ?? '今日';

  const overview = useQuery({
    queryKey: [dashboardScope, 'dashboard', 'overview', range],
    queryFn: ({ signal }) => admin ? getAdminStatsOverview({ range }, signal) : getUsageOverview({ range }, signal),
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 10_000 : false,
  });
  const trend = useQuery({
    queryKey: [dashboardScope, 'dashboard', 'trend', range],
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
  const models = useQuery({
    queryKey: ['user', 'dashboard', 'models', 'directory'],
    queryFn: ({ signal }) => getModels(signal),
    enabled: !admin,
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 60_000 : false,
  });
  const analysis = useQuery({
    queryKey: ['admin', 'dashboard', 'analysis', range],
    queryFn: ({ signal }) => getAdminStatsUsers({ range }, signal),
    enabled: admin,
    retry: 0,
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 30_000 : false,
  });
  const accountDirectory = useQuery({
    queryKey: ['admin', 'dashboard', 'account-directory'],
    queryFn: async ({ signal }) => firstArray<ApiRecord>(await apiJson('/admin/accounts', { signal, cache: 'no-store' }), ['accounts', 'items', 'data', 'list']),
    enabled: admin,
    retry: 0,
    ...dashboardQueryDefaults,
    refetchInterval: screenFocused ? 60_000 : false,
  });

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    void queryClient.invalidateQueries({ queryKey: [dashboardScope, 'dashboard'] });
    return () => setScreenFocused(false);
  }, [dashboardScope, queryClient]));

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const requests = [overview.refetch(), trend.refetch()];
    if (admin) requests.push(realtime.refetch(), analysis.refetch(), accountDirectory.refetch());
    else requests.push(models.refetch());
    void Promise.allSettled(requests).finally(() => setRefreshing(false));
  };

  const summary = unwrapRecord(overview.data);
  const live = unwrapRecord(realtime.data);
  const requests = firstNumber(summary, ['request_count', 'total_requests', 'requests']);
  const failed = firstNumber(summary, ['failed_count', 'failed_requests', 'error_count', 'errors']);
  const reportedActiveUsers = firstNumber(summary, ['active_users', 'active_user_count', 'user_count']);
  const totalTokens = firstNumber(summary, ['total_tokens', 'tokens']);
  const inputTokens = firstNumber(summary, ['prompt_tokens', 'input_tokens']);
  const outputTokens = firstNumber(summary, ['completion_tokens', 'output_tokens']);
  const cost = firstNumber(summary, ['actual_cost', 'actualCost', 'cost', 'cost_usd', 'total_cost']);
  const latency = firstNumber(summary, ['average_latency_ms', 'avg_latency_ms', 'avg_response_time_ms', 'average_response_time_ms', 'avg_duration_ms', 'latency_ms', 'average_latency']);
  const modelItems = useMemo(() => (admin
    ? nestedRecords(analysis.data, ['by_model', 'models', 'model_usage'])
    : models.data ?? []).map((item) => item as ModelItem & ApiRecord), [admin, analysis.data, models.data]);
  const userItems = useMemo(() => nestedRecords(analysis.data, ['users', 'by_user', 'user_usage']), [analysis.data]);
  const providerItems = useMemo(() => nestedRecords(analysis.data, ['by_provider', 'providers', 'provider_usage']), [analysis.data]);
  const accountItems = useMemo(() => {
    const directory = new Map<string, ApiRecord>();
    for (const account of accountDirectory.data ?? []) {
      for (const id of [account.id, account.account_id, account.auth_index]) {
        if (id !== undefined && id !== null && String(id).trim()) directory.set(String(id), account);
      }
    }
    return nestedRecords(analysis.data, ['by_account', 'accounts', 'account_usage']).map((item) => {
      const id = [item.account_id, item.auth_index, item.id].find((value) => value !== undefined && value !== null && String(value).trim());
      const account = id === undefined ? undefined : directory.get(String(id));
      if (!account) return item;
      const currentName = [item.account_name, item.account, item.email, item.label, item.name].find((value) => {
        if (typeof value !== 'string' && typeof value !== 'number') return false;
        const text = String(value).trim();
        return text && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
      });
      return {
        ...item,
        account_name: currentName ?? account.label ?? account.name ?? account.email,
        provider_name: item.provider_name ?? item.provider ?? account.provider,
      };
    });
  }, [accountDirectory.data, analysis.data]);
  const activeUsers = reportedActiveUsers || userItems.length;
  const dashboardError = overview.error ?? trend.error;
  const dashboardUnavailable = Boolean(overview.error && !overview.data);

  return <Page title="" showHeader={false} contentMaxWidth={960} refreshing={refreshing} onRefresh={refresh}>
    <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 24, lineHeight: 31, fontWeight: '800' }}>{admin ? '全站用量' : '用量概览'}</Text>
        <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{admin ? `${rangeLabel}全站流量、成本与服务质量。` : `${rangeLabel}调用与消费情况。`}</Text>
      </View>
      {admin ? <Pressable onPress={() => router.push('/admin-stats' as never)} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.64 : 1 })}><BarChart3 color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>完整统计</Text></Pressable> : null}
      <Pressable accessibilityLabel="刷新" disabled={refreshing} onPress={refresh} style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>{refreshing ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}</Pressable>
    </View>

    <View accessibilityRole="tablist" style={{ minHeight: 44, padding: 3, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
      {dashboardRanges.map((option) => {
        const selected = range === option.value;
        return <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          onPress={() => setRange(option.value)}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 36, borderRadius: 11, backgroundColor: selected ? colors.card : 'transparent', borderWidth: selected ? 1 : 0, borderColor: selected ? colors.border : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}
        >
          <Text style={{ color: selected ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '800' }}>{option.label}</Text>
        </Pressable>;
      })}
    </View>

    {dashboardError ? <ErrorState message={dashboardError.message} retry={refresh} /> : null}

    {!dashboardUnavailable ? <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <MetricCard label="请求数" value={formatNumber(requests)} icon={BarChart3} accent={colors.cyan} iconBackground={colors.cyanBg} basis={metricBasis} />
      <MetricCard label="成功率" value={formatRate(summary)} detail={`失败 ${formatNumber(failed)} 次`} icon={CheckCircle2} accent={colors.success} iconBackground={colors.successBg} basis={metricBasis} />
      <MetricCard label={admin ? '活跃用户' : '可用模型'} value={formatNumber(admin ? activeUsers : modelItems.filter((item) => !item.hidden).length)} detail={admin ? `${rangeLabel}内发起过调用` : undefined} icon={admin ? UsersRound : Boxes} accent={colors.primary} iconBackground={colors.primarySoft} basis={metricBasis} />
      <MetricCard label="Token 数" value={formatNumber(totalTokens)} detail={`输入 ${formatNumber(inputTokens)} · 输出 ${formatNumber(outputTokens)}`} icon={Coins} accent={colors.warning} iconBackground={colors.warningBg} basis={metricBasis} />
      <MetricCard label="费用 (USD)" value={formatCost(cost)} icon={CircleDollarSign} accent={colors.success} iconBackground={colors.successBg} basis={metricBasis} />
      <MetricCard label="平均延迟" value={`${formatNumber(latency)} ms`} icon={Timer} accent={colors.accentText} iconBackground={colors.accentBg} basis={metricBasis} />
    </View>

    {admin ? <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cyan }} /><Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600' }}>实时流量（近 15 分钟）</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <MetricCard label="请求数" value={formatNumber(firstNumber(live, ['request_count', 'total_requests', 'requests']))} icon={Activity} accent={colors.cyan} iconBackground={colors.cyanBg} basis={metricBasis} />
        <MetricCard label="Token 数" value={formatNumber(firstNumber(live, ['total_tokens', 'tokens']))} icon={Coins} accent={colors.warning} iconBackground={colors.warningBg} basis={metricBasis} />
        <MetricCard label="费用 (USD)" value={formatCost(firstNumber(live, ['cost', 'cost_usd', 'total_cost']))} icon={CircleDollarSign} accent={colors.success} iconBackground={colors.successBg} basis={metricBasis} />
      </View>
    </View> : null}

    <View style={{ gap: 8 }}>
      <SectionHeader icon={Gauge} title={`${rangeLabel}请求趋势`} />
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8, paddingTop: 8 }}><RequestTrendChart items={trend.data ?? []} range={range} /></View>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <RankingPanel title={admin ? 'Top 模型' : '可用模型'} icon={Boxes} items={modelItems} type="model" wide={admin && wide} />
      {admin ? <RankingPanel title="按用户" icon={UsersRound} items={userItems} type="user" wide={wide} /> : null}
    </View>
    {admin ? <>
      <BreakdownTable title="按供应商" icon={Server} items={providerItems} type="provider" />
      <BreakdownTable title="按账号" icon={Waypoints} items={accountItems} type="account" />
    </> : null}
    </> : null}
  </Page>;
}

export default function OverviewScreen() {
  useSnapshot(sessionState);
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  if (sessionState.mode === 'apikey') return <KeyOverview />;
  return <UsageDashboard admin={isAdmin() && scope !== 'user'} />;
}
