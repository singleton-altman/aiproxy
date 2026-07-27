import { ChevronDown, ChevronUp, Network, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

const families = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic 兼容' },
] as const;

function textValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value);
}

function providerIdentifier(name: string) {
  const normalized = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (normalized) return normalized;
  const encoded = Array.from(name.trim()).map((character) => character.codePointAt(0)?.toString(16)).filter(Boolean).join('-');
  return encoded ? `provider-${encoded}` : 'provider';
}

function providerModels(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function ProviderField({ label, value, placeholder, onChangeText }: { label: string; value: string; placeholder?: string; onChangeText: (value: string) => void }) {
  const colors = useAppTheme();
  return <View style={{ gap: 7 }}>
    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontSize: 13 }} />
  </View>;
}

function FamilyPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const colors = useAppTheme();
  const [open, setOpen] = useState(false);
  const selected = families.find((item) => item.value === value) ?? families[0];
  return <View style={{ gap: 7 }}>
    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>协议</Text>
    <Pressable onPress={() => setOpen((current) => !current)} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: open ? colors.primary : colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }}>{selected.label}</Text>
      {open ? <ChevronUp color={colors.subtext} size={16} /> : <ChevronDown color={colors.subtext} size={16} />}
    </Pressable>
    {open ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
      {families.map((item, index) => <Pressable key={item.value} onPress={() => { onChange(item.value); setOpen(false); }} style={{ minHeight: 44, paddingHorizontal: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: value === item.value ? colors.primary : colors.disabled, backgroundColor: value === item.value ? colors.primary : 'transparent' }} /><Text style={{ color: colors.text, fontSize: 12, fontWeight: value === item.value ? '700' : '500' }}>{item.label}</Text></Pressable>)}
    </View> : null}
  </View>;
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text><Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{detail}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>;
}

function ProviderForm({ value, onChange }: { value: ApiRecord; onChange: (value: ApiRecord) => void }) {
  const colors = useAppTheme();
  const [modelDraft, setModelDraft] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const name = textValue(value.name);
  const models = providerModels(value.models);
  const update = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  const addModels = () => {
    const additions = providerModels(modelDraft);
    if (!additions.length) return;
    update('models', Array.from(new Set([...models, ...additions])));
    setModelDraft('');
  };
  return <View style={{ gap: 14 }}>
    <ProviderField label="显示名称" value={name} placeholder="比如：智谱备用" onChangeText={(next) => update('name', next)} />
    <View style={{ paddingHorizontal: 2, gap: 3 }}><Text style={{ color: colors.subtext, fontSize: 10 }}>标识 <Text style={{ color: colors.primary, fontFamily: 'monospace', fontWeight: '700' }}>{providerIdentifier(name)}</Text></Text><Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 15 }}>根据显示名称自动生成，用于路由，创建后不可修改。</Text></View>

    <FamilyPicker value={textValue(value.family) || 'openai'} onChange={(next) => update('family', next)} />
    <ProviderField label="Base URL" value={textValue(value.base_url)} placeholder="https://api.example.com" onChangeText={(next) => update('base_url', next)} />

    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>模型列表</Text>
      <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingLeft: 12, flexDirection: 'row', alignItems: 'center' }}><TextInput value={modelDraft} onChangeText={setModelDraft} onSubmitEditing={addModels} returnKeyType="done" placeholder="输入模型 ID，回车添加" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 9 }} /><Pressable accessibilityLabel="添加模型" onPress={addModels} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Plus color={colors.primary} size={17} /></Pressable></View>
      {models.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{models.map((model) => <View key={model} style={{ minHeight: 32, maxWidth: '100%', paddingLeft: 10, borderRadius: 10, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Text numberOfLines={1} style={{ maxWidth: 230, color: colors.primary, fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }}>{model}</Text><Pressable accessibilityLabel={`移除模型 ${model}`} onPress={() => update('models', models.filter((item) => item !== model))} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}><X color={colors.primary} size={13} /></Pressable></View>)}</View> : null}
    </View>

    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
      <Pressable onPress={() => setAdvanced((current) => !current)} style={{ minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>高级选项</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>{advanced ? '收起' : '展开'}</Text>{advanced ? <ChevronUp color={colors.subtext} size={15} /> : <ChevronDown color={colors.subtext} size={15} />}</Pressable>
      {advanced ? <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.rowBorder, gap: 8 }}>
        <ToggleRow label="Cloudflare TLS" detail="上游位于 Cloudflare 后且 TLS 握手异常时启用。" value={value.cloudflare_tls === true} onChange={(next) => update('cloudflare_tls', next)} />
        <ToggleRow label="中转号池" detail="上游为 new-api 一类号池时启用。" value={value.relay === true} onChange={(next) => update('relay', next)} />
        <ProviderField label="路由前缀" value={textValue(value.route_prefix)} placeholder={providerIdentifier(name)} onChangeText={(next) => update('route_prefix', next)} />
      </View> : null}
    </View>
  </View>;
}

function createProviderPayload(value: ApiRecord): ApiRecord {
  const payload: ApiRecord = {
    name: textValue(value.name).trim(),
    family: textValue(value.family).trim() || 'openai',
    base_url: textValue(value.base_url).trim(),
    route_prefix: textValue(value.route_prefix).trim(),
    models: providerModels(value.models),
    enabled: true,
  };
  if (value.cloudflare_tls === true) payload.cloudflare_tls = true;
  if (value.relay === true) payload.relay = true;
  return payload;
}

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
      label: '新建提供商',
      note: '填写上游名称和地址；密钥请在提供商创建后到账户导入页绑定。',
      template: { name: '', family: 'openai', base_url: '', models: [], route_prefix: '', cloudflare_tls: false, relay: false, enabled: true },
      renderForm: (props) => <ProviderForm {...props} />,
      validate: (value) => !textValue(value.name).trim() ? '请输入显示名称' : !textValue(value.base_url).trim() ? '请输入 Base URL' : undefined,
      submitLabel: '创建提供商',
      run: (value) => apiJson('/admin/providers', { method: 'POST', body: JSON.stringify(createProviderPayload(value)) }),
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
