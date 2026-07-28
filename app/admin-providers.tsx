import { CheckCircle2, ChevronDown, ChevronUp, Network, Plus, Square, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { apiJson, firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type ProviderProtocol = 'openai' | 'anthropic';

const protocols: { value: ProviderProtocol; label: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Claude 兼容' },
];

function textValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value);
}

function recordValue(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function providerIdentifier(name: string) {
  const normalized = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32).replace(/-+$/, '');
  if (normalized) return normalized;
  const encoded = Array.from(name.trim()).map((character) => character.codePointAt(0)?.toString(16)).filter(Boolean).join('-');
  return encoded ? `provider-${encoded}` : 'provider';
}

function providerModels(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function providerProtocols(value: ApiRecord): ProviderProtocol[] {
  const values = Array.isArray(value.protocols) && value.protocols.length
    ? value.protocols.map(String)
    : [textValue(value.protocol ?? value.family) || 'openai'];
  return protocols.map((item) => item.value).filter((protocol) => values.includes(protocol));
}

function providerProtocolUrl(value: ApiRecord, protocol: ProviderProtocol) {
  const base = recordValue(recordValue(value.protocol_bases)[protocol]);
  const direct = textValue(base.base_url || recordValue(value.protocolBases)[protocol]);
  const primary = providerProtocols(value)[0];
  return direct || (protocol === primary ? textValue(value.base_url) : '');
}

function normalizedUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function ProviderField({ label, value, placeholder, onChangeText }: { label: string; value: string; placeholder?: string; onChangeText: (value: string) => void }) {
  const colors = useAppTheme();
  return <View style={{ gap: 7 }}>
    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontSize: 13 }} />
  </View>;
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text><Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{detail}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>;
}

function ProviderForm({ value, onChange, mode }: { value: ApiRecord; onChange: (value: ApiRecord) => void; mode: 'create' | 'edit' }) {
  const colors = useAppTheme();
  const [modelDraft, setModelDraft] = useState('');
  const [advanced, setAdvanced] = useState(Boolean(value.cloudflare_tls || value.pooled_upstream || value.count_tokens_upstream || textValue(value.route_prefix)));
  const displayName = textValue(value.display_name);
  const identifier = mode === 'edit' ? textValue(value.name) : providerIdentifier(displayName);
  const selectedProtocols = providerProtocols(value);
  const models = providerModels(value.models);
  const update = (key: string, next: unknown) => onChange({ ...value, [key]: next });

  const setProtocolUrl = (protocol: ProviderProtocol, url: string) => {
    const bases = { ...recordValue(value.protocol_bases), [protocol]: { base_url: url } };
    onChange({ ...value, protocol_bases: bases });
  };
  const toggleProtocol = (protocol: ProviderProtocol) => {
    const selected = selectedProtocols.includes(protocol);
    const next = selected ? selectedProtocols.filter((item) => item !== protocol) : [...selectedProtocols, protocol];
    onChange({ ...value, protocols: next, protocol: next[0] ?? '' });
  };
  const addModels = () => {
    const additions = providerModels(modelDraft);
    if (!additions.length) return;
    update('models', Array.from(new Set([...models, ...additions])));
    setModelDraft('');
  };

  return <View style={{ gap: 14 }}>
    {mode === 'edit' ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, padding: 11, gap: 3 }}><Text style={{ color: colors.text, fontFamily: 'monospace', fontSize: 12, fontWeight: '800' }}>{identifier}</Text><Text style={{ color: colors.subtext, fontSize: 9 }}>标识已用于账号和路由，编辑时不可修改</Text></View> : null}
    <ProviderField label="显示名称" value={displayName} placeholder="比如：智谱备用" onChangeText={(next) => update('display_name', next)} />
    {mode === 'create' ? <View style={{ paddingHorizontal: 2, gap: 3 }}><Text style={{ color: colors.subtext, fontSize: 10 }}>标识 <Text style={{ color: colors.primary, fontFamily: 'monospace', fontWeight: '700' }}>{identifier}</Text></Text><Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 15 }}>根据显示名称自动生成，用于路由，创建后不可修改。</Text></View> : null}

    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>协议与地址</Text>
      {protocols.map(({ value: protocol, label }) => {
        const selected = selectedProtocols.includes(protocol);
        return <View key={protocol} style={{ gap: 6 }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleProtocol(protocol)} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selected ? <CheckCircle2 color={colors.primary} size={18} /> : <Square color={colors.disabled} size={18} />}
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
          </Pressable>
          <TextInput editable={selected} value={providerProtocolUrl(value, protocol)} onChangeText={(next) => setProtocolUrl(protocol, next)} placeholder={selected ? 'https://api.example.com' : '勾选后可填写'} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: selected ? colors.card : colors.mutedCard, color: selected ? colors.text : colors.subtext, paddingHorizontal: 12, fontSize: 12, fontFamily: 'monospace', opacity: selected ? 1 : 0.6 }} />
        </View>;
      })}
      <Text style={{ color: colors.subtext, fontSize: 9, lineHeight: 14 }}>可同时启用多个兼容协议，并为每个协议配置独立地址。</Text>
    </View>

    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>模型列表</Text>
      <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingLeft: 12, flexDirection: 'row', alignItems: 'center' }}><TextInput value={modelDraft} onChangeText={setModelDraft} onSubmitEditing={addModels} returnKeyType="done" placeholder="输入模型 ID，回车添加" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 9 }} /><Pressable accessibilityLabel="添加模型" onPress={addModels} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Plus color={colors.primary} size={17} /></Pressable></View>
      {models.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{models.map((model) => <View key={model} style={{ minHeight: 32, maxWidth: '100%', paddingLeft: 10, borderRadius: 10, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Text numberOfLines={1} style={{ maxWidth: 230, color: colors.primary, fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }}>{model}</Text><Pressable accessibilityLabel={`移除模型 ${model}`} onPress={() => update('models', models.filter((item) => item !== model))} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}><X color={colors.primary} size={13} /></Pressable></View>)}</View> : <Text style={{ color: colors.subtext, fontSize: 9 }}>留空时由上游模型接口自动收录。</Text>}
    </View>

    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
      <Pressable onPress={() => setAdvanced((current) => !current)} style={{ minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>高级选项</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>{advanced ? '收起' : '展开'}</Text>{advanced ? <ChevronUp color={colors.subtext} size={15} /> : <ChevronDown color={colors.subtext} size={15} />}</Pressable>
      {advanced ? <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.rowBorder, gap: 8 }}>
        <ToggleRow label="Cloudflare TLS" detail="上游位于 Cloudflare 后且 TLS 握手异常时启用。" value={value.cloudflare_tls === true} onChange={(next) => update('cloudflare_tls', next)} />
        <ToggleRow label="中转号池" detail="上游是 new-api 一类号池时启用。" value={value.pooled_upstream === true} onChange={(next) => update('pooled_upstream', next)} />
        {selectedProtocols.includes('anthropic') ? <ToggleRow label="上游 Token 计数" detail="让 Anthropic 上游负责计算输入 Token。" value={value.count_tokens_upstream === true} onChange={(next) => update('count_tokens_upstream', next)} /> : null}
        <ProviderField label="路由前缀" value={textValue(value.route_prefix)} placeholder={identifier || 'pool-a'} onChangeText={(next) => update('route_prefix', next)} />
      </View> : null}
    </View>
  </View>;
}

function protocolBasesPayload(value: ApiRecord) {
  const result: ApiRecord = {};
  for (const protocol of providerProtocols(value)) {
    const url = normalizedUrl(providerProtocolUrl(value, protocol));
    if (url) result[protocol] = { base_url: url };
  }
  return result;
}

function providerPayload(value: ApiRecord, create: boolean): ApiRecord {
  const selected = providerProtocols(value);
  const bases = protocolBasesPayload(value);
  const primary = selected[0] ?? 'openai';
  const payload: ApiRecord = {
    display_name: textValue(value.display_name).trim(),
    base_url: textValue(recordValue(bases[primary]).base_url),
    protocol: primary,
    protocols: selected,
    protocol_bases: bases,
    route_prefix: textValue(value.route_prefix).trim().toLowerCase(),
    models: providerModels(value.models),
    cloudflare_tls: value.cloudflare_tls === true,
    pooled_upstream: value.pooled_upstream === true,
    count_tokens_upstream: value.count_tokens_upstream === true,
  };
  if (create) payload.name = providerIdentifier(textValue(value.display_name));
  return payload;
}

function validateProvider(value: ApiRecord) {
  if (!textValue(value.display_name).trim()) return '请输入显示名称';
  const selected = providerProtocols(value);
  if (!selected.length) return '请至少启用一种协议';
  for (const protocol of selected) {
    const url = providerProtocolUrl(value, protocol).trim();
    if (!url) return `请填写${protocol === 'openai' ? ' OpenAI' : ' Claude'} 上游地址`;
    if (!/^https?:\/\//i.test(url)) return '上游地址必须以 http:// 或 https:// 开头';
  }
  const prefix = textValue(value.route_prefix).trim();
  if (prefix && !/^[a-z0-9][a-z0-9_-]*$/i.test(prefix)) return '路由前缀只能包含字母、数字、下划线和连字符';
  return undefined;
}

function providerFormValue(item: ApiRecord): ApiRecord {
  const selected = providerProtocols(item);
  const bases: ApiRecord = {};
  for (const protocol of selected) bases[protocol] = { base_url: providerProtocolUrl(item, protocol) };
  return {
    name: item.name ?? '',
    display_name: item.display_name ?? item.name ?? '',
    protocols: selected,
    protocol: selected[0] ?? 'openai',
    protocol_bases: bases,
    base_url: item.base_url ?? '',
    models: providerModels(item.models),
    route_prefix: item.route_prefix ?? '',
    cloudflare_tls: item.cloudflare_tls === true,
    pooled_upstream: item.pooled_upstream === true || item.relay === true,
    count_tokens_upstream: item.count_tokens_upstream === true,
  };
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
    titleOf={(item) => String(item.display_name ?? item.name ?? providerId(item) ?? 'Provider')}
    subtitleOf={(item) => `${providerProtocols(item).join(' / ')}${item.base_url ? ` · ${item.base_url}` : ''}${item.route_prefix ? ` · 前缀 ${item.route_prefix}` : ''}`}
    badgeOf={(item) => item.enabled === false ? { text: '停用', tone: 'muted' } : { text: '启用', tone: 'success' }}
    headerActions={[
      { key: 'builtin', label: '内置 Providers', run: () => apiJson('/admin/providers/builtin') },
    ]}
    actions={[
      { key: 'builtin-models', label: '内置模型', run: (item) => apiJson(`/admin/providers/builtin/${encodeURIComponent(String(item.name ?? providerId(item)))}/models`) },
      { key: 'route-prefix', label: '保存路由前缀', run: (item) => apiJson(`/admin/providers/builtin/${encodeURIComponent(String(item.name ?? providerId(item)))}/route-prefix`, { method: 'PUT', body: JSON.stringify({ route_prefix: item.route_prefix ?? '' }) }) },
      { key: 'quota-test', label: '额度查询测试', run: (item) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}/quota-test`, { method: 'POST', body: '{}', timeoutMs: 60000 }) },
    ]}
    create={{
      label: '新建提供商',
      note: '填写上游名称和地址；密钥请在提供商创建后到账户导入页绑定。',
      template: { display_name: '', protocols: ['openai'], protocol: 'openai', protocol_bases: { openai: { base_url: '' } }, models: [], route_prefix: '', cloudflare_tls: false, pooled_upstream: false, count_tokens_upstream: false },
      renderForm: (props) => <ProviderForm {...props} />,
      validate: validateProvider,
      submitLabel: '创建提供商',
      run: (value) => apiJson('/admin/providers', { method: 'POST', body: JSON.stringify(providerPayload(value, true)) }),
    }}
    edit={{
      pick: providerFormValue,
      renderForm: (props) => <ProviderForm {...props} />,
      validate: validateProvider,
      submitLabel: '保存修改',
      run: (item, value) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}`, { method: 'PUT', body: JSON.stringify(providerPayload(value, false)) }),
    }}
    remove={{
      confirm: (item) => `确定删除 Provider「${item.display_name ?? item.name ?? providerId(item)}」吗？`,
      run: (item) => apiJson(`/admin/providers/${encodeURIComponent(providerId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
