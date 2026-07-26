import { useMutation } from '@tanstack/react-query';
import { Globe2, Save } from 'lucide-react-native';
import { Alert, Pressable, Text } from 'react-native';
import { useState } from 'react';

import { StructuredForm } from '@/src/components/structured-form';
import { Page, Panel, SectionHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { apiJson } from '@/src/lib/api';
import type { ApiRecord } from '@/src/types/api';

export default function AdminProxySystemScreen() {
  const colors = useAppTheme();
  const [draft, setDraft] = useState<ApiRecord>({ enabled: false, scheme: 'http', host: '', port: 7890, username: '', password: '' });
  const save = useMutation({
    mutationFn: () => apiJson<ApiRecord>('/admin/proxies/system', { method: 'PUT', body: JSON.stringify(draft) }),
    onSuccess: () => Alert.alert('已保存', '系统代理设置已更新。'),
    onError: (error) => Alert.alert('保存失败', error.message),
  });
  return <Page title="系统代理" subtitle="统一出口代理配置" icon={Globe2} safeTop={false}>
    <Panel>
      <SectionHeader icon={Globe2} title="代理设置" />
      <StructuredForm value={draft} onChange={setDraft} />
      <Pressable disabled={save.isPending} onPress={() => save.mutate()} style={{ minHeight: 46, borderRadius: 12, backgroundColor: save.isPending ? colors.disabled : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Save color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>{save.isPending ? '保存中...' : '保存系统代理'}</Text></Pressable>
    </Panel>
  </Page>;
}
