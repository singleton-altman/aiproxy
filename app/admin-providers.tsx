import { Network } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function providerId(item: ApiRecord) {
  return String(item.id ?? item.name ?? '');
}

export default function AdminProvidersScreen() {
  return <ResourceScreen
    title="Providers"
    icon={Network}
    queryKey={['admin', 'providers']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/providers', { signal }), ['providers', 'items', 'data', 'list'])}
    idOf={providerId}
    titleOf={(item) => String(item.name ?? providerId(item) ?? 'Provider')}
    subtitleOf={(item) => `${item.family ?? ''}${item.base_url ? ` · ${item.base_url}` : ''}${item.route_prefix ? ` · 前缀 ${item.route_prefix}` : ''}`}
    badgeOf={(item) => item.enabled === false ? { text: '停用', tone: 'muted' } : { text: '启用', tone: 'success' }}
    headerActions={[
      { key: 'builtin', label: '内置 Providers', run: () => apiJson('/admin/providers/builtin') },
    ]}
    actions={[
      { key: 'detail', label: '完整详情', run: (item) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}`) },
      { key: 'builtin-models', label: '内置模型', run: (item) => apiJson(`/admin/providers/builtin/${encodeURIComponent(String(item.name ?? providerId(item)))}/models`) },
      { key: 'route-prefix', label: '保存路由前缀', run: (item) => apiJson(`/admin/providers/builtin/${encodeURIComponent(String(item.name ?? providerId(item)))}/route-prefix`, { method: 'PUT', body: JSON.stringify({ route_prefix: item.route_prefix ?? '' }) }) },
      { key: 'quota-test', label: '额度查询测试', run: (item) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}/quota-test`, { method: 'POST', body: '{}', timeoutMs: 60000 }) },
    ]}
    create={{
      label: '添加 Provider',
      template: { name: '', family: 'openai', base_url: '', route_prefix: '', api_key: '', enabled: true },
      run: (value) => apiJson('/admin/providers', { method: 'POST', body: JSON.stringify(value) }),
    }}
    edit={{
      pick: (item) => ({
        name: item.name ?? '',
        family: item.family ?? 'openai',
        base_url: item.base_url ?? '',
        route_prefix: item.route_prefix ?? '',
        enabled: item.enabled !== false,
      }),
      run: (item, value) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}`, { method: 'PATCH', body: JSON.stringify(value) }),
    }}
    remove={{
      confirm: (item) => `确定删除 Provider「${item.name ?? providerId(item)}」吗？`,
      run: (item) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
