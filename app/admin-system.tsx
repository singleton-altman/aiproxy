import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, History, Power, RefreshCw, ScrollText, ServerCog } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { StructuredDataView } from '@/src/components/structured-form';
import { useAppTheme } from '@/src/lib/theme';
import { checkAdminUpdates, getAdminAppLogs, getAdminSystemInfo, runAdminSystemAction } from '@/src/services/admin';

const actionLabels = { update: '执行更新', restart: '重启服务', rollback: '回滚版本' } as const;

export default function AdminSystemScreen() {
  const colors = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);

  const info = useQuery({ queryKey: ['admin', 'system', 'info'], queryFn: ({ signal }) => getAdminSystemInfo(signal) });
  const updates = useQuery({
    queryKey: ['admin', 'system', 'updates'],
    queryFn: ({ signal }) => checkAdminUpdates(false, signal),
    retry: 0,
  });
  const logs = useQuery({
    queryKey: ['admin', 'logs', 'app'],
    queryFn: ({ signal }) => getAdminAppLogs({ limit: 100 }, signal),
    retry: 0,
  });

  const actionMutation = useMutation({
    mutationFn: (action: keyof typeof actionLabels) => runAdminSystemAction(action),
    onSuccess: (_, action) => Alert.alert('已提交', `${actionLabels[action]}请求已发送，服务可能短暂不可用。`),
    onError: (error) => Alert.alert('操作失败', error.message),
  });

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void Promise.allSettled([info.refetch(), updates.refetch(), logs.refetch()]).finally(() => setRefreshing(false));
  };

  function confirmAction(action: keyof typeof actionLabels) {
    Alert.alert(`确认${actionLabels[action]}`, '该操作会影响线上服务，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确认执行', style: 'destructive', onPress: () => actionMutation.mutate(action) },
    ]);
  }

  return <Page title="系统管理" subtitle="版本、更新与运行日志" icon={ServerCog} safeTop={false} refreshing={refreshing || info.isFetching} onRefresh={refresh}>
    {info.error ? <ErrorState message={info.error.message} retry={() => info.refetch()} /> : null}
    {info.data ? <Panel>
      <SectionHeader icon={ServerCog} title="系统信息" />
      <StructuredDataView value={info.data} />
    </Panel> : null}

    <Panel>
      <SectionHeader icon={ArrowDownToLine} title="更新" />
      {updates.error ? <Text style={{ color: colors.subtext, fontSize: 12 }}>更新检查暂不可用：{updates.error.message}</Text> : null}
      {updates.data ? <StructuredDataView value={updates.data} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable onPress={() => void updates.refetch()} style={{ flexGrow: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>重新检查</Text>
        </Pressable>
        <Pressable disabled={actionMutation.isPending} onPress={() => confirmAction('update')} style={{ flexGrow: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ArrowDownToLine color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>执行更新</Text>
        </Pressable>
        <Pressable disabled={actionMutation.isPending} onPress={() => confirmAction('restart')} style={{ flexGrow: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.warning, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Power color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>重启服务</Text>
        </Pressable>
        <Pressable disabled={actionMutation.isPending} onPress={() => confirmAction('rollback')} style={{ flexGrow: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <History color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>回滚版本</Text>
        </Pressable>
      </View>
    </Panel>

    <Panel>
      <SectionHeader icon={ScrollText} title="应用日志" meta={logs.data ? `最近 ${logs.data.length} 条` : undefined} />
      {logs.error ? <Text style={{ color: colors.subtext, fontSize: 12 }}>日志暂不可用：{logs.error.message}</Text> : null}
      {(logs.data ?? []).slice(-100).reverse().map((line, index) => <Text key={index} selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 10, lineHeight: 16, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, paddingVertical: 4 }}>{line}</Text>)}
      {!logs.data?.length && !logs.isFetching && !logs.error ? <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center' }}>暂无日志</Text> : null}
    </Panel>
  </Page>;
}
