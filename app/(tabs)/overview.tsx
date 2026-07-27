import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  Timer,
  UsersRound,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { StructuredDataView } from '@/src/components/structured-form';
import { EmptyState, ErrorState, IconTile, Page, Panel, SectionHeader } from '@/src/components/ui';
import { firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import { getKeyOverview, getModels, getUsageOverview, getUsageTrend } from '@/src/services/account';
import {
  getAdminRealtimeUsage,
  getAdminStatsModels,
  getAdminStatsOverview,
  getAdminStatsTrend,
  getAdminStatsUsers,
} from '@/src/services/admin';
import { isAdmin, sessionState } from '@/src/store/session';
import type { ApiRecord, ModelItem, UsageTrendItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

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
  return <View style={{ flexGrow: 1, flexBasis: basis, minWidth: 0, minHeight: 108, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, justifyContent: 'space-between', gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 12 }}>{label}</Text>
      <IconTile icon={Icon} size={30} iconSize={15} color={accent} background={iconBackground} />
    </View>
    <View style={{ gap: 3 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      {detail ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{detail}</Text> : null}
    </View>
  </View>;
}

function dateLabel(item: UsageTrendItem, index: number) {
  const source = String(item.bucket_start ?? item.date ?? item.day ?? '');
  if (!source) return String(index + 1);
  const date = source.slice(0, 10);
  const parts = date.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date.slice(0, 5);
}

function RequestTrendChart({ items }: { items: UsageTrendItem[] }) {
  const colors = useAppTheme();
  const chartItems = items.slice(-7);
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
        return <Fragment key={`${dateLabel(item, index)}-${index}`}>
          <Rect x={x} y={plotBottom - height} width={barWidth} height={height} rx="2" fill={colors.cyan} />
          <SvgText x={x + barWidth / 2} y="201" fill={colors.subtext} fontSize="9" textAnchor="middle">{dateLabel(item, index)}</SvgText>
        </Fragment>;
      })}
    </Svg>
  </View>;
}

function rankingName(item: ApiRecord, type: 'model' | 'user', index: number) {
  const value = type === 'model'
    ? item.model ?? item.id ?? item.name
    : item.email ?? item.user_email ?? item.user ?? item.name ?? item.user_id;
  return String(value ?? `${type === 'model' ? '模型' : '用户'} ${index + 1}`);
}

function RankingPanel({ title, icon, items, type, wide }: { title: string; icon: LucideIcon; items: ApiRecord[]; type: 'model' | 'user'; wide: boolean }) {
  const colors = useAppTheme();
  const visible = items.slice(0, 5);
  const maxCost = Math.max(0, ...visible.map((item) => firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount'])));
  return <View style={{ flexGrow: 1, flexBasis: wide ? 0 : '100%', minWidth: 0, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 12 }}>
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
    <Pressable onPress={() => router.push('/chat' as never)} style={{ minHeight: 46, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>打开聊天测试</Text></Pressable>
  </Page>;
}

function UsageDashboard({ admin }: { admin: boolean }) {
  const colors = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const wide = width >= 720;
  const metricBasis: `${number}%` = wide ? '31%' : width >= 390 ? '47%' : '100%';

  const overview = useQuery({
    queryKey: [admin ? 'admin' : 'user', 'dashboard', 'overview'],
    queryFn: ({ signal }) => admin ? getAdminStatsOverview({ range: 'day' }, signal) : getUsageOverview({ range: 'day' }, signal),
  });
  const trend = useQuery({
    queryKey: [admin ? 'admin' : 'user', 'dashboard', 'trend'],
    queryFn: ({ signal }) => admin ? getAdminStatsTrend({ range: 'week' }, signal) : getUsageTrend({ range: 'week' }, signal),
  });
  const realtime = useQuery({
    queryKey: ['admin', 'dashboard', 'realtime'],
    queryFn: ({ signal }) => getAdminRealtimeUsage(signal),
    enabled: admin,
    retry: 0,
  });
  const models = useQuery({
    queryKey: [admin ? 'admin' : 'user', 'dashboard', 'models'],
    queryFn: ({ signal }) => admin ? getAdminStatsModels(signal) : getModels(signal),
  });
  const users = useQuery({
    queryKey: ['admin', 'dashboard', 'users'],
    queryFn: ({ signal }) => getAdminStatsUsers({ range: 'day' }, signal),
    enabled: admin,
    retry: 0,
  });

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const requests = [overview.refetch(), trend.refetch(), models.refetch()];
    if (admin) requests.push(realtime.refetch(), users.refetch());
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
  const cost = firstNumber(summary, ['cost', 'cost_usd', 'total_cost']);
  const latency = firstNumber(summary, ['average_latency_ms', 'avg_latency_ms', 'latency_ms', 'average_latency']);
  const modelItems = (models.data ?? []).map((item) => item as ModelItem & ApiRecord);
  const userItems = useMemo(() => firstArray<ApiRecord>(users.data, ['users', 'items', 'data', 'list', 'rows']), [users.data]);
  const activeUsers = reportedActiveUsers || userItems.length;

  return <Page title="" showHeader={false} contentMaxWidth={960} refreshing={refreshing} onRefresh={refresh}>
    <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 24, lineHeight: 31, fontWeight: '800' }}>{admin ? '管理概览' : '用量概览'}</Text>
        <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{admin ? '全站近 24 小时的流量、成本与服务质量。' : '近 24 小时的调用与消费情况。'}</Text>
      </View>
      {admin ? <Pressable onPress={() => router.push('/admin-stats' as never)} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.64 : 1 })}><BarChart3 color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>完整统计</Text></Pressable> : null}
      <Pressable accessibilityLabel="刷新" disabled={refreshing} onPress={refresh} style={{ width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>{refreshing ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}</Pressable>
    </View>

    {overview.error ? <ErrorState message={overview.error.message} retry={() => overview.refetch()} /> : null}

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <MetricCard label="请求数" value={formatNumber(requests)} icon={BarChart3} accent={colors.cyan} iconBackground={colors.cyanBg} basis={metricBasis} />
      <MetricCard label="成功率" value={formatRate(summary)} detail={`失败 ${formatNumber(failed)} 次`} icon={CheckCircle2} accent={colors.success} iconBackground={colors.successBg} basis={metricBasis} />
      <MetricCard label={admin ? '活跃用户' : '可用模型'} value={formatNumber(admin ? activeUsers : modelItems.filter((item) => !item.hidden).length)} detail={admin ? '24 小时内发起过调用' : undefined} icon={admin ? UsersRound : Boxes} accent={colors.primary} iconBackground={colors.primarySoft} basis={metricBasis} />
      <MetricCard label="Token 数" value={formatNumber(totalTokens)} detail={`输入 ${formatNumber(inputTokens)} · 输出 ${formatNumber(outputTokens)}`} icon={Coins} accent={colors.warning} iconBackground={colors.warningBg} basis={metricBasis} />
      <MetricCard label="费用 (USD)" value={formatCost(cost)} icon={CircleDollarSign} accent={colors.success} iconBackground={colors.successBg} basis={metricBasis} />
      <MetricCard label="平均延迟" value={`${formatNumber(latency)} ms`} icon={Timer} accent={colors.accentText} iconBackground={colors.accentBg} basis={metricBasis} />
    </View>

    {admin ? <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cyan }} /><Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600' }}>实时流量（近 15 分钟）</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <MetricCard label="请求数" value={formatNumber(firstNumber(live, ['request_count', 'total_requests', 'requests']))} icon={Activity} accent={colors.cyan} iconBackground={colors.cyanBg} basis={metricBasis} />
        <MetricCard label="Token 数" value={formatNumber(firstNumber(live, ['total_tokens', 'tokens']))} icon={Coins} accent={colors.warning} iconBackground={colors.warningBg} basis={metricBasis} />
        <MetricCard label="费用 (USD)" value={formatCost(firstNumber(live, ['cost', 'cost_usd', 'total_cost']))} icon={CircleDollarSign} accent={colors.success} iconBackground={colors.successBg} basis={metricBasis} />
      </View>
    </View> : null}

    <View style={{ gap: 8 }}>
      <SectionHeader icon={Gauge} title="近 7 天请求趋势" />
      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8, paddingTop: 8 }}><RequestTrendChart items={trend.data ?? []} /></View>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <RankingPanel title={admin ? 'Top 模型（按费用）' : '可用模型'} icon={Boxes} items={modelItems} type="model" wide={admin && wide} />
      {admin ? <RankingPanel title="Top 用户（按费用）" icon={UsersRound} items={userItems} type="user" wide={wide} /> : null}
    </View>
  </Page>;
}

export default function OverviewScreen() {
  useSnapshot(sessionState);
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  if (sessionState.mode === 'apikey') return <KeyOverview />;
  return <UsageDashboard admin={isAdmin() && scope !== 'user'} />;
}
