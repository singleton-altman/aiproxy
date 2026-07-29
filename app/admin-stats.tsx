import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Cpu,
  Gauge,
  KeyRound,
  Layers3,
  ListFilter,
  Radio,
  ScrollText,
  Server,
  Timer,
  UsersRound,
  Waypoints,
  Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import { EmptyState, ErrorState, IconTile, Page, SearchField, SectionHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import {
  getAdminLogsRequests,
  getAdminRealtimeUsage,
  getAdminStatsAnalysis,
  getAdminStatsModels,
  getAdminStatsOverview,
  getAdminStatsTrend,
  getAdminStatsUsers,
  getAdminUsageEvents,
} from '@/src/services/admin';
import type { ApiRecord, UsageTrendItem } from '@/src/types/api';

const tabs = [
  ['summary', '全站', Activity],
  ['overview', '概览', BarChart3],
  ['trend', '趋势', Gauge],
  ['analysis', '分析', Zap],
  ['models', '模型', Boxes],
  ['users', '用户', UsersRound],
  ['realtime', '实时', Radio],
  ['events', '事件', ListFilter],
  ['logs', '请求日志', ScrollText],
] as const;

type Tab = typeof tabs[number][0];
type Range = '24h' | '7d' | '30d';
type TrendMetric = 'requests' | 'tokens' | 'cost';
type Dimension = 'model' | 'provider' | 'user' | 'account' | 'apiKey' | 'endpoint';

type DashboardBundle = {
  overview: unknown;
  trend?: unknown;
  analysis?: unknown;
  models?: unknown;
  users?: unknown;
  events?: unknown;
};

const rangeOptions: Array<[Range, string]> = [['24h', '近 24 小时'], ['7d', '最近 7 天'], ['30d', '最近 30 天']];
const segmentColors = ['#0ea5e9', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6'];

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unwrapRecord(value: unknown): ApiRecord {
  if (!isRecord(value)) return {};
  for (const key of ['data', 'overview', 'usage', 'realtime', 'stats']) {
    if (isRecord(value[key])) return value[key] as ApiRecord;
  }
  return value;
}

function records(value: unknown, keys: string[] = ['items', 'rows', 'list', 'data']): ApiRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return (value[key] as unknown[]).filter(isRecord);
  }
  if (isRecord(value.data)) return records(value.data, keys);
  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) && nested.some(isRecord)) return nested.filter(isRecord);
  }
  return [];
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value.replace(/[$,%\s]/g, '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNumber(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return toNumber(record[key]);
  }
  return 0;
}

function optionalNumber(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[$,%\s]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstText(record: ApiRecord, keys: string[], fallback = '--') {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return fallback;
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

function successRate(record: ApiRecord) {
  const requests = firstNumber(record, ['request_count', 'total_requests', 'requests', 'count']);
  const failed = firstNumber(record, ['failed_count', 'failed_requests', 'error_count', 'errors']);
  const supplied = record.success_rate ?? record.successRate;
  const raw = supplied === undefined ? (requests ? (requests - failed) / requests : 0) : toNumber(supplied);
  const percentage = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, percentage));
}

function dimensionLabel(item: ApiRecord, dimension: Dimension, index: number) {
  if (dimension === 'user') {
    const candidates = [item.display_name, item.nickname, item.username, item.email, item.user_email, item.name, item.user];
    const value = candidates.find((candidate) => {
      if (typeof candidate !== 'string' && typeof candidate !== 'number') return false;
      const text = String(candidate).trim();
      return text && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
    });
    return value ? String(value) : `用户 ${index + 1}`;
  }
  if (dimension === 'apiKey') {
    const named = [item.api_key_name, item.key_name, item.name, item.label].find((candidate) => {
      if (typeof candidate !== 'string' && typeof candidate !== 'number') return false;
      const text = String(candidate).trim();
      return text
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
        && !/^(?:sk|aps|key)[-_][a-z0-9_-]{12,}$/i.test(text);
    });
    if (named !== undefined) return String(named);
    const rawPrefix = [item.prefix, item.key_prefix, item.preview].find((candidate) => (typeof candidate === 'string' || typeof candidate === 'number') && String(candidate).trim());
    if (rawPrefix !== undefined) {
      const prefix = String(rawPrefix).trim();
      if (prefix.includes('*') || prefix.includes('...')) return prefix.length > 22 ? `${prefix.slice(0, 19)}...` : prefix;
      return `${prefix.slice(0, 10)}...`;
    }
    return `API Key ${index + 1}`;
  }
  const keys: Record<Dimension, string[]> = {
    model: ['model', 'model_id', 'id', 'name'],
    provider: ['provider', 'provider_name', 'channel'],
    user: [],
    account: ['label', 'account_name', 'account_label', 'email', 'account_email', 'name', 'account', 'account_id'],
    apiKey: [],
    endpoint: ['endpoint', 'path', 'route', 'api'],
  };
  return firstText(item, keys[dimension], `${dimension}-${index + 1}`);
}

function rangeParams(range: Range) {
  return { range } as const;
}

function RangePicker({ value, onChange }: { value: Range; onChange: (value: Range) => void }) {
  const colors = useAppTheme();
  return <View accessibilityRole="tablist" style={{ minHeight: 40, padding: 3, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
    {rangeOptions.map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: value === key }} onPress={() => onChange(key)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 32, borderRadius: 10, borderWidth: value === key ? 1 : 0, borderColor: value === key ? colors.border : 'transparent', backgroundColor: value === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
      <Text numberOfLines={1} style={{ color: value === key ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text>
    </Pressable>)}
  </View>;
}

function StatsTabs({ value, onChange }: { value: Tab; onChange: (value: Tab) => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 44, padding: 3, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, overflow: 'hidden' }}>
    <ScrollView horizontal bounces={false} overScrollMode="never" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 3 }}>
      {tabs.map(([key, label, Icon]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: value === key }} onPress={() => onChange(key)} style={({ pressed }) => ({ minWidth: label.length > 3 ? 82 : 68, minHeight: 36, paddingHorizontal: 9, borderRadius: 10, backgroundColor: value === key ? colors.card : 'transparent', borderWidth: value === key ? 1 : 0, borderColor: value === key ? colors.border : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? 0.65 : 1 })}>
        <Icon color={value === key ? colors.primary : colors.subtext} size={14} strokeWidth={value === key ? 2.4 : 2} />
        <Text style={{ color: value === key ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

function MetricCard({ label, value, detail, icon: Icon, accent, background, basis }: { label: string; value: string; detail?: string; icon: LucideIcon; accent: string; background: string; basis: `${number}%` }) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: basis, minWidth: 0, minHeight: 92, borderRadius: 16, borderWidth: 1, borderColor: background, backgroundColor: colors.card, padding: 10, justifyContent: 'space-between', gap: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><IconTile icon={Icon} size={27} iconSize={14} color={accent} background={background} /><Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 10, fontWeight: '600' }}>{label}</Text></View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={{ color: colors.text, fontSize: 21, lineHeight: 25, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    {detail ? <Text numberOfLines={1} style={{ color: accent, fontSize: 9, lineHeight: 12, fontWeight: '600' }}>{detail}</Text> : null}
  </View>;
}

function MetricsGrid({ value }: { value: unknown }) {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const summary = unwrapRecord(value);
  const basis: `${number}%` = width >= 1000 ? '23%' : width >= 620 ? '31%' : '47%';
  const requests = firstNumber(summary, ['request_count', 'total_requests', 'requests', 'count']);
  const failed = firstNumber(summary, ['failed_count', 'failed_requests', 'error_count', 'errors']);
  const input = firstNumber(summary, ['prompt_tokens', 'input_tokens']);
  const output = firstNumber(summary, ['completion_tokens', 'output_tokens']);
  const total = firstNumber(summary, ['total_tokens', 'tokens']) || input + output;
  const cached = firstNumber(summary, ['cached_tokens', 'cache_read_tokens']);
  const cacheRate = summary.cache_hit_rate !== undefined
    ? `${(toNumber(summary.cache_hit_rate) <= 1 ? toNumber(summary.cache_hit_rate) * 100 : toNumber(summary.cache_hit_rate)).toFixed(1)}%`
    : `${(total ? cached / total * 100 : 0).toFixed(1)}%`;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
    <MetricCard label="请求数" value={formatNumber(requests)} icon={BarChart3} accent={colors.cyan} background={colors.cyanBg} basis={basis} />
    <MetricCard label="成功率" value={`${successRate(summary).toFixed(1)}%`} detail={`失败 ${formatNumber(failed)} 次`} icon={CheckCircle2} accent={colors.success} background={colors.successBg} basis={basis} />
    <MetricCard label="Token 数" value={formatNumber(total)} detail={`输入 ${formatNumber(input)} · 输出 ${formatNumber(output)}`} icon={Coins} accent={colors.primary} background={colors.primarySoft} basis={basis} />
    <MetricCard label="总费用" value={formatCost(firstNumber(summary, ['cost', 'cost_usd', 'total_cost']))} icon={CircleDollarSign} accent={colors.success} background={colors.successBg} basis={basis} />
    <MetricCard label="平均延迟" value={`${formatNumber(firstNumber(summary, ['avg_latency_ms', 'average_latency_ms', 'latency_ms', 'average_latency']))} ms`} icon={Timer} accent={colors.warning} background={colors.warningBg} basis={basis} />
    <MetricCard label="缓存命中率" value={cacheRate} detail={`缓存读取 ${formatNumber(cached)}`} icon={Zap} accent={colors.accentText} background={colors.accentBg} basis={basis} />
    <MetricCard label="推理 Token" value={formatNumber(firstNumber(summary, ['reasoning_tokens', 'reasoning_token_count']))} icon={Cpu} accent={colors.cyan} background={colors.cyanBg} basis={basis} />
  </View>;
}

function trendValue(item: ApiRecord, metric: TrendMetric) {
  if (metric === 'tokens') return firstNumber(item, ['total_tokens', 'tokens']);
  if (metric === 'cost') return firstNumber(item, ['cost', 'cost_usd', 'total_cost']);
  return firstNumber(item, ['request_count', 'requests', 'count']);
}

function trendLabel(item: ApiRecord, index: number) {
  const source = firstText(item, ['bucket_start', 'date', 'day', 'time', 'timestamp'], String(index + 1));
  const date = source.slice(0, 10).split('-');
  return date.length === 3 ? `${Number(date[1])}/${Number(date[2])}` : source.slice(0, 5);
}

function TrendChart({ items, metric }: { items: ApiRecord[]; metric: TrendMetric }) {
  const colors = useAppTheme();
  const chartItems = items.slice(-30);
  const values = chartItems.map((item) => trendValue(item, metric));
  const maxValue = Math.max(1, ...values);
  const top = maxValue * 1.12;
  const left = 42;
  const right = 696;
  const bottom = 184;
  const plotHeight = 154;
  const slot = (right - left) / Math.max(1, chartItems.length);
  const barWidth = Math.max(4, Math.min(26, slot * 0.58));

  if (!chartItems.length) return <EmptyState embedded icon={BarChart3} message="暂无趋势数据" />;
  return <View style={{ height: 226, overflow: 'hidden' }}><Svg width="100%" height="226" viewBox="0 0 720 226" preserveAspectRatio="none">
    {[0, 1, 2, 3, 4].map((index) => {
      const y = bottom - index * plotHeight / 4;
      const value = top * index / 4;
      const label = metric === 'cost' ? `$${value.toFixed(3)}` : formatNumber(value);
      return <Fragment key={index}><Line x1={left} x2={right} y1={y} y2={y} stroke={colors.chartTrack} strokeWidth="1" strokeDasharray="3 4" /><SvgText x="36" y={y + 3} fill={colors.subtext} fontSize="9" textAnchor="end">{label}</SvgText></Fragment>;
    })}
    {chartItems.map((item, index) => {
      const value = values[index] ?? 0;
      const height = Math.max(value ? 3 : 0, value / top * plotHeight);
      const x = left + slot * index + (slot - barWidth) / 2;
      const showLabel = chartItems.length <= 10 || index % Math.ceil(chartItems.length / 7) === 0 || index === chartItems.length - 1;
      return <Fragment key={`${trendLabel(item, index)}-${index}`}><Rect x={x} y={bottom - height} width={barWidth} height={height} rx="2" fill={colors.cyan} />{showLabel ? <SvgText x={x + barWidth / 2} y="207" fill={colors.subtext} fontSize="9" textAnchor="middle">{trendLabel(item, index)}</SvgText> : null}</Fragment>;
    })}
  </Svg></View>;
}

function TrendPanel({ value, metric, onMetricChange }: { value: unknown; metric: TrendMetric; onMetricChange: (value: TrendMetric) => void }) {
  const colors = useAppTheme();
  const items = records(value, ['trend', 'items', 'buckets', 'data', 'list']) as UsageTrendItem[];
  return <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1, minWidth: 110 }}><SectionHeader icon={BarChart3} title="每日趋势" /></View>
      <View style={{ flexDirection: 'row', borderRadius: 10, backgroundColor: colors.mutedCard, padding: 3 }}>
        {([['requests', '请求数'], ['tokens', 'Token'], ['cost', '费用']] as const).map(([key, label]) => <Pressable key={key} onPress={() => onMetricChange(key)} style={{ minHeight: 32, paddingHorizontal: 10, borderRadius: 7, backgroundColor: metric === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: metric === key ? colors.text : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </View>
    </View>
    <TrendChart items={items} metric={metric} />
  </View>;
}

function heatmapCells(eventsValue: unknown, analysisValue?: unknown) {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let parsedEvents = 0;
  for (const item of records(eventsValue, ['events', 'requests', 'items', 'rows', 'logs', 'data'])) {
    const rawDate = firstText(item, ['created_at', 'timestamp', 'time', 'date', 'occurred_at', 'started_at'], '');
    const numericDate = /^\d{9,13}$/.test(rawDate) ? Number(rawDate) : undefined;
    const date = numericDate === undefined
      ? new Date(rawDate)
      : new Date(numericDate < 10_000_000_000 ? numericDate * 1000 : numericDate);
    if (Number.isNaN(date.getTime())) continue;
    const day = (date.getDay() + 6) % 7;
    cells[day][date.getHours()] += firstNumber(item, ['request_count', 'requests', 'count']) || 1;
    parsedEvents += 1;
  }
  if (parsedEvents) return cells;

  const supplied = records(analysisValue, ['heatmap', 'request_heatmap', 'hourly_distribution', 'hours']);
  if (supplied.length) {
    for (const item of supplied) {
      const day = optionalNumber(item, ['weekday', 'day_of_week', 'day']);
      const hour = optionalNumber(item, ['hour', 'hour_of_day']);
      if (day === undefined || hour === undefined) continue;
      const normalizedDay = day >= 1 && day <= 7 ? day - 1 : day === 0 ? 6 : day;
      if (normalizedDay >= 0 && normalizedDay < 7 && hour >= 0 && hour < 24) cells[normalizedDay][hour] += firstNumber(item, ['count', 'requests', 'request_count', 'value']);
    }
  }
  return cells;
}

function Heatmap({ events, analysis }: { events: unknown; analysis?: unknown }) {
  const colors = useAppTheme();
  const matrix = useMemo(() => heatmapCells(events, analysis), [analysis, events]);
  const max = Math.max(0, ...matrix.flat());
  const palette = [colors.mutedCard, colors.cyanBg, '#7dd3fc', '#38bdf8', colors.cyan];
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return <View style={{ gap: 9 }}>
    <SectionHeader icon={CalendarDays} title="请求热力图" meta="按小时" />
    <ScrollView horizontal bounces={false} overScrollMode="never" showsHorizontalScrollIndicator={false}><View style={{ minWidth: 620, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 11, gap: 4 }}>
      {matrix.map((row, dayIndex) => <View key={days[dayIndex]} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Text style={{ width: 36, color: colors.subtext, fontSize: 12, fontWeight: '600' }}>{days[dayIndex]}</Text>{row.map((count, hour) => {
        const level = count && max ? Math.max(1, Math.ceil(count / max * 4)) : 0;
        return <View key={hour} accessibilityLabel={`${days[dayIndex]} ${hour} 时 ${count} 次`} style={{ width: 20, height: 20, borderRadius: 2, backgroundColor: palette[level] }} />;
      })}</View>)}
      <View style={{ marginLeft: 39, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.subtext, fontSize: 12 }}>00</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>06</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>12</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>18</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>23</Text></View>
    </View></ScrollView>
  </View>;
}

function breakdownValue(item: ApiRecord) {
  return firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount']) || firstNumber(item, ['request_count', 'requests', 'count']);
}

function DonutCard({ title, icon: Icon, rows, dimension }: { title: string; icon: LucideIcon; rows: ApiRecord[]; dimension: Dimension }) {
  const colors = useAppTheme();
  const visible = rows.slice(0, 5);
  const values = visible.map(breakdownValue);
  const total = values.reduce((sum, value) => sum + value, 0);
  const cost = visible.reduce((sum, item) => sum + firstNumber(item, ['cost', 'cost_usd', 'total_cost', 'amount']), 0);
  const circumference = 2 * Math.PI * 38;
  let progress = 0;
  return <View style={{ flexGrow: 1, flexBasis: 210, minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon color={colors.subtext} size={16} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}>{title}</Text></View>
    {visible.length ? <>
      <View style={{ height: 108, alignItems: 'center', justifyContent: 'center' }}><Svg width="108" height="108" viewBox="0 0 108 108">
        <Circle cx="54" cy="54" r="38" fill="none" stroke={colors.chartTrack} strokeWidth="10" />
        {visible.map((item, index) => {
          const ratio = total ? values[index] / total : index === 0 ? 1 : 0;
          const offset = progress;
          progress += ratio;
          return <Circle key={`${dimensionLabel(item, dimension, index)}-${index}`} cx="54" cy="54" r="38" fill="none" stroke={segmentColors[index]} strokeWidth="10" strokeDasharray={`${ratio * circumference} ${circumference}`} strokeDashoffset={-offset * circumference} rotation="-90" origin="54,54" />;
        })}
        <SvgText x="54" y="48" fill={colors.subtext} fontSize="12" fontWeight="600" textAnchor="middle">总费用</SvgText><SvgText x="54" y="64" fill={colors.text} fontSize="13" fontWeight="700" textAnchor="middle">{formatCost(cost)}</SvgText>
      </Svg></View>
      {visible.slice(0, 3).map((item, index) => <View key={`${dimensionLabel(item, dimension, index)}-legend`} style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: segmentColors[index] }} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>{dimensionLabel(item, dimension, index)}</Text><Text style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>{formatCost(firstNumber(item, ['cost', 'cost_usd', 'total_cost']))}</Text></View>)}
    </> : <EmptyState embedded icon={Icon} message="暂无数据" />}
  </View>;
}

function dimensionRows(source: unknown, dimension: Dimension) {
  const keys: Record<Dimension, string[]> = {
    model: ['by_model', 'models', 'model_usage', 'items', 'rows'],
    provider: ['by_provider', 'providers', 'provider_usage', 'items', 'rows'],
    user: ['by_user', 'users', 'user_usage', 'items', 'rows'],
    account: ['by_account', 'accounts', 'account_usage', 'items', 'rows'],
    apiKey: ['by_api_key', 'by_api_keys', 'by_key', 'api_key_usage', 'key_usage', 'api_keys', 'items', 'rows'],
    endpoint: ['by_endpoint', 'endpoints', 'routes', 'endpoint_usage', 'items', 'rows'],
  };
  return records(source, keys[dimension]);
}

function BreakdownSection({ title, icon, rows, dimension, full = false }: { title: string; icon: LucideIcon; rows: ApiRecord[]; dimension: Dimension; full?: boolean }) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: full ? '100%' : 360, minWidth: 0, gap: 8 }}>
    <SectionHeader icon={icon} title={title} />
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
      {rows.slice(0, 8).map((item, index) => <View key={`${dimensionLabel(item, dimension, index)}-${index}`} style={{ minHeight: 56, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' }}>{dimensionLabel(item, dimension, index)}</Text><Text style={{ color: colors.success, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatCost(firstNumber(item, ['cost', 'cost_usd', 'total_cost']))}</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}><Text style={{ color: colors.subtext, fontSize: 12 }}>请求 <Text style={{ color: colors.cyan, fontWeight: '800' }}>{formatNumber(firstNumber(item, ['request_count', 'requests', 'count']))}</Text></Text><Text style={{ color: colors.subtext, fontSize: 12 }}>Token <Text style={{ color: colors.warning, fontWeight: '800' }}>{formatNumber(firstNumber(item, ['total_tokens', 'tokens']))}</Text></Text><Text style={{ color: colors.subtext, fontSize: 12 }}>成功 <Text style={{ color: colors.success, fontWeight: '800' }}>{successRate(item).toFixed(1)}%</Text></Text></View>
      </View>)}
      {!rows.length ? <EmptyState embedded icon={icon} message="暂无数据" /> : null}
    </View>
  </View>;
}

function eventFailed(item: ApiRecord) {
  const statusCode = firstNumber(item, ['status_code', 'http_status']);
  return Boolean(item.error ?? item.failed) || statusCode >= 400 || String(item.status ?? '').toLowerCase() === 'failed';
}

function EventRow({ item, index }: { item: ApiRecord; index: number }) {
  const colors = useAppTheme();
  const failed = eventFailed(item);
  return <View style={{ minHeight: 68, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, gap: 7 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: failed ? colors.danger : colors.success }} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>{firstText(item, ['model', 'model_id'], '未知模型')}</Text><View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: failed ? colors.dangerBg : colors.successBg }}><Text style={{ color: failed ? colors.danger : colors.success, fontSize: 10, fontWeight: '800' }}>{failed ? '失败' : '正常'}</Text></View></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}><Text style={{ flexGrow: 1, color: colors.subtext, fontSize: 10 }}>{firstText(item, ['created_at', 'timestamp', 'time'], '--')}</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>Token {formatNumber(firstNumber(item, ['total_tokens', 'tokens']))}</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>{formatNumber(firstNumber(item, ['latency_ms', 'duration_ms', 'latency']))} ms</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>{formatCost(firstNumber(item, ['cost', 'cost_usd']))}</Text></View>
  </View>;
}

function EventsPanel({ value, title = '最近事件', limit = 8 }: { value: unknown; title?: string; limit?: number }) {
  const colors = useAppTheme();
  const rows = records(value, ['events', 'requests', 'logs', 'items', 'rows', 'data']).slice(0, limit);
  return <View style={{ gap: 8 }}><SectionHeader icon={Activity} title={title} /><View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>{rows.map((item, index) => <EventRow key={firstText(item, ['id', 'request_id'], String(index))} item={item} index={index} />)}{!rows.length ? <EmptyState embedded icon={Activity} message="暂无事件" /> : null}</View></View>;
}

function OverviewContent({ bundle, trendMetric, onTrendMetricChange }: { bundle: DashboardBundle; trendMetric: TrendMetric; onTrendMetricChange: (value: TrendMetric) => void }) {
  const analysis = unwrapRecord(bundle.analysis);
  const modelRows = dimensionRows(bundle.models, 'model').length ? dimensionRows(bundle.models, 'model') : dimensionRows(analysis, 'model');
  const userRows = dimensionRows(bundle.users, 'user').length ? dimensionRows(bundle.users, 'user') : dimensionRows(analysis, 'user');
  const providerRows = dimensionRows(analysis, 'provider');
  const accountRows = dimensionRows(analysis, 'account');
  const apiKeyRows = dimensionRows(analysis, 'apiKey');
  const endpointRows = dimensionRows(analysis, 'endpoint');
  return <>
    <MetricsGrid value={bundle.overview} />
    <TrendPanel value={bundle.trend} metric={trendMetric} onMetricChange={onTrendMetricChange} />
    <Heatmap events={bundle.events} analysis={bundle.analysis} />
    <View style={{ gap: 8 }}><SectionHeader icon={Layers3} title="构成占比" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
      <DonutCard title="按模型" icon={Boxes} rows={modelRows} dimension="model" />
      <DonutCard title="按供应商" icon={Server} rows={providerRows} dimension="provider" />
      <DonutCard title="按用户" icon={UsersRound} rows={userRows} dimension="user" />
      <DonutCard title="按账号" icon={Waypoints} rows={accountRows} dimension="account" />
      <DonutCard title="按 API Key" icon={KeyRound} rows={apiKeyRows} dimension="apiKey" />
    </View></View>
    <View style={{ gap: 10 }}><SectionHeader icon={ListFilter} title="用量明细" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <BreakdownSection title="按模型" icon={Boxes} rows={modelRows} dimension="model" />
      <BreakdownSection title="按用户" icon={UsersRound} rows={userRows} dimension="user" />
      <BreakdownSection title="按供应商" icon={Server} rows={providerRows} dimension="provider" />
      <BreakdownSection title="按端点" icon={Waypoints} rows={endpointRows} dimension="endpoint" />
      <BreakdownSection title="按账号" icon={Cpu} rows={accountRows} dimension="account" full />
      <BreakdownSection title="按 API Key" icon={KeyRound} rows={apiKeyRows} dimension="apiKey" full />
    </View></View>
    <EventsPanel value={bundle.events} />
  </>;
}

function AnalysisContent({ value, events }: { value: unknown; events?: unknown }) {
  const analysis = unwrapRecord(value);
  const dimensions: Array<[string, LucideIcon, Dimension]> = [['按模型', Boxes, 'model'], ['按供应商', Server, 'provider'], ['按用户', UsersRound, 'user'], ['按账号', Waypoints, 'account'], ['按 API Key', KeyRound, 'apiKey']];
  return <><Heatmap events={events} analysis={value} /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{dimensions.map(([title, icon, dimension]) => <DonutCard key={dimension} title={title} icon={icon} rows={dimensionRows(analysis, dimension)} dimension={dimension} />)}</View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{dimensions.map(([title, icon, dimension]) => <BreakdownSection key={dimension} title={title} icon={icon} rows={dimensionRows(analysis, dimension)} dimension={dimension} />)}</View></>;
}

function DimensionContent({ value, dimension }: { value: unknown; dimension: 'model' | 'user' }) {
  const rows = dimensionRows(value, dimension);
  return <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}><DonutCard title={dimension === 'model' ? '模型费用占比' : '用户费用占比'} icon={dimension === 'model' ? Boxes : UsersRound} rows={rows} dimension={dimension} /></View><BreakdownSection title={dimension === 'model' ? '模型用量明细' : '用户用量明细'} icon={dimension === 'model' ? Boxes : UsersRound} rows={rows} dimension={dimension} full /></>;
}

function RequestList({ value, search, loading, title }: { value: unknown; search: string; loading: boolean; title: string }) {
  const colors = useAppTheme();
  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return records(value, ['events', 'requests', 'logs', 'items', 'rows', 'data']).filter((item) => !keyword || JSON.stringify(item).toLowerCase().includes(keyword));
  }, [search, value]);
  return <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
    <View style={{ minHeight: 44, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center' }}><ScrollText color={colors.subtext} size={16} /><Text style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 13, fontWeight: '700' }}>{title}</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>{rows.length} 条</Text></View>
    <FlatList data={rows} bounces={false} alwaysBounceVertical={false} overScrollMode="never" scrollToOverflowEnabled={false} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" keyExtractor={(item, index) => firstText(item, ['id', 'request_id', 'trace_id'], String(index))} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={9} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: rows.length ? 0 : 1, paddingBottom: rows.length ? 12 : 0 }} ListEmptyComponent={!loading ? <EmptyState embedded icon={ScrollText} message={search ? '没有匹配的记录' : '暂无记录'} /> : null} ListFooterComponent={loading ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} /> : null} renderItem={({ item, index }) => <EventRow item={item} index={index} />} />
  </View>;
}

export default function AdminStatsScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('7d');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('requests');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const listMode = tab === 'events' || tab === 'logs';
  const heatmapEnabled = tab === 'overview' || tab === 'analysis';

  const query = useQuery<unknown, Error>({
    queryKey: ['admin', 'stats', tab, range],
    queryFn: async ({ signal }) => {
      if (tab === 'overview') {
        const overview = await getAdminStatsOverview(rangeParams(range), signal);
        const optional = <T,>(promise: Promise<T>) => promise.catch(() => undefined);
        const [trend, analysis, models, users] = await Promise.all([
          optional(getAdminStatsTrend(rangeParams(range), signal)),
          optional(getAdminStatsAnalysis(rangeParams(range), signal)),
          optional(getAdminStatsModels(rangeParams(range), signal)),
          optional(getAdminStatsUsers(rangeParams(range), signal)),
        ]);
        return { overview, trend, analysis, models, users } satisfies DashboardBundle;
      }
      if (tab === 'summary') return getAdminStatsOverview(rangeParams(range), signal);
      if (tab === 'trend') return getAdminStatsTrend(rangeParams(range), signal);
      if (tab === 'analysis') return getAdminStatsAnalysis(rangeParams(range), signal);
      if (tab === 'models') return getAdminStatsModels(rangeParams(range), signal);
      if (tab === 'users') return getAdminStatsUsers(rangeParams(range), signal);
      if (tab === 'realtime') return getAdminRealtimeUsage(signal);
      if (tab === 'events') return getAdminUsageEvents({ range, page: 1, page_size: 300 }, signal);
      return getAdminLogsRequests({ page: 1, page_size: 300 }, signal);
    },
    retry: 0,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: heatmapEnabled ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const heatmapEvents = useQuery<unknown, Error>({
    queryKey: ['admin', 'stats', 'heatmap-events', range],
    queryFn: ({ signal }) => getAdminUsageEvents({ range, page: 1, page_size: 300 }, signal),
    enabled: heatmapEnabled,
    retry: 0,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: heatmapEnabled ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  const showRange = !['models', 'realtime', 'logs'].includes(tab);
  const content = () => {
    if (query.isLoading) return <ActivityIndicator color="#0d7f9e" style={{ paddingVertical: 30 }} />;
    if (tab === 'overview') return <OverviewContent bundle={{ ...((query.data ?? { overview: {} }) as DashboardBundle), events: heatmapEvents.data }} trendMetric={trendMetric} onTrendMetricChange={setTrendMetric} />;
    if (tab === 'summary' || tab === 'realtime') return <MetricsGrid value={query.data} />;
    if (tab === 'trend') return <TrendPanel value={query.data} metric={trendMetric} onMetricChange={setTrendMetric} />;
    if (tab === 'analysis') return <AnalysisContent value={query.data} events={heatmapEvents.data} />;
    if (tab === 'models' || tab === 'users') return <DimensionContent value={query.data} dimension={tab === 'models' ? 'model' : 'user'} />;
    return null;
  };

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const requests = [query.refetch()];
    if (heatmapEnabled) requests.push(heatmapEvents.refetch());
    void Promise.allSettled(requests).finally(() => setRefreshing(false));
  };

  return <Page title="统计与日志" subtitle="全站请求、用量与运行分析" icon={BarChart3} safeTop={false} contentMaxWidth={1180} scrollable={!listMode} refreshing={refreshing} onRefresh={refresh}>
    <View style={{ gap: 6 }}>
      <StatsTabs value={tab} onChange={(next) => { setTab(next); setSearch(''); }} />
      {showRange ? <RangePicker value={range} onChange={setRange} /> : null}
    </View>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {listMode ? <><SearchField value={search} onChangeText={setSearch} placeholder="搜索模型、用户、请求 ID 或状态" /><RequestList value={query.data} search={search} loading={query.isFetching} title={tab === 'events' ? '用量事件' : '请求日志'} /></> : content()}
  </Page>;
}
