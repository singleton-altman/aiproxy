import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  KeySquare,
  Plus,
  Save,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, Page, Panel, SearchField, SectionHeader, SheetHandle } from '@/src/components/ui';
import { apiJson } from '@/src/lib/api';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type ScopeDefinition = {
  scope: string;
  group: string;
  destructive: boolean;
  rules: string[];
};

type ManagementToken = ApiRecord & {
  id?: string | number;
  name?: string;
  token?: string;
  token_prefix?: string;
  scopes?: string[];
  created_at?: string;
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type TokenDirectory = {
  tokens: ManagementToken[];
  scopeCatalog: ScopeDefinition[];
  groups: string[];
};

const FALLBACK_SCOPES: ScopeDefinition[] = [
  { scope: 'full', group: '*', destructive: true, rules: ['/admin/*'] },
  { scope: 'accounts:read', group: 'accounts', destructive: false, rules: ['GET /admin/accounts'] },
  { scope: 'accounts:create', group: 'accounts', destructive: false, rules: ['POST /admin/accounts'] },
  { scope: 'accounts:import', group: 'accounts', destructive: false, rules: ['POST /admin/accounts/import'] },
  { scope: 'accounts:export', group: 'accounts', destructive: true, rules: ['POST /admin/accounts/export'] },
  { scope: 'accounts:update', group: 'accounts', destructive: true, rules: ['PUT /admin/accounts/:id'] },
  { scope: 'accounts:delete', group: 'accounts', destructive: true, rules: ['DELETE /admin/accounts/:id'] },
  { scope: 'accounts:recover', group: 'accounts', destructive: false, rules: ['POST /admin/accounts/:id/recover'] },
  { scope: 'accounts:oauth', group: 'accounts', destructive: false, rules: ['POST /admin/accounts/oauth/*'] },
  { scope: 'system:read', group: 'system', destructive: false, rules: ['GET /admin/system/*'] },
  { scope: 'system:restart', group: 'system', destructive: true, rules: ['POST /admin/system/restart'] },
];

const SCOPE_LABELS: Record<string, string> = {
  full: '完整管理权限',
  'accounts:read': '查看账号池',
  'accounts:create': '添加单个账号',
  'accounts:import': '批量导入账号',
  'accounts:export': '导出账号（含凭证）',
  'accounts:update': '修改账号',
  'accounts:delete': '删除账号',
  'accounts:recover': '恢复账号调度',
  'accounts:oauth': 'OAuth 登录添加账号',
  'accounts:kiro_sso': '用 SSO 登录添加 Kiro 账号',
  'accounts:kiro_import': '添加 Kiro 令牌与 API 密钥',
  'accounts:models:read': '查看账号可用模型',
  'accounts:models:test': '用账号发测试请求',
  'accounts:quota:reset': '消耗 Codex 重置券',
  'users:read': '查看用户',
  'users:write': '修改用户',
  'users:delete': '删除用户',
  'users:balance': '调整用户余额',
  'invites:read': '查看邀请码',
  'invites:redemptions:read': '查看邀请码使用记录',
  'invites:write': '创建和修改邀请码',
  'invites:delete': '删除邀请码',
  'plans:read': '查看套餐',
  'plans:write': '创建和修改套餐',
  'plans:delete': '删除套餐',
  'plans:assign': '给用户开通套餐',
  'providers:read': '查看提供商',
  'providers:write': '创建和修改提供商',
  'providers:delete': '删除提供商',
  'providers:quota:test': '测试提供商配额查询',
  'providers:models:fetch': '向提供商拉取模型列表',
  'proxies:read': '查看代理',
  'proxies:write': '创建和修改代理',
  'proxies:delete': '删除代理',
  'proxies:test': '测试代理是否可用',
  'quota:read': '查看剩余配额',
  'quota:refresh': '刷新整个账号池配额',
  'catalog:read': '查看模型列表',
  'catalog:write': '修改模型与价格',
  'catalog:delete': '删除模型',
  'catalog:sync': '从公共注册表同步价格',
  'catalog:probe': '用所有账号探测可用模型',
  'stats:read': '查看用量图表与汇总',
  'usage:read': '查看用量明细',
  'usage:export': '导出整个用量账本',
  'logs:read': '查看请求日志',
  'logs:app:read': '查看并跟踪服务日志',
  'config:read': '查看服务配置',
  'config:validate': '校验配置草稿',
  'config:write': '修改服务配置',
  'email:read': '查看邮件设置与预览',
  'email:write': '修改邮件设置',
  'email:send_test': '发送测试邮件',
  'system:read': '查看服务信息与可用更新',
  'system:update': '安装服务更新',
  'system:update_settings': '开关无人值守自动更新',
  'system:restart': '重启服务',
  'system:rollback': '回滚到上一个版本',
};

const GROUP_LABELS: Record<string, string> = {
  '*': '全部',
  accounts: '账号',
  users: '用户',
  invites: '邀请码',
  plans: '套餐',
  providers: '提供商',
  proxies: '代理',
  quota: '配额',
  catalog: '模型',
  stats: '用量与统计',
  logs: '日志',
  config: '配置',
  email: '邮件',
  system: '服务',
};

function recordOf(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function recordsOf(value: unknown): ApiRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ApiRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function normalizeDirectory(payload: unknown): TokenDirectory {
  const outer = recordOf(payload);
  const data = recordOf(outer.data);
  const root = Object.keys(data).length ? { ...outer, ...data } : outer;
  const directTokens = recordsOf(payload);
  const tokenValues = directTokens.length ? directTokens : recordsOf(root.tokens ?? root.items ?? root.list);
  const catalogValues = recordsOf(root.scope_catalog ?? root.scopeCatalog ?? root.scopes);
  const scopeCatalog = catalogValues.map((item) => ({
    scope: String(item.scope ?? item.id ?? '').trim(),
    group: String(item.group ?? '*').trim() || '*',
    destructive: item.destructive === true,
    rules: Array.isArray(item.rules) ? item.rules.map(String) : [],
  })).filter((item) => item.scope);
  const catalog = scopeCatalog.length ? scopeCatalog : FALLBACK_SCOPES;
  const suppliedGroups = Array.isArray(root.groups) ? root.groups.map(String).filter(Boolean) : [];
  const groups = Array.from(new Set([...suppliedGroups, ...catalog.map((item) => item.group)]));
  return { tokens: tokenValues as ManagementToken[], scopeCatalog: catalog, groups };
}

function tokenId(item: ManagementToken) {
  return String(item.id ?? '');
}

function tokenPrefix(item: ManagementToken) {
  const prefix = String(item.token_prefix ?? item.prefix ?? '').trim().replace(/\.+$/, '');
  const value = prefix || String(item.token ?? '').trim().slice(0, 12);
  return value ? `${value}...` : '未返回前缀';
}

function tokenStatus(item: ManagementToken) {
  if (item.revoked_at) return 'revoked' as const;
  if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) return 'expired' as const;
  return 'active' as const;
}

function formatDate(value: unknown, includeTime = false) {
  if (!value) return '--';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', includeTime
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function scopeLabel(scope: string) {
  return SCOPE_LABELS[scope] ?? scope;
}

function groupLabel(group: string) {
  return GROUP_LABELS[group] ?? group;
}

function extractCreatedToken(value: unknown, depth = 0): string {
  if (depth > 3) return '';
  const record = recordOf(value);
  for (const key of ['token', 'secret', 'management_token']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  for (const key of ['data', 'item', 'credential']) {
    const candidate = extractCreatedToken(record[key], depth + 1);
    if (candidate) return candidate;
  }
  return '';
}

function relaySecretOf(value: unknown) {
  const outer = recordOf(value);
  const root = Object.keys(recordOf(outer.data)).length ? recordOf(outer.data) : outer;
  const oauth = recordOf(root.oauth);
  return typeof oauth.relay_secret === 'string' ? oauth.relay_secret : '';
}

function sameScopes(left: string[], right: string[]) {
  return left.length === right.length && left.every((scope) => right.includes(scope));
}

function expirationIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) throw new Error('有效期格式应为 YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('有效期日期无效');
  }
  return date.toISOString();
}

export default function AdminTokensScreen() {
  const colors = useAppTheme();
  const { height } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['accounts:create']);
  const [expiresAt, setExpiresAt] = useState('');
  const [expandedScope, setExpandedScope] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [copied, setCopied] = useState('');
  const [relayDraft, setRelayDraft] = useState<string>();
  const [relayVisible, setRelayVisible] = useState(false);
  const [relayNeedsRestart, setRelayNeedsRestart] = useState(false);
  const relaySourceRef = useRef<string | undefined>(undefined);

  const directory = useQuery({
    queryKey: ['admin', 'management-tokens'],
    queryFn: async ({ signal }) => normalizeDirectory(await apiJson('/admin/management-tokens', { signal })),
  });
  const config = useQuery({
    queryKey: ['admin', 'config', 'relay-secret'],
    queryFn: ({ signal }) => apiJson<ApiRecord>('/admin/config', { signal }),
  });

  const sourceRelaySecret = relaySecretOf(config.data);
  useEffect(() => {
    if (!config.data) return;
    const previousSource = relaySourceRef.current;
    setRelayDraft((current) => current === undefined || current === previousSource ? sourceRelaySecret : current);
    relaySourceRef.current = sourceRelaySecret;
  }, [config.data, sourceRelaySecret]);

  const catalog = directory.data?.scopeCatalog ?? FALLBACK_SCOPES;
  const groups = directory.data?.groups ?? Array.from(new Set(catalog.map((item) => item.group)));
  const tokens = directory.data?.tokens ?? [];
  const filteredTokens = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return tokens;
    return tokens.filter((item) => `${item.name ?? ''} ${tokenPrefix(item)} ${(item.scopes ?? []).join(' ')}`.toLowerCase().includes(keyword));
  }, [search, tokens]);

  const presets = useMemo(() => ([
    { id: 'browser', label: '浏览器助手', scopes: ['accounts:create'].filter((scope) => catalog.some((item) => item.scope === scope)), icon: KeyRound },
    { id: 'readonly', label: '只读看板', scopes: catalog.filter((item) => !item.destructive && item.scope.endsWith(':read')).map((item) => item.scope), icon: Eye },
    { id: 'deploy', label: '部署机器人', scopes: ['system:read', 'system:restart'].filter((scope) => catalog.some((item) => item.scope === scope)), icon: Bot },
  ]).filter((preset) => preset.scopes.length), [catalog]);

  const destructiveCount = selectedScopes.filter((scope) => scope !== 'full' && catalog.find((item) => item.scope === scope)?.destructive).length;
  const fullSelected = selectedScopes.includes('full');
  const create = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('请输入令牌名称');
      const expiration = expirationIso(expiresAt);
      return apiJson<ApiRecord>('/admin/management-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, scopes: selectedScopes, expires_at: expiration }),
      });
    },
    onSuccess: (value) => {
      const secret = extractCreatedToken(value);
      setCreateOpen(false);
      setName('');
      setExpiresAt('');
      setSelectedScopes(['accounts:create']);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'management-tokens'] });
      if (secret) setCreatedToken(secret);
      else Alert.alert('创建成功', '服务器没有返回完整令牌，请检查服务端响应。');
    },
    onError: (error) => Alert.alert('创建失败', error.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiJson(`/admin/management-tokens/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'management-tokens'] }),
    onError: (error) => Alert.alert('吊销失败', error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/admin/management-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'management-tokens'] }),
    onError: (error) => Alert.alert('删除失败', error.message),
  });
  const saveRelay = useMutation({
    mutationFn: () => apiJson<ApiRecord>('/admin/config', { method: 'PUT', body: JSON.stringify({ oauth: { relay_secret: relayDraft ?? '' } }) }),
    onSuccess: (value) => {
      const response = { ...recordOf(value), ...recordOf(recordOf(value).data) };
      const needsRestart = response.reload_required === true;
      relaySourceRef.current = relayDraft ?? '';
      setRelayNeedsRestart(needsRestart);
      Alert.alert('已保存', needsRestart ? '配置已写入，需要重启服务后生效。' : '中继密钥配置已更新。');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
    },
    onError: (error) => Alert.alert('保存失败', error.message),
  });

  function openCreate() {
    const initial = catalog.some((item) => item.scope === 'accounts:create')
      ? ['accounts:create']
      : catalog.filter((item) => item.scope !== 'full').slice(0, 1).map((item) => item.scope);
    setName('');
    setExpiresAt('');
    setSelectedScopes(initial);
    setExpandedScope('');
    create.reset();
    setCreateOpen(true);
  }

  function toggleScope(scope: string) {
    if (scope === 'full') {
      setSelectedScopes((current) => current.includes('full') ? [] : ['full']);
      return;
    }
    if (fullSelected) return;
    setSelectedScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  async function copyValue(value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(value);
    setTimeout(() => setCopied((current) => current === value ? '' : current), 1600);
  }

  function confirmRevoke(item: ManagementToken) {
    Alert.alert('吊销令牌', `吊销后，“${String(item.name ?? tokenId(item))}”的调用会立即失效。`, [
      { text: '取消', style: 'cancel' },
      { text: '吊销', style: 'destructive', onPress: () => revoke.mutate(tokenId(item)) },
    ]);
  }

  function confirmDelete(item: ManagementToken) {
    Alert.alert('删除令牌', `确定删除“${String(item.name ?? tokenId(item))}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => remove.mutate(tokenId(item)) },
    ]);
  }

  const inputStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontSize: 13 } as const;
  const sheetHeight = Math.min(760, Math.round(height * 0.9));

  return <Page title="管理令牌" subtitle={`${tokens.length} 项 · 程序访问管理接口的凭证`} icon={KeySquare} safeTop={false} refreshing={directory.isFetching || config.isFetching} onRefresh={() => { void directory.refetch(); void config.refetch(); }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, color: colors.subtext, fontSize: 11, fontWeight: '700' }}>{tokens.length} 个令牌</Text>
      <Pressable onPress={openCreate} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}><Plus color="#fff" size={15} /><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>新建令牌</Text></Pressable>
    </View>
    <SearchField value={search} onChangeText={setSearch} placeholder="搜索名称、前缀或权限" />
    {directory.error ? <ErrorState message={directory.error.message} retry={() => directory.refetch()} /> : null}
    {!directory.isFetching && !filteredTokens.length ? <EmptyState icon={KeySquare} message={search ? '没有匹配的管理令牌' : '暂无管理令牌'} /> : null}

    {filteredTokens.map((item, index) => {
      const status = tokenStatus(item);
      const scopes = Array.isArray(item.scopes) ? item.scopes.map(String) : [];
      const statusText = status === 'active' ? '生效中' : status === 'expired' ? '已过期' : '已吊销';
      const statusColor = status === 'active' ? colors.success : status === 'expired' ? colors.warning : colors.danger;
      const statusBackground = status === 'active' ? colors.successBg : status === 'expired' ? colors.warningBg : colors.dangerBg;
      const scopeText = scopes.length === 1 ? scopeLabel(scopes[0]) : scopes.includes('full') ? scopeLabel('full') : scopes.length ? `${scopes.length} 项权限` : '无权限';
      return <View key={tokenId(item) || `${tokenPrefix(item)}-${index}`} style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <IconTile icon={KeySquare} size={36} iconSize={18} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{String(item.name || tokenId(item) || '令牌')}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9, fontFamily: 'monospace' }}>{tokenPrefix(item)}</Text></View>
          <View style={{ minHeight: 24, paddingHorizontal: 8, borderRadius: 9, backgroundColor: statusBackground, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: statusColor, fontSize: 9, fontWeight: '800' }}>{statusText}</Text></View>
        </View>
        <View style={{ minHeight: 36, borderRadius: 11, backgroundColor: colors.mutedCard, paddingLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}><ShieldCheck color={colors.primary} size={14} /><Pressable disabled={!scopes.length} onPress={() => Alert.alert('权限范围', scopes.map(scopeLabel).join('\n'))} style={{ flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.primary, fontSize: 10, fontWeight: '700' }}>{scopeText}</Text>{scopes.length ? <Info color={colors.subtext} size={12} /> : null}</Pressable>{item.token ? <Pressable accessibilityLabel="复制完整令牌" onPress={() => void copyValue(String(item.token))} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>{copied === item.token ? <Check color={colors.success} size={14} /> : <Copy color={colors.subtext} size={14} />}</Pressable> : <View style={{ width: 6 }} />}</View>
        <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: colors.subtext, fontSize: 8 }}>最后使用</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 10, marginTop: 2 }}>{item.last_used_at ? formatDate(item.last_used_at, true) : '从未使用'}</Text></View><View style={{ flex: 1 }}><Text style={{ color: colors.subtext, fontSize: 8 }}>有效期至</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 10, marginTop: 2 }}>{item.expires_at ? formatDate(item.expires_at) : '永久有效'}</Text></View></View>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {status === 'active' ? <Pressable disabled={revoke.isPending} onPress={() => confirmRevoke(item)} style={{ flex: 1, minHeight: 38, borderRadius: 11, borderWidth: 1, borderColor: colors.warning, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: '800' }}>吊销</Text></Pressable> : null}
          <Pressable disabled={remove.isPending} onPress={() => confirmDelete(item)} style={{ flex: 1, minHeight: 38, borderRadius: 11, backgroundColor: colors.dangerBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Trash2 color={colors.danger} size={13} /><Text style={{ color: colors.danger, fontSize: 11, fontWeight: '800' }}>删除</Text></Pressable>
        </View>
      </View>;
    })}

    <Panel>
      <SectionHeader icon={KeyRound} title="中继密钥" />
      <Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 16 }}>保护公开的 OAuth 回调路由。浏览器扩展会通过 X-Relay-Token 请求头发送相同的值。</Text>
      {config.error ? <ErrorState message={config.error.message} retry={() => config.refetch()} /> : null}
      <View style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }}>
        <TextInput value={relayDraft ?? ''} onChangeText={setRelayDraft} placeholder="留空表示不校验回调密钥" placeholderTextColor={colors.placeholder} secureTextEntry={!relayVisible} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minHeight: 42, paddingHorizontal: 12, color: colors.text, fontSize: 12, fontFamily: 'monospace' }} />
        <Pressable accessibilityLabel={relayVisible ? '隐藏中继密钥' : '显示中继密钥'} onPress={() => setRelayVisible((value) => !value)} style={{ width: 38, height: 42, alignItems: 'center', justifyContent: 'center' }}>{relayVisible ? <EyeOff color={colors.subtext} size={16} /> : <Eye color={colors.subtext} size={16} />}</Pressable>
      </View>
      <Text style={{ color: colors.subtext, fontSize: 9, lineHeight: 14 }}>服务器返回 ******** 时表示保持原值；清空并保存表示删除。本地回调可留空。</Text>
      {relayNeedsRestart ? <View style={{ borderRadius: 11, backgroundColor: colors.warningBg, padding: 9, flexDirection: 'row', gap: 7 }}><AlertTriangle color={colors.warning} size={14} /><Text style={{ flex: 1, color: colors.warning, fontSize: 9, lineHeight: 14 }}>配置已保存到磁盘，需要重启服务后回调路由才会使用新密钥。</Text></View> : null}
      <Pressable disabled={saveRelay.isPending || relayDraft === undefined || relayDraft === sourceRelaySecret} onPress={() => saveRelay.mutate()} style={{ minHeight: 42, borderRadius: 12, backgroundColor: relayDraft !== undefined && relayDraft !== sourceRelaySecret ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{saveRelay.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Save color="#fff" size={15} />}<Text style={{ color: '#fff', fontWeight: '800' }}>{saveRelay.isPending ? '保存中...' : '保存中继密钥'}</Text></Pressable>
    </Panel>

    <Modal visible={createOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ height: sheetHeight, width: '100%', maxWidth: 720, alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.page, padding: 16, gap: 10 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>新建管理令牌</Text><Text style={{ color: colors.subtext, fontSize: 9, marginTop: 3 }}>令牌只在创建成功时显示一次</Text></View><Pressable accessibilityLabel="关闭" onPress={() => setCreateOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>名称</Text><TextInput value={name} onChangeText={setName} placeholder="例如：浏览器助手" placeholderTextColor={colors.placeholder} maxLength={64} style={inputStyle} /></View>
            <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>权限预设</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{presets.map((preset) => {
              const active = sameScopes(selectedScopes, preset.scopes);
              const PresetIcon = preset.icon;
              return <Pressable key={preset.id} onPress={() => setSelectedScopes(preset.scopes)} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.card, flexDirection: 'row', alignItems: 'center', gap: 5 }}><PresetIcon color={active ? colors.primary : colors.subtext} size={14} /><Text style={{ color: active ? colors.primary : colors.text, fontSize: 10, fontWeight: '700' }}>{preset.label}</Text></Pressable>;
            })}</View></View>
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>{groups.map((group) => {
              const definitions = catalog.filter((item) => item.group === group);
              if (!definitions.length) return null;
              const selectedCount = definitions.filter((item) => selectedScopes.includes(item.scope)).length;
              return <View key={group} style={{ borderBottomWidth: group === groups[groups.length - 1] ? 0 : 1, borderBottomColor: colors.rowBorder }}><View style={{ minHeight: 34, paddingHorizontal: 10, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '800' }}>{groupLabel(group)}</Text>{selectedCount ? <Text style={{ color: colors.subtext, fontSize: 9 }}>{selectedCount}/{definitions.length}</Text> : null}</View>{definitions.map((definition) => {
                const selected = selectedScopes.includes(definition.scope);
                const disabled = fullSelected && definition.scope !== 'full';
                const expanded = expandedScope === definition.scope;
                return <View key={definition.scope} style={{ borderTopWidth: 1, borderTopColor: colors.rowBorder, opacity: disabled ? 0.45 : 1 }}><View style={{ minHeight: 52, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: selected && definition.destructive ? colors.warningBg : colors.card }}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => toggleScope(definition.scope)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 }}>{selected ? <CheckCircle2 color={colors.primary} size={18} /> : <Square color={colors.disabled} size={18} />}<View style={{ flex: 1, minWidth: 0, gap: 2 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>{scopeLabel(definition.scope)}</Text>{definition.destructive ? <AlertTriangle color={colors.warning} size={12} /> : null}</View><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 8, fontFamily: 'monospace' }}>{definition.scope}</Text></View></Pressable>{definition.rules.length ? <Pressable accessibilityLabel="查看允许的请求" onPress={() => setExpandedScope(expanded ? '' : definition.scope)} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}><Info color={colors.subtext} size={13} /></Pressable> : null}</View>{expanded ? <View style={{ paddingHorizontal: 36, paddingBottom: 8, backgroundColor: colors.card, gap: 2 }}>{definition.rules.map((rule) => <Text key={rule} style={{ color: colors.subtext, fontSize: 8, lineHeight: 12, fontFamily: 'monospace' }}>{rule}</Text>)}</View> : null}</View>;
              })}</View>;
            })}</View>
            <Text style={{ color: colors.subtext, fontSize: 9, lineHeight: 14 }}>只勾选程序真正需要的能力，每项旁的信息按钮可查看允许的具体请求。</Text>
            {fullSelected ? <View style={{ borderRadius: 12, backgroundColor: colors.warningBg, padding: 11, flexDirection: 'row', gap: 8 }}><AlertTriangle color={colors.warning} size={15} /><Text style={{ flex: 1, color: colors.warning, fontSize: 10, lineHeight: 15 }}>完整权限覆盖整个管理接口，下面权限会被一并包含。</Text></View> : destructiveCount ? <View style={{ borderRadius: 12, backgroundColor: colors.warningBg, padding: 11, flexDirection: 'row', gap: 8 }}><AlertTriangle color={colors.warning} size={15} /><Text style={{ flex: 1, color: colors.warning, fontSize: 10, lineHeight: 15 }}>已选择 {destructiveCount} 项高风险权限，请确认用途。</Text></View> : null}
            <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>有效期至</Text><TextInput value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD（留空永久有效）" placeholderTextColor={colors.placeholder} keyboardType="numbers-and-punctuation" maxLength={10} style={inputStyle} /></View>
            <View style={{ borderRadius: 12, backgroundColor: colors.mutedCard, padding: 11, flexDirection: 'row', gap: 8 }}><Info color={colors.text} size={15} /><Text style={{ flex: 1, color: colors.text, fontSize: 10, lineHeight: 15 }}>拿到令牌的人无需登录即可执行所选操作，请妥善保存。</Text></View>
          </ScrollView>
          {create.error ? <Text style={{ color: colors.danger, fontSize: 10 }}>{create.error.message}</Text> : null}
          <Pressable disabled={create.isPending || !name.trim() || !selectedScopes.length} onPress={() => create.mutate()} style={{ minHeight: 46, borderRadius: 13, backgroundColor: name.trim() && selectedScopes.length ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>{create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>创建令牌</Text>}</Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>

    <Modal visible={Boolean(createdToken)} transparent animationType="fade" onRequestClose={() => setCreatedToken('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 20, backgroundColor: colors.page, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>令牌已创建</Text><Text style={{ color: colors.subtext, fontSize: 9, marginTop: 3 }}>完整令牌仅显示这一次</Text></View><Pressable accessibilityLabel="关闭" onPress={() => setCreatedToken('')} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <View style={{ borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}><Text selectable style={{ color: colors.text, fontSize: 11, lineHeight: 17, fontFamily: 'monospace' }}>{createdToken}</Text></View>
          <View style={{ borderRadius: 12, backgroundColor: colors.warningBg, padding: 10, flexDirection: 'row', gap: 7 }}><AlertTriangle color={colors.warning} size={14} /><Text style={{ flex: 1, color: colors.warning, fontSize: 9, lineHeight: 14 }}>关闭后无法再次查看，请立即复制并安全保存。</Text></View>
          <Pressable onPress={() => void copyValue(createdToken)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: copied === createdToken ? colors.success : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>{copied === createdToken ? <Check color="#fff" size={16} /> : <Copy color="#fff" size={16} />}<Text style={{ color: '#fff', fontWeight: '800' }}>{copied === createdToken ? '已复制' : '复制完整令牌'}</Text></Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
