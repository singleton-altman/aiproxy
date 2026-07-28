import { useRouter } from 'expo-router';
import { CloudCog, Plus } from 'lucide-react-native';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

function accountId(item: ApiRecord) {
  return String(item.id ?? '');
}

function accountLabel(item: ApiRecord) {
  return String(item.label ?? item.name ?? item.email ?? accountId(item)) || '账号';
}

const credentialFields: Record<string, Array<{ key: string; label: string; placeholder: string }>> = {
  cursor: [{ key: 'machine_id', label: 'Machine ID', placeholder: 'storage.serviceMachineId' }],
  qianwen: [{ key: 'console_cookie', label: '控制台 Cookie', placeholder: 'login_qianwenai_ticket=...' }],
  ark: [
    { key: 'volc_access_key_id', label: 'Access Key ID', placeholder: 'AKLT...' },
    { key: 'volc_secret_access_key', label: 'Secret Access Key', placeholder: '仅在需要替换时填写' },
  ],
};

function statusOf(item: ApiRecord) {
  return String(item.status ?? (item.enabled === false ? 'disabled' : 'active'));
}

function AccountField({ label, value, onChangeText, placeholder, numeric = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; numeric?: boolean }) {
  const colors = useAppTheme();
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontSize: 12 }} />
  </View>;
}

function AccountForm({ value, onChange }: { value: ApiRecord; onChange: (value: ApiRecord) => void }) {
  const colors = useAppTheme();
  const provider = String(value.provider ?? '').toLowerCase();
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  return <View style={{ gap: 12 }}>
    <AccountField label="账号标签" value={String(value.label ?? '')} onChangeText={(next) => set('label', next)} placeholder={`${provider || 'provider'}-manual`} />
    <AccountField label="优先级" value={String(value.priority ?? 0)} onChangeText={(next) => set('priority', next)} numeric />
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>状态</Text>
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        {([['active', '启用'], ['disabled', '停用']] as const).map(([key, label]) => <Pressable key={key} onPress={() => set('status', key)} style={{ flex: 1, minHeight: 38, borderRadius: 9, backgroundColor: value.status === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: value.status === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </View>
    </View>
    <AccountField label="出口代理" value={String(value.egress_selector ?? '')} onChangeText={(next) => set('egress_selector', next)} placeholder="留空表示直连，或填写代理 ID" />
    <View style={{ minHeight: 48, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>WebSocket</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>允许该账号承载 Codex WebSocket 会话</Text></View>
      <Switch value={Boolean(value.ws_enabled)} onValueChange={(next) => set('ws_enabled', next)} trackColor={{ false: colors.disabled, true: colors.primary }} />
    </View>
    {(credentialFields[provider] ?? []).map((field) => <AccountField key={field.key} label={field.label} value={String(value[field.key] ?? '')} onChangeText={(next) => set(field.key, next)} placeholder={field.placeholder} />)}
    {(credentialFields[provider] ?? []).length ? <Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 15 }}>凭证字段留空时保持现有值不变。</Text> : null}
  </View>;
}

function accountEditPayload(value: ApiRecord) {
  const provider = String(value.provider ?? '').toLowerCase();
  const payload: ApiRecord = {
    label: String(value.label ?? '').trim(),
    priority: Number(value.priority) || 0,
    status: String(value.status ?? 'active'),
    egress_selector: String(value.egress_selector ?? '').trim(),
    ws_enabled: Boolean(value.ws_enabled),
  };
  const providerData: ApiRecord = {};
  for (const field of credentialFields[provider] ?? []) {
    const credential = String(value[field.key] ?? '').trim();
    if (credential) providerData[field.key] = credential;
  }
  if (Object.keys(providerData).length) payload.provider_data = providerData;
  return payload;
}

function AccountDetails({ item }: { item: ApiRecord }) {
  const colors = useAppTheme();
  const fields = [
    ['供应商', item.provider],
    ['账号', item.email ?? item.name ?? item.label],
    ['状态', statusOf(item)],
    ['优先级', item.priority ?? 0],
    ['出口代理', item.egress_selector ?? item.proxy_id ?? '直连'],
    ['WebSocket', item.ws_enabled ? '已启用' : '未启用'],
    ['最后使用', item.last_used_at ?? '暂无'],
    ['状态说明', item.status_reason ?? item.last_error ?? '无'],
  ];
  return <View style={{ gap: 1 }}>{fields.map(([label, fieldValue]) => <View key={String(label)} style={{ minHeight: 38, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.rowBorder, flexDirection: 'row', gap: 12 }}><Text style={{ width: 72, color: colors.subtext, fontSize: 11 }}>{String(label)}</Text><Text selectable style={{ flex: 1, color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: '600' }}>{String(fieldValue ?? '--')}</Text></View>)}</View>;
}

export default function AdminAccountsScreen() {
  const colors = useAppTheme();
  const router = useRouter();
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
    renderDetail={(item) => <AccountDetails item={item} />}
    toggle={{
      label: '启用账号',
      value: (item) => item.enabled !== false && statusOf(item) !== 'disabled',
      run: (item, next) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`, { method: 'PUT', body: JSON.stringify({ status: next ? 'active' : 'disabled' }) }),
    }}
    actions={[
      { key: 'models', label: '可用模型', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/models`) },
      { key: 'recover', label: '恢复账号', confirm: '尝试恢复该账号？', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/recover`, { method: 'POST', body: '{}' }) },
      { key: 'quota-reset', label: '重置额度', danger: true, confirm: '确定重置该账号的额度统计吗？', run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}/quota/reset`, { method: 'POST', body: '{}' }) },
    ]}
    edit={{
      pick: (item) => ({
        provider: item.provider ?? '',
        label: item.label ?? item.name ?? '',
        priority: item.priority ?? 0,
        status: statusOf(item),
        egress_selector: item.egress_selector ?? item.proxy_id ?? '',
        ws_enabled: Boolean(item.ws_enabled),
      }),
      renderForm: ({ value, onChange }) => <AccountForm value={value} onChange={onChange} />,
      validate: (value) => String(value.label ?? '').trim() ? undefined : '请填写账号标签',
      submitLabel: '保存账号',
      run: (item, value) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`, { method: 'PUT', body: JSON.stringify(accountEditPayload(value)) }),
    }}
    remove={{
      confirm: (item) => `确定删除账号「${accountLabel(item)}」吗？`,
      run: (item) => apiJson(`/admin/accounts/${encodeURIComponent(accountId(item))}`, { method: 'DELETE' }),
    }}
    footer={<Pressable onPress={() => router.push('/admin-account-import' as never)} style={{ position: 'absolute', left: 16, right: 16, bottom: 20, minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Plus color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>添加或导入账号</Text></Pressable>}
  />;
}
