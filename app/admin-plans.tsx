import { Package } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function planId(item: ApiRecord) {
  return String(item.id ?? item.name ?? '');
}

export default function AdminPlansScreen() {
  return <ResourceScreen
    title="套餐管理"
    icon={Package}
    queryKey={['admin', 'plans']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/plans', { signal }), ['plans', 'items', 'data', 'list'])}
    idOf={planId}
    titleOf={(item) => String(item.name ?? planId(item) ?? '套餐')}
    subtitleOf={(item) => `${item.price !== undefined ? `${item.price} ${item.currency ?? ''}` : '未定价'}${item.description ? ` · ${item.description}` : ''}`}
    badgeOf={(item) => item.enabled === false ? { text: '停用', tone: 'muted' } : { text: '在售', tone: 'success' }}
    create={{
      label: '创建套餐',
      template: { name: '', description: '', price: 0, currency: 'USD', enabled: true, limits: {} },
      run: (value) => apiJson('/admin/plans', { method: 'POST', body: JSON.stringify(value) }),
    }}
    edit={{
      pick: (item) => ({
        name: item.name ?? '',
        description: item.description ?? '',
        price: item.price ?? 0,
        currency: item.currency ?? 'USD',
        enabled: item.enabled !== false,
        limits: item.limits && typeof item.limits === 'object' ? item.limits : {},
      }),
      run: (item, value) => apiJson(`/admin/plans/${encodeURIComponent(planId(item))}`, { method: 'PATCH', body: JSON.stringify(value) }),
    }}
    remove={{
      confirm: (item) => `确定删除套餐「${item.name ?? planId(item)}」吗？`,
      run: (item) => apiJson(`/admin/plans/${encodeURIComponent(planId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
