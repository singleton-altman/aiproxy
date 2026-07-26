import { Footprints } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

function traceId(item: ApiRecord) {
  return String(item.id ?? item.trace_id ?? '');
}

export default function AdminTracesScreen() {
  return <ResourceScreen
    title="Traces"
    subtitle="请求链路追踪（可能包含敏感 Prompt，注意保护）"
    icon={Footprints}
    queryKey={['admin', 'traces']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/traces', { signal }), ['traces', 'items', 'data', 'list'])}
    idOf={traceId}
    titleOf={(item) => String(item.model ?? item.path ?? traceId(item) ?? 'Trace')}
    subtitleOf={(item) => `${item.created_at ?? ''}${item.status_code !== undefined ? ` · HTTP ${item.status_code}` : ''}${item.latency_ms !== undefined ? ` · ${item.latency_ms}ms` : ''}`}
    badgeOf={(item) => {
      const code = Number(item.status_code);
      if (Number.isFinite(code) && code >= 400) return { text: String(code), tone: 'danger' };
      return item.error ? { text: '错误', tone: 'danger' } : { text: '成功', tone: 'success' };
    }}
    actions={[{
      key: 'detail',
      label: '完整 Trace',
      run: (item) => apiJson(`/admin/traces/${encodeURIComponent(traceId(item))}`),
    }]}
  />;
}
