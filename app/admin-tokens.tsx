import { KeySquare } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function tokenId(item: ApiRecord) {
  return String(item.id ?? '');
}

export default function AdminTokensScreen() {
  return <ResourceScreen
    title="Management Tokens"
    icon={KeySquare}
    queryKey={['admin', 'management-tokens']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/management-tokens', { signal }), ['tokens', 'items', 'data', 'list'])}
    idOf={tokenId}
    titleOf={(item) => String(item.name ?? tokenId(item) ?? 'Token')}
    subtitleOf={(item) => `${Array.isArray(item.scopes) && item.scopes.length ? `权限 ${item.scopes.join(', ')} · ` : ''}创建于 ${item.created_at ?? '--'}`}
    badgeOf={(item) => item.revoked_at ? { text: '已撤销', tone: 'danger' } : { text: '有效', tone: 'success' }}
    actions={[{
      key: 'revoke',
      label: '撤销 Token',
      danger: true,
      confirm: '撤销后使用该 Token 的调用会立即失效。',
      run: (item) => apiJson(`/admin/management-tokens/${encodeURIComponent(tokenId(item))}/revoke`, { method: 'POST', body: '{}' }),
    }]}
    create={{
      label: '创建 Token',
      note: '创建成功后 token 只返回一次，请在弹出的「服务器响应」中立即复制保存。',
      template: { name: '', scopes: [] },
      run: (value) => apiJson('/admin/management-tokens', { method: 'POST', body: JSON.stringify(value) }),
    }}
    remove={{
      confirm: (item) => `确定删除 Token「${item.name ?? tokenId(item)}」吗？`,
      run: (item) => apiJson(`/admin/management-tokens/${encodeURIComponent(tokenId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
