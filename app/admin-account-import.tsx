import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  FileUp,
  KeyRound,
  Link2,
  Play,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { StructuredDataView } from '@/src/components/structured-form';
import { ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { apiJson, firstArray } from '@/src/lib/api';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type Method = 'oauth' | 'api_key' | 'token' | 'sso' | 'iam';
type Provider = {
  key: string;
  label: string;
  mark: string;
  color: string;
  methods: Method[];
  group: 'oauth' | 'credential';
};
type QueryRecord = Record<string, string | number | boolean | null | undefined>;
type FlowCall = { action: 'start' | 'poll' | 'submit' | 'direct'; path: string; method: 'GET' | 'POST'; body?: ApiRecord; query?: QueryRecord };

const providers: Provider[] = [
  { key: 'anthropic', label: 'Claude', mark: 'C', color: '#d97757', methods: ['oauth', 'token'], group: 'oauth' },
  { key: 'openai', label: 'OpenAI', mark: 'O', color: '#111827', methods: ['oauth', 'api_key'], group: 'oauth' },
  { key: 'antigravity', label: 'Antigravity', mark: 'A', color: '#5b6cff', methods: ['oauth', 'token'], group: 'oauth' },
  { key: 'xai', label: 'Grok', mark: 'G', color: '#111111', methods: ['oauth', 'api_key'], group: 'oauth' },
  { key: 'kiro', label: 'Kiro', mark: 'K', color: '#7c3aed', methods: ['oauth', 'sso', 'iam', 'api_key', 'token'], group: 'oauth' },
  { key: 'moonshot', label: 'Kimi', mark: 'K', color: '#111111', methods: ['oauth', 'token'], group: 'oauth' },
  { key: 'qoder', label: 'Qoder', mark: 'Q', color: '#22c55e', methods: ['oauth', 'token'], group: 'oauth' },
  { key: 'workbuddy', label: 'WorkBuddy', mark: 'W', color: '#6366f1', methods: ['oauth', 'token'], group: 'oauth' },
  { key: 'gemini', label: 'Google AI Studio', mark: 'G', color: '#4285f4', methods: ['api_key'], group: 'credential' },
  { key: 'cursor', label: 'Cursor', mark: 'C', color: '#111111', methods: ['token'], group: 'credential' },
  { key: 'qwen', label: '千问 Token Plan', mark: '千', color: '#635bdb', methods: ['token'], group: 'credential' },
  { key: 'doubao', label: '火山方舟 Agent Plan', mark: '火', color: '#1677ff', methods: ['token'], group: 'credential' },
  { key: 'deepseek', label: 'DeepSeek', mark: 'D', color: '#4f64ff', methods: ['api_key'], group: 'credential' },
  { key: 'zhipu', label: 'Zhipu', mark: 'Z', color: '#315efb', methods: ['api_key'], group: 'credential' },
  { key: 'mimo', label: 'Xiaomi MiMo', mark: 'M', color: '#ff6900', methods: ['api_key'], group: 'credential' },
  { key: 'minimax', label: 'MiniMax', mark: 'M', color: '#e83e73', methods: ['api_key'], group: 'credential' },
  { key: 'opencode', label: 'OpenCode Zen', mark: 'O', color: '#111111', methods: ['token'], group: 'credential' },
];

const methodLabels: Record<Method, string> = {
  oauth: '一键登录',
  api_key: 'API Key',
  token: 'Token',
  sso: 'Builder ID',
  iam: 'IAM SSO',
};

function nestedString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as ApiRecord;
  for (const key of keys) {
    if (typeof record[key] === 'string' && String(record[key]).trim()) return String(record[key]);
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') {
      const found = nestedString(child, keys);
      if (found) return found;
    }
  }
  return '';
}

function nestedRecords(value: unknown, keys: string[]): ApiRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as ApiRecord;
  for (const key of keys) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((item): item is ApiRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }
  for (const child of Object.values(record)) {
    const found = nestedRecords(child, keys);
    if (found.length) return found;
  }
  return [];
}

function ProviderMark({ provider, size = 42 }: { provider: Provider; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: provider.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '900' }}>{provider.mark}</Text></View>;
}

function ProviderCard({ provider, basis, onPress }: { provider: Provider; basis: `${number}%`; onPress: () => void }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: basis, minWidth: 0, minHeight: 100, borderRadius: 18, borderWidth: 1, borderColor: pressed ? colors.primary : colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 9, opacity: pressed ? 0.7 : 1 })}>
    <ProviderMark provider={provider} />
    <Text numberOfLines={2} style={{ maxWidth: '92%', color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' }}>{provider.label}</Text>
  </Pressable>;
}

function CredentialField({ label, value, onChangeText, secure = false, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; placeholder?: string }) {
  const colors = useAppTheme();
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: 7 }}>
    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    <View>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} secureTextEntry={secure && !visible} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingRight: secure ? 46 : 12, color: colors.text, fontSize: 14 }} />
      {secure ? <Pressable accessibilityLabel={visible ? '隐藏凭据' : '显示凭据'} onPress={() => setVisible((current) => !current)} style={{ position: 'absolute', right: 4, top: 3, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>{visible ? <EyeOff color={colors.subtext} size={16} /> : <Eye color={colors.subtext} size={16} />}</Pressable> : null}
    </View>
  </View>;
}

function multipartBody(asset: DocumentPickerAsset) {
  if (typeof FormData === 'undefined') throw new Error('当前设备不支持文件上传');
  const data = new FormData();
  data.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/json' } as unknown as Blob);
  return data;
}

export default function AdminAccountImportScreen() {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const cardBasis: `${number}%` = width >= 760 ? '22%' : width >= 390 ? '47%' : '100%';
  const [selected, setSelected] = useState<Provider>();
  const [method, setMethod] = useState<Method>('oauth');
  const [proxyId, setProxyId] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [result, setResult] = useState<unknown>();
  const [showRaw, setShowRaw] = useState(false);
  const [file, setFile] = useState<DocumentPickerAsset>();

  const proxies = useQuery({
    queryKey: ['admin', 'proxies', 'import-options'],
    queryFn: async ({ signal }) => firstArray<ApiRecord>(await apiJson('/admin/proxies', { signal }), ['proxies', 'items', 'data', 'list']),
    retry: 0,
  });

  const flow = useMutation({
    mutationFn: ({ path, method: httpMethod, body, query }: FlowCall) => apiJson<ApiRecord>(path, { method: httpMethod, body: httpMethod === 'POST' ? JSON.stringify(body ?? {}) : undefined, query, timeoutMs: 60000 }),
    onSuccess: (payload) => {
      setResult(payload);
      const nextSession = nestedString(payload, ['session_id', 'sessionId', 'state', 'flow_id', 'flowId']);
      if (nextSession) setSessionId(nextSession);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] });
    },
    onError: (error) => Alert.alert('接入失败', error.message),
  });

  const fileImport = useMutation({
    mutationFn: ({ asset, dryRun }: { asset: DocumentPickerAsset; dryRun: boolean }) => apiJson<ApiRecord>('/admin/accounts/import', { method: 'POST', body: multipartBody(asset), query: { dry_run: dryRun ? 1 : undefined }, timeoutMs: 120000 }),
    onSuccess: (payload, variables) => {
      setResult(payload);
      Alert.alert(variables.dryRun ? '检查完成' : '导入完成', variables.dryRun ? '文件格式检查已完成，请确认结果后正式导入。' : '账号文件已提交。');
      if (!variables.dryRun) void queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] });
    },
    onError: (error) => Alert.alert('文件导入失败', error.message),
  });

  const authUrl = nestedString(result, ['auth_url', 'authorization_url', 'verification_uri_complete', 'verification_uri', 'url']);
  const userCode = nestedString(result, ['user_code', 'device_code', 'code']);
  const status = nestedString(result, ['status', 'state', 'message']);
  const profiles = nestedRecords(result, ['profiles', 'accounts']);
  const proxyPayload = proxyId ? { proxy_id: proxyId } : {};

  function chooseProvider(provider: Provider) {
    setSelected(provider);
    setMethod(provider.methods[0]);
    setLabel('');
    setSecret('');
    setSessionId('');
    setVerificationCode('');
    setResult(undefined);
    setShowRaw(false);
  }

  function startFlow() {
    if (!selected) return;
    if (selected.key === 'kiro') {
      if (method === 'oauth') return flow.mutate({ action: 'start', path: '/admin/accounts/oauth/kiro/start', method: 'GET', query: proxyId ? { proxy_id: proxyId } : undefined });
      if (method === 'sso') return flow.mutate({ action: 'start', path: '/admin/accounts/kiro/sso/start', method: 'POST', body: proxyPayload });
      if (method === 'iam') return flow.mutate({ action: 'start', path: '/admin/accounts/kiro/iam-sso/start', method: 'POST', body: proxyPayload });
    }
    flow.mutate({ action: 'start', path: `/admin/accounts/oauth/${encodeURIComponent(selected.key)}/start`, method: 'POST', body: proxyPayload });
  }

  function pollFlow() {
    if (!selected) return;
    const query = sessionId ? { session_id: sessionId } : undefined;
    if (selected.key === 'kiro' && method === 'oauth') return flow.mutate({ action: 'poll', path: '/admin/accounts/oauth/kiro/poll', method: 'GET', query });
    if (selected.key === 'kiro' && method === 'sso') return flow.mutate({ action: 'poll', path: '/admin/accounts/kiro/sso/poll', method: 'GET', query });
    flow.mutate({ action: 'poll', path: `/admin/accounts/oauth/${encodeURIComponent(selected.key)}/poll`, method: 'GET', query });
  }

  function submitFlow() {
    if (!selected) return;
    const body = { ...proxyPayload, session_id: sessionId || undefined, code: verificationCode.trim() || undefined };
    if (selected.key === 'kiro' && method === 'sso') return flow.mutate({ action: 'submit', path: '/admin/accounts/kiro/sso/submit', method: 'POST', body });
    if (selected.key === 'kiro' && method === 'iam') return flow.mutate({ action: 'submit', path: '/admin/accounts/kiro/iam-sso/complete', method: 'POST', body });
    flow.mutate({ action: 'submit', path: `/admin/accounts/oauth/${encodeURIComponent(selected.key)}/submit`, method: 'POST', body });
  }

  function submitCredential() {
    if (!selected || !secret.trim()) return;
    const field = method === 'api_key' ? 'api_key' : 'token';
    const body: ApiRecord = { ...proxyPayload, provider: selected.key, label: label.trim() || selected.label, [field]: secret.trim(), enabled: true };
    if (selected.key === 'kiro') {
      const path = method === 'api_key' ? '/admin/accounts/kiro/api-key' : '/admin/accounts/kiro/sso-token';
      return flow.mutate({ action: 'direct', path, method: 'POST', body });
    }
    flow.mutate({ action: 'direct', path: '/admin/accounts', method: 'POST', body });
  }

  function selectKiroProfile(profile: ApiRecord) {
    const profileValue = profile.id ?? profile.profile_id ?? profile.name ?? profile.email;
    flow.mutate({ action: 'submit', path: '/admin/accounts/kiro/sso/select-profile', method: 'POST', body: { ...proxyPayload, session_id: sessionId || undefined, profile: profileValue, profile_id: profile.id ?? profile.profile_id } });
  }

  async function chooseFile() {
    const selection = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/csv', 'text/plain'], copyToCacheDirectory: true, multiple: false });
    if (!selection.canceled && selection.assets[0]) setFile(selection.assets[0]);
  }

  const proxyOptions = useMemo(() => proxies.data ?? [], [proxies.data]);
  const oauthProviders = providers.filter((provider) => provider.group === 'oauth');
  const credentialProviders = providers.filter((provider) => provider.group === 'credential');
  const oauthMethod = method === 'oauth' || method === 'sso' || method === 'iam';

  return <Page title={selected ? `接入 ${selected.label}` : '选择提供商'} subtitle={selected ? '选择接入方式并完成授权' : '添加一个新的上游账号'} icon={selected ? KeyRound : CloudDownload} safeTop={false} contentMaxWidth={920} refreshing={flow.isPending || fileImport.isPending}>
    {selected ? <Pressable onPress={() => setSelected(undefined)} style={{ alignSelf: 'flex-start', minHeight: 38, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 }}><ArrowLeft color={colors.text} size={16} /><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>重新选择</Text></Pressable> : null}

    {!selected ? <>
      <View style={{ gap: 10 }}>
        <SectionHeader icon={Link2} title="一键登录" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{oauthProviders.map((provider) => <ProviderCard key={provider.key} provider={provider} basis={cardBasis} onPress={() => chooseProvider(provider)} />)}</View>
      </View>
      <View style={{ gap: 10 }}>
        <SectionHeader icon={KeyRound} title="粘贴令牌接入" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{credentialProviders.map((provider) => <ProviderCard key={provider.key} provider={provider} basis={cardBasis} onPress={() => chooseProvider(provider)} />)}</View>
      </View>
      <Panel>
        <SectionHeader icon={FileJson} title="批量文件" />
        <Pressable onPress={() => void chooseFile()} style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: file ? colors.success : colors.border, backgroundColor: colors.mutedCard, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }}><FileUp color={file ? colors.success : colors.primary} size={17} /><Text numberOfLines={1} style={{ flex: 1, color: file ? colors.text : colors.subtext, fontSize: 12 }}>{file ? `${file.name}${file.size ? ` · ${file.size} bytes` : ''}` : '选择 JSON、CSV 或文本文件'}</Text></Pressable>
        {file ? <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable disabled={fileImport.isPending} onPress={() => fileImport.mutate({ asset: file, dryRun: true })} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>先检查文件</Text></Pressable>
          <Pressable disabled={fileImport.isPending} onPress={() => fileImport.mutate({ asset: file, dryRun: false })} style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>正式导入</Text></Pressable>
        </View> : null}
      </Panel>
    </> : <>
      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 }}><ProviderMark provider={selected} size={50} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{selected.label}</Text><Text style={{ color: colors.subtext, fontSize: 11, marginTop: 3 }}>{methodLabels[method]}</Text></View></View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 4, borderRadius: 10, backgroundColor: colors.mutedCard }}>
        {selected.methods.map((item) => <Pressable key={item} onPress={() => { setMethod(item); setResult(undefined); setSessionId(''); }} style={{ flexGrow: 1, minHeight: 38, paddingHorizontal: 10, borderRadius: 7, backgroundColor: method === item ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: method === item ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{methodLabels[item]}</Text></Pressable>)}
      </View>

      <Panel>
        <SectionHeader icon={Server} title="网络出口" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          <Pressable onPress={() => setProxyId('')} style={{ minHeight: 36, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: !proxyId ? colors.primary : colors.border, backgroundColor: !proxyId ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: !proxyId ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>默认网络</Text></Pressable>
          {proxyOptions.map((proxy, index) => { const id = String(proxy.id ?? proxy.name ?? index); const active = proxyId === id; return <Pressable key={id} onPress={() => setProxyId(id)} style={{ minHeight: 36, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: active ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{String(proxy.name ?? `${proxy.host ?? ''}:${proxy.port ?? ''}`)}</Text></Pressable>; })}
        </View>
      </Panel>

      {oauthMethod ? <Panel>
        <SectionHeader icon={ShieldCheck} title={methodLabels[method]} />
        {sessionId ? <CredentialField label="授权会话" value={sessionId} onChangeText={setSessionId} placeholder="自动获取" /> : null}
        {(sessionId || result !== undefined) ? <CredentialField label="验证码（按需填写）" value={verificationCode} onChangeText={setVerificationCode} placeholder="授权页面未自动回传时填写" /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable disabled={flow.isPending} onPress={startFlow} style={{ flexGrow: 1, minHeight: 44, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{flow.isPending ? <ActivityIndicator color="#fff" /> : <Play color="#fff" size={15} />}<Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>开始授权</Text></Pressable>
          {method !== 'iam' ? <Pressable disabled={flow.isPending || !result} onPress={pollFlow} style={{ flexGrow: 1, minHeight: 44, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: result ? 1 : 0.45 }}><RefreshCw color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>检查状态</Text></Pressable> : null}
          <Pressable disabled={flow.isPending || !result} onPress={submitFlow} style={{ flexGrow: 1, minHeight: 44, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: result ? 1 : 0.45 }}><Send color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>{method === 'iam' ? '完成接入' : '提交授权'}</Text></Pressable>
        </View>
      </Panel> : <Panel>
        <SectionHeader icon={KeyRound} title={methodLabels[method]} />
        <CredentialField label="账号名称（可选）" value={label} onChangeText={setLabel} placeholder={selected.label} />
        <CredentialField label={method === 'api_key' ? 'API Key' : 'Token'} value={secret} onChangeText={setSecret} secure placeholder="粘贴凭据" />
        <Pressable disabled={flow.isPending || !secret.trim()} onPress={submitCredential} style={{ minHeight: 46, borderRadius: 12, backgroundColor: secret.trim() ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>{flow.isPending ? <ActivityIndicator color="#fff" /> : <KeyRound color="#fff" size={16} />}<Text style={{ color: '#fff', fontWeight: '800' }}>添加账号</Text></Pressable>
      </Panel>}
    </>}

    {flow.error ? <ErrorState message={flow.error.message} retry={selected ? (oauthMethod ? startFlow : submitCredential) : undefined} /> : null}
    {result !== undefined ? <Panel>
      <SectionHeader icon={CheckCircle2} title="接入状态" />
      {status ? <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>{status}</Text> : null}
      {userCode ? <View style={{ borderRadius: 14, backgroundColor: colors.mutedCard, padding: 12 }}><Text style={{ color: colors.subtext, fontSize: 10 }}>授权码</Text><Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 }}>{userCode}</Text></View> : null}
      {selected?.key === 'kiro' && profiles.length ? <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>选择 Profile</Text>{profiles.map((profile, index) => <Pressable key={String(profile.id ?? profile.profile_id ?? index)} onPress={() => selectKiroProfile(profile)} style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>{String(profile.name ?? profile.email ?? profile.id ?? `Profile ${index + 1}`)}</Text><Send color={colors.primary} size={14} /></Pressable>)}</View> : null}
      {authUrl ? <Pressable onPress={() => void Linking.openURL(authUrl)} style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><ExternalLink color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>打开授权页面</Text></Pressable> : null}
      <Pressable onPress={() => setShowRaw((value) => !value)} style={{ minHeight: 38, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '700' }}>{showRaw ? '收起详细响应' : '查看详细响应'}</Text></Pressable>
      {showRaw ? <StructuredDataView value={result} /> : null}
    </Panel> : null}
  </Page>;
}
