import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { Activity, BarChart3, CloudCog, Coins, KeySquare, LayoutGrid, Network, Package, ServerCog, Settings2, ShieldAlert, TicketPercent, UsersRound, Waypoints, Boxes } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ErrorState, Page, Panel, SectionHeader, ServiceButton } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminStatsOverview } from '@/src/services/admin';
import { isAdmin, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');
const TODAY_STATS_QUERY_KEY = ['admin', 'stats', 'overview', 'today'] as const;

function localTodayRange() {
  const to = new Date();
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return '--';
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(Math.round(number * 100) / 100);
}

export default function AdminScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  useSnapshot(sessionState);
  const admin = isAdmin();
  const [refreshing, setRefreshing] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);

  const stats = useQuery({
    queryKey: TODAY_STATS_QUERY_KEY,
    queryFn: ({ signal }) => getAdminStatsOverview(localTodayRange(), signal),
    enabled: admin,
    retry: 0,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: screenFocused ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    if (admin) void queryClient.invalidateQueries({ queryKey: TODAY_STATS_QUERY_KEY });
    return () => setScreenFocused(false);
  }, [admin, queryClient]));

  const refresh = () => {
    if (refreshing || !admin) return;
    setRefreshing(true);
    void stats.refetch().finally(() => setRefreshing(false));
  };

  if (!admin && sessionState.mode === 'apikey') {
    return <Page title="管理" icon={LayoutGrid}>
      <Panel>
        <SectionHeader icon={ShieldAlert} title="需要管理员账号" />
        <Text style={{ color: colors.subtext, fontSize: 13, lineHeight: 20 }}>API Key 登录模式没有管理端权限，请使用管理员邮箱账号登录。</Text>
      </Panel>
    </Page>;
  }

  return <Page title="管理" subtitle={admin ? '管理端功能' : '当前账号可能没有管理员权限'} icon={LayoutGrid} refreshing={refreshing || stats.isFetching} onRefresh={refresh}>
    {!admin ? <Panel>
      <SectionHeader icon={ShieldAlert} title="权限提示" />
      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>未检测到管理员角色。若你确认自己是管理员，下方功能仍可尝试访问；无权限的请求会返回错误。</Text>
    </Panel> : null}

    {admin && stats.error ? <ErrorState message={`统计概览：${stats.error.message}`} retry={() => stats.refetch()} /> : null}
    {stats.data ? <Panel>
      <SectionHeader icon={Activity} title="今日全站" />
      <View style={{ minHeight: 60, borderRadius: 14, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
        {([['请求数', stats.data.request_count, colors.primary], ['总 Token', stats.data.total_tokens, colors.warning], ['费用', stats.data.cost, colors.danger]] as const).map(([label, value, color], index) => <View key={label} style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderLeftWidth: index ? 1 : 0, borderLeftColor: colors.rowBorder }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatNumber(value)}</Text>
          <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{label}</Text>
        </View>)}
      </View>
    </Panel> : null}

    <SectionHeader icon={ServerCog} title="常用管理" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <ServiceButton icon={UsersRound} label="用户管理" detail="账号、角色与订阅" onPress={() => router.push('/admin-users' as never)} />
      <ServiceButton icon={ServerCog} label="系统管理" detail="版本、更新与日志" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => router.push('/admin-system' as never)} />
      <ServiceButton icon={Boxes} label="模型目录" detail="定价、隐藏与同步" iconColor={colors.primary} iconBackground={colors.primarySoft} onPress={() => router.push('/admin-models' as never)} />
      <ServiceButton icon={BarChart3} label="统计与日志" detail="全站用量与日志" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => router.push('/admin-stats' as never)} />
      <ServiceButton icon={Coins} label="额度管理" detail="额度概览与刷新" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => router.push('/admin-quota' as never)} />
      <ServiceButton icon={Settings2} label="配置中心" detail="系统、邮件与 GitHub" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/admin-config' as never)} />
      <ServiceButton icon={CloudCog} label="上游账号" detail="账号池与额度重置" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/admin-accounts' as never)} />
      <ServiceButton icon={CloudCog} label="账号导入" detail="批量导入与 OAuth" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/admin-account-import' as never)} />
      <ServiceButton icon={Network} label="Providers" detail="上游服务与路由" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => router.push('/admin-providers' as never)} />
      <ServiceButton icon={Waypoints} label="代理管理" detail="出口代理与测试" iconColor={colors.accentText} iconBackground={colors.accentBg} onPress={() => router.push('/admin-proxies' as never)} />
      <ServiceButton icon={TicketPercent} label="邀请码" detail="创建与使用记录" onPress={() => router.push('/admin-invites' as never)} />
      <ServiceButton icon={Package} label="套餐管理" detail="定价、限额与上下架" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => router.push('/admin-plans' as never)} />
      <ServiceButton icon={KeySquare} label="管理令牌" detail="程序凭证与权限" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/admin-tokens' as never)} />
    </View>

  </Page>;
}
