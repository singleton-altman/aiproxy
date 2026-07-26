import { CloudCog } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function accountId(item: ApiRecord) {
  return String(item.id ?? '');
}

function accountLabel(item: ApiRecord) {
  return String(item.label ?? item.name ?? item.email ?? accountId(item) ?? '账号');
}

export default function AdminAccountsScreen() {
  return <ResourceScreen
    title="上游账号"
    icon={CloudCog}
    queryKey={['admin', 'accounts']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/accounts', { signal }), ['accounts', 'items', 'data', 'list'])}
    idOf={accountId}
    titleOf={(item) => `${item.provider ? `[${item.provider}] ` : ''}${accountLabel(item)}`}
    subtitleOf={(item) => `${item.status ?? '状态未知'}${item.status_reason ? ` · ${item.status_reason}` : ''}${item.priority !== undefined ? ` · 优先级 ${item.priority}` : ''}`}
    badgeOf={(item) => {
      if (item.enabled === false) return { text: '停用', tone: 'muted' };
      const status = String(item.status ?? '').toLowerCase();
      if (/error|invalid|banned|expired|fail/.test(status)) return { text: '异常', tone: 'danger' };
      if (/limit|cool|quota|degraded/.test(status)) return { text: '受限', tone: 'warning' };
      return { text: '正常', tone: 'success' };
    }}
    searchText={(item) => `${item.provider ?? ''} ${accountLabel(item)} ${item.status ?? ''}`}
    toggle={{
      label: '启用账号',
      value: (item) => item.enabled !== false,
      run: (item, next) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`, { method: 'PATCH', body: JSON.stringify({ enabled: next }) }),
    }}
    headerActions={[
      { key: 'health', label: '健康状态', run: () => apiJson('/admin/accounts/health') },
      { key: 'recover-all', label: '批量恢复', confirm: '尝试恢复所有异常账号？', run: () => apiJson('/admin/accounts/recover', { method: 'POST', body: '{}' }) },
    ]}
    actions={[
      { key: 'detail', label: '完整详情', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`) },
      { key: 'models', label: '可用模型', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/models`) },
      { key: 'test', label: '测试模型', confirm: '将对该账号发起一次真实调用测试。', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/models/test`, { method: 'POST', body: '{}', timeoutMs: 60000 }) },
      { key: 'recover', label: '恢复账号', confirm: '尝试恢复该账号？', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/recover`, { method: 'POST', body: '{}' }) },
      { key: 'quota-reset', label: '重置额度', danger: true, confirm: '确定重置该账号的额度统计吗？', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/quota/reset`, { method: 'POST', body: '{}' }) },
    ]}
    create={{
      label: '添加账号',
      note: '不同 provider 的凭据字段不同（api_key / token / cookie 等），请按上游要求填写；OAuth / Kiro 导入请使用「管理 → 全部管理接口」中的导入流程。',
      template: { provider: 'openai', label: '', api_key: '', enabled: true, priority: 0 },
      run: (value) => apiJson('/admin/accounts', { method: 'POST', body: JSON.stringify(value) }),
    }}
    edit={{
      pick: (item) => ({
        label: item.label ?? item.name ?? '',
        enabled: item.enabled !== false,
        priority: item.priority ?? 0,
        proxy_id: item.proxy_id ?? null,
      }),
      run: (item, value) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`, { method: 'PATCH', body: JSON.stringify(value) }),
    }}
    remove={{
      confirm: (item) => `确定删除账号「${accountLabel(item)}」吗？`,
      run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
