import { Waypoints } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function proxyId(item: ApiRecord) {
  return String(item.id ?? item.name ?? '');
}

export default function AdminProxiesScreen() {
  return <ResourceScreen
    title="代理管理"
    icon={Waypoints}
    queryKey={['admin', 'proxies']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/proxies', { signal }), ['proxies', 'items', 'data', 'list'])}
    idOf={proxyId}
    titleOf={(item) => String(item.name ?? `${item.scheme ?? 'http'}://${item.host ?? ''}:${item.port ?? ''}`)}
    subtitleOf={(item) => `${item.scheme ?? 'http'}://${item.host ?? '?'}:${item.port ?? '?'}${item.username ? ` · 认证 ${item.username}` : ''}${item.account_count !== undefined ? ` · ${item.account_count} 个账号使用` : ''}`}
    badgeOf={(item) => item.enabled === false ? { text: '停用', tone: 'muted' } : { text: '启用', tone: 'success' }}
    toggle={{
      label: '启用代理',
      value: (item) => item.enabled !== false,
      run: (item, next) => apiJson(`/admin/proxies/${encodeURIComponent(proxyId(item))}`, { method: 'PUT', body: JSON.stringify({ enabled: next }) }),
    }}
    actions={[
      { key: 'test', label: '测试连通性', run: (item) => apiJson(`/admin/proxies/${encodeURIComponent(proxyId(item))}/test`, { method: 'POST', body: '{}', timeoutMs: 60000 }) },
      { key: 'impact', label: '删除影响评估', run: (item) => apiJson(`/admin/proxies/${encodeURIComponent(proxyId(item))}/impact`) },
    ]}
    create={{
      label: '添加代理',
      template: { name: '', scheme: 'http', host: '', port: 7890, username: '', password: '', enabled: true },
      run: (value) => apiJson('/admin/proxies', { method: 'POST', body: JSON.stringify(value) }),
    }}
    edit={{
      pick: (item) => ({
        name: item.name ?? '',
        scheme: item.scheme ?? 'http',
        host: item.host ?? '',
        port: item.port ?? 7890,
        username: item.username ?? '',
        enabled: item.enabled !== false,
      }),
      run: (item, value) => apiJson(`/admin/proxies/${encodeURIComponent(proxyId(item))}`, { method: 'PUT', body: JSON.stringify(value) }),
    }}
    remove={{
      confirm: (item) => `确定删除代理「${item.name ?? proxyId(item)}」吗？关联账号将失去此出口。`,
      run: (item) => apiJson(`/admin/proxies/${encodeURIComponent(proxyId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
