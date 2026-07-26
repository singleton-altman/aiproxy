import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Activity, BarChart3, Boxes, ChevronRight, CircleDollarSign, Coins, Gauge, KeyRound, ScrollText } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { EmptyState, ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { StructuredDataView } from '@/src/components/structured-form';
import { useAppTheme } from '@/src/lib/theme';
import { getBalance, getKeyOverview, getModels, getRequests, getUsageOverview, getUsageQuotaLimit, getUsageTrend } from '@/src/services/account';
import { sessionState } from '@/src/store/session';
import type { RequestLogItem, UsageTrendItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

const ranges = [['day', '今天'], ['week', '本周'], ['month', '本月']] as const;
type RangeKey = typeof ranges[number][0];

function formatNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return '--';
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(Math.round(number * 100) / 100);
}

function formatCost(value: unknown, currency = '') {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${currency ? `${currency} ` : ''}${number.toFixed(number >= 100 ? 1 : 4)}`;
}

function trendValue(item: UsageTrendItem, key: 'requests' | 'tokens' | 'cost') {
  if (key === 'requests') return Number(item.request_count ?? item.count) || 0;
  if (key === 'tokens') return Number(item.total_tokens) || 0;
  return Number(item.cost) || 0;
}

function TrendChart({ items, metric }: { items: UsageTrendItem[]; metric: 'requests' | 'tokens' | 'cost' }) {
  const colors = useAppTheme();
  const values = items.map((item) => trendValue(item, metric));
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * 320;
    const y = 108 - Math.min(1, value / (max * 1.12)) * 96;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return <View style={{ height: 128, borderRadius: 14, backgroundColor: colors.chartPanel, overflow: 'hidden' }}><Svg width="100%" height="128" viewBox="0 0 320 120" preserveAspectRatio="none">
    {[12, 36, 60, 84, 108].map((y) => <Line key={y} x1="0" x2="320" y1={y} y2={y} stroke={colors.chartTrack} strokeWidth="1" strokeDasharray="3 4" />)}
    {values.length ? <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
  </Svg></View>;
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: 100, minHeight: 64, borderRadius: 14, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, gap: 3 }}>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{label}</Text>
  </View>;
}

function RequestRow({ item }: { item: RequestLogItem }) {
  const colors = useAppTheme();
  const failed = Boolean(item.error) || (typeof item.status_code === 'number' && item.status_code >= 400);
  return <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: failed ? colors.danger : colors.success }} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{String(item.model ?? '未知模型')}</Text>
      <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{String(item.created_at ?? '')}</Text>
    </View>
    <Text style={{ color: colors.subtext, fontSize: 10, fontVariant: ['tabular-nums'] }}>{formatNumber(item.total_tokens)} tok</Text>
  </View>;
}

export default function OverviewScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const session = useSnapshot(sessionState);
  const apiKeyMode = session.mode === 'apikey';
  const [range, setRange] = useState<RangeKey>('week');
  const [metric, setMetric] = useState<'requests' | 'tokens' | 'cost'>('requests');
  const [refreshing, setRefreshing] = useState(false);

  const keyOverview = useQuery({
    queryKey: ['key-overview'],
    queryFn: ({ signal }) => getKeyOverview(signal),
    enabled: apiKeyMode,
  });
  const usage = useQuery({
    queryKey: ['usage', 'overview', range],
    queryFn: ({ signal }) => getUsageOverview({ range }, signal),
    enabled: !apiKeyMode,
  });
  const trend = useQuery({
    queryKey: ['usage', 'trend', range],
    queryFn: ({ signal }) => getUsageTrend({ range }, signal),
    enabled: !apiKeyMode,
  });
  const balance = useQuery({
    queryKey: ['balance'],
    queryFn: ({ signal }) => getBalance(signal),
    enabled: !apiKeyMode,
  });
  const models = useQuery({
    queryKey: ['models'],
    queryFn: ({ signal }) => getModels(signal),
    enabled: !apiKeyMode,
  });
  const recentRequests = useQuery({
    queryKey: ['requests', 'recent'],
    queryFn: ({ signal }) => getRequests({ limit: 5 }, signal),
    enabled: !apiKeyMode,
  });

  const queries = apiKeyMode ? [keyOverview] : [usage, trend, balance, models, recentRequests];
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void Promise.allSettled(queries.map((query) => query.refetch())).finally(() => setRefreshing(false));
  };

  const visibleModels = useMemo(() => (models.data ?? []).filter((item) => !item.hidden), [models.data]);

  if (apiKeyMode) {
    return <Page title="Key 总览" subtitle={session.baseUrl} icon={KeyRound} refreshing={refreshing || keyOverview.isFetching} onRefresh={refresh}>
      {keyOverview.error ? <ErrorState message={keyOverview.error.message} retry={() => keyOverview.refetch()} /> : null}
      {keyOverview.data ? <Panel><StructuredDataView value={keyOverview.data} /></Panel>
        : !keyOverview.isFetching && !keyOverview.error ? <EmptyState message="暂无 Key 总览数据" /> : null}
      <Panel>
        <SectionHeader icon={Activity} title="聊天测试" />
        <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>使用当前 API Key 直接调用 /v1 网关接口测试连通性。</Text>
        <Pressable onPress={() => router.push('/chat' as never)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>打开聊天测试</Text>
        </Pressable>
      </Panel>
    </Page>;
  }

  const overview = usage.data ?? {};
  const currency = typeof balance.data?.currency === 'string' ? balance.data.currency : '';

  return <Page title="总览" subtitle={session.profile?.email ? String(session.profile.email) : session.baseUrl} icon={Gauge} refreshing={refreshing || (!usage.data && usage.isFetching)} onRefresh={refresh}>
    {usage.error ? <ErrorState message={usage.error.message} retry={() => usage.refetch()} /> : null}

    <Panel>
      <SectionHeader icon={CircleDollarSign} title="余额与模型" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatTile label="当前余额" value={formatCost(balance.data?.balance, currency)} color={colors.success} />
        <StatTile label="信用额度" value={formatCost(balance.data?.credit, currency)} color={colors.cyan} />
        <StatTile label="可用模型" value={models.data ? String(visibleModels.length) : '--'} color={colors.primary} />
      </View>
    </Panel>

    <Panel>
      <SectionHeader icon={BarChart3} title="用量" meta={ranges.find(([key]) => key === range)?.[1]} />
      <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        {ranges.map(([key, label]) => <Pressable key={key} onPress={() => setRange(key)} style={{ flex: 1, minHeight: 34, borderRadius: 9, backgroundColor: range === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: range === key ? colors.primary : colors.subtext, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        </Pressable>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatTile label="请求数" value={formatNumber(overview.request_count)} color={colors.primary} />
        <StatTile label="总 Token" value={formatNumber(overview.total_tokens)} color={colors.warning} />
        <StatTile label="费用" value={formatCost(overview.cost, currency)} color={colors.danger} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {([['requests', '请求'], ['tokens', 'Token'], ['cost', '费用']] as const).map(([key, label]) => <Pressable key={key} onPress={() => setMetric(key)} style={{ paddingHorizontal: 12, minHeight: 30, borderRadius: 9, backgroundColor: metric === key ? colors.primarySoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: metric === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text>
        </Pressable>)}
      </View>
      <TrendChart items={trend.data ?? []} metric={metric} />
    </Panel>

    <Panel>
      <Pressable onPress={() => router.push('/requests' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.62 : 1 })}>
        <SectionHeader icon={ScrollText} title="最近请求" meta="查看全部" />
      </Pressable>
      {recentRequests.error ? <ErrorState message={recentRequests.error.message} retry={() => recentRequests.refetch()} /> : null}
      {(recentRequests.data?.items ?? []).length
        ? (recentRequests.data?.items ?? []).map((item, index) => <RequestRow key={String(item.id ?? index)} item={item} />)
        : !recentRequests.isFetching && !recentRequests.error ? <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center' }}>暂无请求记录</Text> : null}
    </Panel>

    <Panel>
      <SectionHeader icon={Boxes} title="模型预览" meta={models.data ? `${visibleModels.length} 个可用` : undefined} />
      {visibleModels.slice(0, 5).map((model) => <View key={String(model.id)} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: model.free ? colors.success : colors.primary }} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontFamily: 'monospace' }}>{String(model.id)}</Text>
        <Text style={{ color: colors.subtext, fontSize: 10 }}>{String(model.provider ?? model.owned_by ?? '')}</Text>
        <ChevronRight color={colors.disabled} size={14} />
      </View>)}
      {!visibleModels.length && !models.isFetching ? <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center' }}>暂无可用模型</Text> : null}
      <Pressable onPress={() => router.push('/keys' as never)} style={{ minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>管理密钥与模型</Text>
      </Pressable>
    </Panel>

    <Panel>
      <SectionHeader icon={Coins} title="额度限制" />
      <QuotaSection />
    </Panel>
  </Page>;
}

function QuotaSection() {
  const colors = useAppTheme();
  const quota = useQuery({
    queryKey: ['usage', 'quota'],
    queryFn: ({ signal }) => getUsageQuotaLimit(signal),
  });
  if (quota.error) return <Text style={{ color: colors.subtext, fontSize: 12 }}>额度信息暂不可用</Text>;
  if (!quota.data) return <Text style={{ color: colors.subtext, fontSize: 12 }}>加载中…</Text>;
  return <StructuredDataView value={quota.data} />;
}
