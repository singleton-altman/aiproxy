import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, ListFilter, Radio, UsersRound, Boxes, ScrollText } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { StructuredDataView } from '@/src/components/structured-form';
import { ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import {
  getAdminLogsRequests,
  getAdminRealtimeUsage,
  getAdminStats,
  getAdminStatsAnalysis,
  getAdminStatsModels,
  getAdminStatsOverview,
  getAdminStatsTrend,
  getAdminStatsUsers,
  getAdminUsageEvents,
} from '@/src/services/admin';

const tabs = [
  ['summary', '全站', Activity],
  ['overview', '概览', BarChart3],
  ['trend', '趋势', BarChart3],
  ['analysis', '分析', Activity],
  ['models', '模型', Boxes],
  ['users', '用户', UsersRound],
  ['realtime', '实时', Radio],
  ['events', '事件', ListFilter],
  ['logs', '请求日志', ScrollText],
] as const;
type Tab = typeof tabs[number][0];

function rangeQuery() {
  return { range: '7d' } as const;
}

export default function AdminStatsScreen() {
  const colors = useAppTheme();
  const [tab, setTab] = useState<Tab>('overview');
  const query = useQuery<unknown, Error>({
    queryKey: ['admin', 'stats', tab],
    queryFn: ({ signal }) => {
      if (tab === 'summary') return getAdminStats(rangeQuery(), signal);
      if (tab === 'overview') return getAdminStatsOverview(rangeQuery(), signal);
      if (tab === 'trend') return getAdminStatsTrend(rangeQuery(), signal);
      if (tab === 'analysis') return getAdminStatsAnalysis(rangeQuery(), signal);
      if (tab === 'models') return getAdminStatsModels(signal);
      if (tab === 'users') return getAdminStatsUsers(rangeQuery(), signal);
      if (tab === 'realtime') return getAdminRealtimeUsage(signal);
      if (tab === 'events') return getAdminUsageEvents({ ...rangeQuery(), page: 1, page_size: 100 }, signal);
      if (tab === 'logs') return getAdminLogsRequests({ page: 1, page_size: 100 }, signal);
      return getAdminStats(rangeQuery(), signal);
    },
    retry: 0,
  });

  return <Page title="统计与日志" subtitle="全站请求、用量与运行分析" icon={BarChart3} safeTop={false} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {tabs.map(([key, label, Icon]) => <Pressable key={key} onPress={() => setTab(key)} style={{ minWidth: 74, minHeight: 42, paddingHorizontal: 10, borderRadius: 11, backgroundColor: tab === key ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: tab === key ? colors.primary : colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Icon color={tab === key ? colors.primary : colors.subtext} size={15} /><Text style={{ color: tab === key ? colors.primary : colors.subtext, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      </Pressable>)}
    </ScrollView>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <Panel>
      <SectionHeader icon={tabs.find(([key]) => key === tab)?.[2] ?? Activity} title={tabs.find(([key]) => key === tab)?.[1] ?? '统计'} />
      {query.data !== undefined ? <StructuredDataView value={query.data} /> : !query.isFetching && !query.error ? <Text style={{ color: colors.subtext }}>暂无数据</Text> : null}
    </Panel>
  </Page>;
}
