import { TicketPercent } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function inviteId(item: ApiRecord) {
  return String(item.id ?? item.code ?? '');
}

export default function AdminInvitesScreen() {
  return <ResourceScreen
    title="邀请码"
    icon={TicketPercent}
    queryKey={['admin', 'invites']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/invites', { signal }), ['invites', 'items', 'data', 'list'])}
    idOf={inviteId}
    titleOf={(item) => String(item.code ?? inviteId(item) ?? '邀请码')}
    subtitleOf={(item) => `已用 ${item.redemptions ?? 0}${item.max_redemptions ? ` / ${item.max_redemptions}` : ''}${item.expires_at ? ` · 到期 ${item.expires_at}` : ''}`}
    badgeOf={(item) => item.disabled ? { text: '禁用', tone: 'danger' } : { text: '可用', tone: 'success' }}
    toggle={{
      label: '启用邀请码',
      value: (item) => !item.disabled,
      run: (item, next) => apiJson(`/admin/invites/${encodeURIComponent(inviteId(item))}`, { method: 'PUT', body: JSON.stringify({ disabled: !next }) }),
    }}
    actions={[{
      key: 'redemptions',
      label: '查看使用记录',
      run: (item) => apiJson(`/admin/invites/${encodeURIComponent(inviteId(item))}/redemptions`),
    }]}
    create={{
      label: '创建邀请码',
      note: '留空 code 通常由服务器自动生成；max_redemptions 为 0 或删除该字段表示不限次数。',
      template: { code: '', max_redemptions: 0, expires_at: '' },
      run: (value) => {
        const body: ApiRecord = { ...value };
        if (!String(body.code ?? '').trim()) delete body.code;
        if (!String(body.expires_at ?? '').trim()) delete body.expires_at;
        if (!body.max_redemptions) delete body.max_redemptions;
        return apiJson('/admin/invites', { method: 'POST', body: JSON.stringify(body) });
      },
    }}
    edit={{
      pick: (item) => ({ max_redemptions: item.max_redemptions ?? 0, expires_at: item.expires_at ?? '', disabled: Boolean(item.disabled) }),
      run: (item, value) => apiJson(`/admin/invites/${encodeURIComponent(inviteId(item))}`, { method: 'PUT', body: JSON.stringify(value) }),
    }}
    remove={{
      confirm: (item) => `确定删除邀请码「${item.code ?? inviteId(item)}」吗？`,
      run: (item) => apiJson(`/admin/invites/${encodeURIComponent(inviteId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
