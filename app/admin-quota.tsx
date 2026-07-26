import { useMutation, useQuery } from '@tanstack/react-query';
import { Coins, RefreshCw } from 'lucide-react-native';
import { Alert, Pressable, Text } from 'react-native';

import { StructuredDataView } from '@/src/components/structured-form';
import { ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminQuota, refreshAdminQuota } from '@/src/services/admin';

export default function AdminQuotaScreen() {
  const colors = useAppTheme();
  const quota = useQuery({ queryKey: ['admin', 'quota', 'detail'], queryFn: ({ signal }) => getAdminQuota(signal) });
  const refresh = useMutation({
    mutationFn: () => refreshAdminQuota(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'quota'] });
      Alert.alert('额度已刷新', result && typeof result === 'object' && 'message' in result ? String(result.message) : '服务器已完成额度刷新。');
    },
    onError: (error) => Alert.alert('刷新失败', error.message),
  });

  return <Page title="额度管理" subtitle="全站额度概览与上游额度刷新" icon={Coins} safeTop={false} refreshing={quota.isFetching} onRefresh={() => quota.refetch()}>
    {quota.error ? <ErrorState message={quota.error.message} retry={() => quota.refetch()} /> : null}
    <Panel>
      <SectionHeader icon={Coins} title="额度概览" />
      {quota.data ? <StructuredDataView value={quota.data} /> : !quota.isFetching ? <Text style={{ color: colors.subtext }}>暂无额度数据</Text> : null}
    </Panel>
    <Pressable disabled={refresh.isPending} onPress={() => refresh.mutate()} style={{ minHeight: 48, borderRadius: 12, backgroundColor: refresh.isPending ? colors.disabled : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <RefreshCw color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{refresh.isPending ? '刷新中...' : '刷新全部额度'}</Text>
    </Pressable>
  </Page>;
}
