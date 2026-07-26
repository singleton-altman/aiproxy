import { Boxes } from 'lucide-react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import {
  createAdminModel,
  deleteAdminModel,
  getAdminModels,
  getAdminModelSnapshot,
  getAdminModelWarnings,
  runAdminModelAction,
  setAdminModelsEnabled,
  updateAdminModel,
} from '@/src/services/admin';
import type { ApiRecord } from '@/src/types/api';

function modelId(item: ApiRecord) {
  return String(item.id ?? item.model ?? item.name ?? '');
}

export default function AdminModelsScreen() {
  return <ResourceScreen
    title="模型目录"
    subtitle="定价、可见性与目录维护"
    icon={Boxes}
    queryKey={['admin', 'models', 'catalog']}
    fetchItems={getAdminModels}
    idOf={modelId}
    titleOf={(item) => modelId(item) || '未命名模型'}
    subtitleOf={(item) => `${item.provider ?? item.owned_by ?? '未指定 Provider'} · 输入 ${item.input_price_per_1m ?? item.prompt_price_per_1m ?? 0} / 输出 ${item.output_price_per_1m ?? item.completion_price_per_1m ?? 0}`}
    badgeOf={(item) => item.enabled === false || item.user_hidden === true
      ? { text: '不可用', tone: 'muted' }
      : { text: '可用', tone: 'success' }}
    searchText={(item) => `${modelId(item)} ${item.provider ?? ''} ${item.family ?? ''}`}
    toggle={{
      label: '启用模型',
      value: (item) => item.enabled !== false,
      run: (item, enabled) => setAdminModelsEnabled({ ids: [modelId(item)], enabled }),
    }}
    headerActions={[
      { key: 'sync', label: '同步目录', run: () => runAdminModelAction('sync') },
      { key: 'probe', label: '探测模型', run: () => runAdminModelAction('probe') },
      { key: 'cleanup', label: '清理失效项', danger: true, confirm: '将清理失效模型，确定继续吗？', run: () => runAdminModelAction('cleanup') },
      { key: 'snapshot', label: '目录快照', run: () => getAdminModelSnapshot() },
      { key: 'warnings', label: '快照警告', run: () => getAdminModelWarnings() },
    ]}
    create={{
      label: '添加模型',
      template: {
        id: '', provider: '', family: '', enabled: true,
        input_price_per_1m: 0, output_price_per_1m: 0,
        cache_read_per_1m: 0, cache_write_per_1m: 0,
        registry_hidden: false, user_hidden: false,
      },
      run: createAdminModel,
    }}
    edit={{
      pick: (item) => ({
        provider: item.provider ?? '',
        family: item.family ?? '',
        enabled: item.enabled !== false,
        input_price_per_1m: item.input_price_per_1m ?? item.prompt_price_per_1m ?? 0,
        output_price_per_1m: item.output_price_per_1m ?? item.completion_price_per_1m ?? 0,
        cache_read_per_1m: item.cache_read_per_1m ?? 0,
        cache_write_per_1m: item.cache_write_per_1m ?? 0,
        registry_hidden: item.registry_hidden === true,
        user_hidden: item.user_hidden === true,
      }),
      run: (item, value) => updateAdminModel(modelId(item), value),
    }}
    remove={{
      confirm: (item) => `确定删除模型「${modelId(item)}」吗？`,
      run: (item) => deleteAdminModel(modelId(item)),
    }}
  />;
}
