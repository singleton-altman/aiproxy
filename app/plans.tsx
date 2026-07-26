import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { getPlans } from '@/src/services/account';

export default function PlansScreen() {
  const colors = useAppTheme();
  const plans = useQuery({ queryKey: ['user', 'plans'], queryFn: ({ signal }) => getPlans(signal) });
  return <Page title="套餐计划" subtitle="可用套餐与额度规则" icon={Package} safeTop={false} refreshing={plans.isFetching} onRefresh={() => plans.refetch()}>
    {plans.error ? <ErrorState message={plans.error.message} retry={() => plans.refetch()} /> : null}
    {(plans.data ?? []).map((plan, index) => <Panel key={String(plan.id ?? index)}>
      <SectionHeader icon={Package} title={String(plan.name ?? `套餐 ${index + 1}`)} meta={plan.price !== undefined ? `${plan.price} ${plan.currency ?? ''}` : undefined} />
      {plan.description ? <Text style={{ color: colors.subtext, fontSize: 13, lineHeight: 19 }}>{String(plan.description)}</Text> : null}
      {plan.limits && typeof plan.limits === 'object' ? <View style={{ gap: 6 }}>{Object.entries(plan.limits).map(([key, value]) => <View key={key} style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder }}><Text style={{ flex: 1, color: colors.subtext, fontSize: 12 }}>{key}</Text><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text></View>)}</View> : null}
    </Panel>)}
    {!plans.data?.length && !plans.isFetching && !plans.error ? <EmptyState icon={Package} message="暂无可用套餐" /> : null}
  </Page>;
}
