import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Activity, Braces, ChevronRight, CloudCog, Footprints, KeySquare, LayoutGrid, Network, Package, ServerCog, ShieldAlert, TicketPercent, UsersRound, Waypoints } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ErrorState, Page, Panel, SectionHeader, ServiceButton } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminStatsOverview } from '@/src/services/admin';
import { getApiModules } from '@/src/services/endpoints';
import { isAdmin, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');

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
  useSnapshot(sessionState);
  const admin = isAdmin();
  const [refreshing, setRefreshing] = useState(false);

  const stats = useQuery({
    queryKey: ['admin', 'stats', 'overview'],
    queryFn: ({ signal }) => getAdminStatsOverview({ range: 'day' }, signal),
    enabled: admin,
    retry: 0,
  });

  const refresh = () => {
    if (refreshing || !admin) return;
    setRefreshing(true);
    void stats.refetch().finally(() => setRefreshing(false));
  };

  const modules = getApiModules().filter((module) => module.key.startsWith('admin-'));

  if (!admin && sessionState.mode === 'apikey') {
    return <Page title="管理" icon={LayoutGrid}>
      <Panel>
        <SectionHeader icon={ShieldAlert} title="需要管理员账号" />
        <Text style={{ color: colors.subtext, fontSize: 13, lineHeight: 20 }}>API Key 登录模式没有管理端权限，请使用管理员邮箱账号登录。</Text>
      </Panel>
    </Page>;
  }

  return <Page title="管理" subtitle={admin ? '管理端功能与全部接口' : '当前账号可能没有管理员权限'} icon={LayoutGrid} refreshing={refreshing || stats.isFetching} onRefresh={refresh}>
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <ServiceButton icon={UsersRound} label="用户管理" detail="账号、角色、余额与订阅" onPress={() => router.push('/admin-users' as never)} />
      <ServiceButton icon={ServerCog} label="系统管理" detail="版本、更新、重启与日志" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => router.push('/admin-system' as never)} />
      <ServiceButton icon={CloudCog} label="上游账号" detail="账号池、恢复与额度重置" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/admin-accounts' as never)} />
      <ServiceButton icon={Network} label="Providers" detail="上游服务与路由前缀" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => router.push('/admin-providers' as never)} />
      <ServiceButton icon={Waypoints} label="代理管理" detail="出口代理与连通性测试" iconColor={colors.accentText} iconBackground={colors.accentBg} onPress={() => router.push('/admin-proxies' as never)} />
      <ServiceButton icon={TicketPercent} label="邀请码" detail="创建、限次与使用记录" onPress={() => router.push('/admin-invites' as never)} />
      <ServiceButton icon={Package} label="套餐管理" detail="定价、限额与上下架" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => router.push('/admin-plans' as never)} />
      <ServiceButton icon={KeySquare} label="Mgmt Tokens" detail="管理令牌创建与撤销" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/admin-tokens' as never)} />
      <ServiceButton icon={Footprints} label="Traces" detail="请求链路追踪明细" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => router.push('/admin-traces' as never)} />
    </View>

    <SectionHeader icon={Braces} title="全部管理接口" meta={`${modules.reduce((sum, item) => sum + item.endpointCount, 0)} 个端点`} />
    <Panel>
      {modules.map((module, index) => <Pressable key={module.key} onPress={() => router.push(`/modules/${encodeURIComponent(module.key)}` as never)} style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, opacity: pressed ? 0.62 : 1 })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{module.label}</Text>
          <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{module.endpointCount} 个端点 · {module.methodCount} 个方法</Text>
        </View>
        <ChevronRight color={colors.disabled} size={16} />
      </Pressable>)}
    </Panel>
  </Page>;
}
