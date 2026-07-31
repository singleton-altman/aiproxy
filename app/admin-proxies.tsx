import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import {
  Check,
  Clock3,
  Eye,
  EyeOff,
  Globe2,
  Network,
  Pencil,
  Plus,
  Route,
  Server,
  ShieldCheck,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, Page, PageHeader, SheetHandle } from '@/src/components/ui';
import { apiJson, firstArray } from '@/src/lib/api';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type ProxyDraft = {
  name: string;
  scheme: string;
  host: string;
  port: string;
  username: string;
  password: string;
  enabled: boolean;
  region: string;
  sticky: boolean;
};

type FormMode = '' | 'create' | 'edit';

const schemes = ['http', 'https', 'socks5', 'socks5h'];

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function proxyId(item: ApiRecord) {
  return stringValue(item.id);
}

function proxyName(item: ApiRecord) {
  return stringValue(item.name) || stringValue(item.host) || proxyId(item) || '未命名代理';
}

function proxyEndpoint(item: ApiRecord) {
  return `${stringValue(item.scheme) || 'http'}://${stringValue(item.host) || '?'}:${numberValue(item.port) || '?'}`;
}

function accountCount(item: ApiRecord) {
  return Math.max(0, numberValue(item.account_count));
}

function formatCheckedAt(value: unknown) {
  const text = stringValue(value);
  if (!text) return '';
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return text;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function emptyDraft(): ProxyDraft {
  return { name: '', scheme: 'http', host: '', port: '1080', username: '', password: '', enabled: true, region: '', sticky: false };
}

function draftFromProxy(item: ApiRecord): ProxyDraft {
  return {
    name: stringValue(item.name),
    scheme: stringValue(item.scheme) || 'http',
    host: stringValue(item.host),
    port: String(numberValue(item.port) || 1080),
    username: stringValue(item.username),
    password: '',
    enabled: item.enabled !== false,
    region: stringValue(item.region),
    sticky: item.sticky === true,
  };
}

function proxyPayload(draft: ProxyDraft, editing: boolean): ApiRecord {
  const payload: ApiRecord = {
    name: draft.name.trim(),
    scheme: draft.scheme,
    host: draft.host.trim(),
    port: Number(draft.port),
    username: draft.username.trim(),
    enabled: draft.enabled,
    region: draft.region.trim(),
    sticky: draft.sticky,
  };
  if (!editing || draft.password.length > 0) payload.password = draft.password;
  return payload;
}

function SheetFrame({ visible, onClose, children, maxHeight = '90%' }: { visible: boolean; onClose: () => void; children: React.ReactNode; maxHeight?: `${number}%` }) {
  const colors = useAppTheme();
  return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClose}>
    <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
      <Pressable accessibilityLabel="关闭弹层" onPress={onClose} style={{ flex: 1 }} />
      <View style={{ maxHeight, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.page, padding: 16, gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 8 }}>
        <SheetHandle />
        {children}
      </View>
    </FullScreenSafeArea>
  </Modal>;
}

function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 11, lineHeight: 15 }}>{subtitle}</Text> : null}</View>
    <Pressable accessibilityLabel="关闭" onPress={onClose} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable>
  </View>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const colors = useAppTheme();
  return <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, fontWeight: '600' }}>{label}</Text><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{value}</Text>{detail ? <Text style={{ color: colors.subtext, fontSize: 11 }}>{detail}</Text> : null}</View></View>;
}

function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'primary' | 'success' | 'danger' | 'warning' }) {
  const colors = useAppTheme();
  const palette = tone === 'primary'
    ? { background: colors.primarySoft, foreground: colors.primary }
    : tone === 'success'
      ? { background: colors.successBg, foreground: colors.success }
      : tone === 'danger'
        ? { background: colors.dangerBg, foreground: colors.danger }
        : tone === 'warning'
          ? { background: colors.warningBg, foreground: colors.warning }
          : { background: colors.mutedCard, foreground: colors.subtext };
  return <View style={{ maxWidth: '100%', minHeight: 25, paddingHorizontal: 8, borderRadius: 8, backgroundColor: palette.background, flexDirection: 'row', alignItems: 'center' }}><Text numberOfLines={1} style={{ color: palette.foreground, fontSize: 11, fontWeight: '800' }}>{label}</Text></View>;
}

function FormField({ label, value, onChangeText, placeholder, secure = false, numeric = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secure?: boolean; numeric?: boolean }) {
  const colors = useAppTheme();
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    <View style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }}>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} secureTextEntry={secure && !visible} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minHeight: 42, color: colors.text, paddingHorizontal: 11, fontSize: 12 }} />
      {secure ? <Pressable accessibilityLabel={visible ? '隐藏密码' : '显示密码'} onPress={() => setVisible((current) => !current)} style={{ width: 40, height: 42, alignItems: 'center', justifyContent: 'center' }}>{visible ? <EyeOff color={colors.subtext} size={16} /> : <Eye color={colors.subtext} size={16} />}</Pressable> : null}
    </View>
  </View>;
}

function Segment<T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (value: T) => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 42, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>{options.map(([key, label]) => {
    const selected = value === key;
    return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(key)} style={{ flex: 1, minWidth: 0, borderRadius: 9, backgroundColor: selected ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: selected ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '800' }}>{label}</Text></Pressable>;
  })}</View>;
}

function ProxyFormSheet({ mode, item, saving, error, onClose, onSubmit }: { mode: FormMode; item?: ApiRecord; saving: boolean; error: string; onClose: () => void; onSubmit: (draft: ProxyDraft) => void }) {
  const colors = useAppTheme();
  const [draft, setDraft] = useState<ProxyDraft>(emptyDraft());
  const key = item ? proxyId(item) : '';

  useEffect(() => {
    if (mode) setDraft(item ? draftFromProxy(item) : emptyDraft());
  }, [key, mode]);

  const port = Number(draft.port);
  const valid = Boolean(draft.host.trim()) && Number.isInteger(port) && port >= 1 && port <= 65535;
  return <SheetFrame visible={Boolean(mode)} onClose={onClose} maxHeight="94%">
    <SheetHeader title={mode === 'edit' ? '编辑代理' : '添加代理'} subtitle="绑定后，账号的网关请求、健康探测和令牌刷新都会从该出口发出。" onClose={onClose} />
    <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
      <FormField label="名称" value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} placeholder="如：香港住宅" />
      <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>协议</Text><Segment value={draft.scheme} options={schemes.map((scheme) => [scheme, scheme] as const)} onChange={(scheme) => setDraft((current) => ({ ...current, scheme }))} /></View>
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 2 }}><FormField label="主机" value={draft.host} onChangeText={(host) => setDraft((current) => ({ ...current, host }))} placeholder="10.0.0.1" /></View><View style={{ flex: 1 }}><FormField label="端口" value={draft.port} onChangeText={(port) => setDraft((current) => ({ ...current, port }))} numeric placeholder="1080" /></View></View>
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><FormField label="用户名" value={draft.username} onChangeText={(username) => setDraft((current) => ({ ...current, username }))} placeholder="可选" /></View><View style={{ flex: 1 }}><FormField label="密码" value={draft.password} onChangeText={(password) => setDraft((current) => ({ ...current, password }))} secure placeholder={mode === 'edit' && item?.has_password ? '留空则保持不变' : '可选'} /></View></View>
      <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>状态</Text><Segment value={draft.enabled ? 'enabled' : 'disabled'} options={([['enabled', '已启用'], ['disabled', '已停用']] as const)} onChange={(enabled) => setDraft((current) => ({ ...current, enabled: enabled === 'enabled' }))} /></View>
      <FormField label="区域" value={draft.region} onChangeText={(region) => setDraft((current) => ({ ...current, region }))} placeholder="如：US、US-residential" />
      <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>独占</Text><Segment value={draft.sticky ? 'sticky' : 'shared'} options={([['shared', '共享'], ['sticky', '钉定']] as const)} onChange={(sticky) => setDraft((current) => ({ ...current, sticky: sticky === 'sticky' }))} /><Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 15 }}>钉定后，该出口仅分配给单个账号。</Text></View>
    </ScrollView>
    {!valid ? <Text style={{ color: colors.danger, fontSize: 11 }}>请填写主机，并使用 1 至 65535 的有效端口。</Text> : null}
    {error ? <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text> : null}
    <Pressable disabled={!valid || saving} onPress={() => onSubmit(draft)} style={({ pressed }) => ({ minHeight: 48, borderRadius: 13, backgroundColor: valid && !saving ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: pressed ? 0.72 : 1 })}>{saving ? <ActivityIndicator color="#fff" /> : <Check color="#fff" size={16} />}<Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{saving ? '保存中...' : mode === 'edit' ? '保存代理' : '添加代理'}</Text></Pressable>
  </SheetFrame>;
}

function SystemProxySheet({ visible, proxies, selectedId, saving, onClose, onSelect }: { visible: boolean; proxies: ApiRecord[]; selectedId: string; saving: boolean; onClose: () => void; onSelect: (id: string) => void }) {
  const colors = useAppTheme();
  const options = [{ id: '', label: '默认网络路径', detail: '系统服务从本机地址直连', enabled: true }, ...proxies.map((item) => ({ id: proxyId(item), label: proxyName(item), detail: proxyEndpoint(item), enabled: item.enabled !== false }))];
  return <SheetFrame visible={visible} onClose={onClose} maxHeight="76%">
    <SheetHeader title="系统出口" subtitle="用于检查更新、同步模型目录和添加账号时的登录握手。" onClose={onClose} />
    <FlatList data={options} bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyExtractor={(item) => item.id || 'direct'} style={{ flexGrow: 0 }} renderItem={({ item }) => {
      const selected = item.id === selectedId;
      return <Pressable disabled={saving} onPress={() => onSelect(item.id)} style={({ pressed }) => ({ minHeight: 54, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.62 : 1 })}><View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: selected ? colors.primarySoft : colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}>{item.id ? <Server color={selected ? colors.primary : colors.subtext} size={16} /> : <Globe2 color={selected ? colors.primary : colors.subtext} size={16} />}</View><View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.text, fontSize: 12, fontWeight: '800' }}>{item.label}{item.enabled ? '' : '（已停用）'}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, fontFamily: item.id ? 'monospace' : undefined }}>{item.detail}</Text></View>{saving && selected ? <ActivityIndicator color={colors.primary} size="small" /> : selected ? <Check color={colors.primary} size={16} /> : null}</Pressable>;
    }} />
  </SheetFrame>;
}

function CardAction({ icon: Icon, label, danger = false, busy = false, disabled = false, onPress }: { icon: LucideIcon; label: string; danger?: boolean; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  const colors = useAppTheme();
  return <Pressable disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 92, minWidth: 0, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: danger ? colors.danger : colors.border, backgroundColor: danger ? colors.dangerBg : colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.42 : pressed ? 0.65 : 1 })}>{busy ? <ActivityIndicator color={danger ? colors.danger : colors.primary} size="small" /> : <Icon color={danger ? colors.danger : colors.primary} size={14} />}<Text numberOfLines={1} style={{ color: danger ? colors.danger : colors.primary, fontSize: 11, fontWeight: '800' }}>{label}</Text></Pressable>;
}

function ProxyCard({ item, expanded, testResult, testing, deleting, onToggle, onEdit, onTest, onDelete }: { item: ApiRecord; expanded: boolean; testResult?: ApiRecord; testing: boolean; deleting: boolean; onToggle: () => void; onEdit: () => void; onTest: () => void; onDelete: () => void }) {
  const colors = useAppTheme();
  const count = accountCount(item);
  const system = item.system_selected === true;
  const persistedStatus = stringValue(item.last_status);
  const latency = numberValue(item.latency_ms);
  const checkedAt = formatCheckedAt(item.last_checked_at);
  const evidenceStatus = stringValue(testResult?.evidence_status);
  const evidenceIp = stringValue(testResult?.egress_ip);
  const evidenceError = stringValue(testResult?.error);
  return <View style={{ borderRadius: 16, borderWidth: 1, borderColor: expanded ? colors.primary : colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${expanded ? '收起' : '展开'} ${proxyName(item)}`} onPress={onToggle} style={({ pressed }) => ({ padding: 11, gap: 8, backgroundColor: pressed ? colors.mutedCard : colors.card })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: item.enabled === false ? colors.mutedCard : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Waypoints color={item.enabled === false ? colors.subtext : colors.primary} size={18} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' }}>{proxyName(item)}</Text><Badge label={item.enabled === false ? '停用' : '启用'} tone={item.enabled === false ? 'muted' : 'success'} /></View><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, fontFamily: 'monospace' }}>{proxyEndpoint(item)}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {system ? <Badge label="系统" tone="primary" /> : null}
        {count ? <Badge label={`${count} 个账号`} /> : !system ? <Badge label="未分配" /> : null}
        {stringValue(item.region) ? <Badge label={stringValue(item.region)} tone="warning" /> : null}
        {item.sticky ? <Badge label="独占" tone="warning" /> : null}
      </View>
      <View style={{ minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Clock3 color={persistedStatus === 'error' ? colors.danger : colors.subtext} size={13} /><Text numberOfLines={1} style={{ flex: 1, color: persistedStatus === 'error' ? colors.danger : colors.subtext, fontSize: 11 }}>{persistedStatus === 'ok' ? `${latency} ms${checkedAt ? ` · ${checkedAt}` : ''}` : persistedStatus === 'error' ? '最近测试失败' : '尚未测试'}</Text><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{expanded ? '收起详情' : '查看详情'}</Text></View>
    </Pressable>
    {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.rowBorder, padding: 11, gap: 11 }}>
      <View style={{ gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Route color={colors.primary} size={14} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>路由影响</Text></View><Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 16 }}>{system ? '此节点是系统路由。' : '此节点不是系统路由。'} {count ? `${count} 个账号通过此节点覆盖系统路由。` : '没有账号覆盖使用它。'}</Text></View>
      <View style={{ gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><ShieldCheck color={evidenceStatus === 'unreachable' ? colors.danger : colors.primary} size={14} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>手动测试证据</Text></View>{testResult ? <View style={{ gap: 3 }}><Text style={{ color: colors.subtext, fontSize: 11 }}>观测出口：<Text style={{ color: colors.text, fontFamily: 'monospace' }}>{evidenceStatus === 'reachable_no_ip' ? '测试端点未返回' : evidenceIp || '—'}</Text></Text><Text style={{ color: colors.subtext, fontSize: 11 }}>测试目标：Cloudflare trace 端点</Text><Text style={{ color: evidenceStatus === 'unreachable' ? colors.danger : colors.success, fontSize: 11, fontWeight: '700' }}>{evidenceStatus === 'reachable' ? '可达，已观测到出口 IP' : evidenceStatus === 'reachable_no_ip' ? '可达，但未返回出口 IP' : `不可达${evidenceError ? `：${evidenceError}` : ''}`}</Text></View> : <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 16 }}>本次会话尚未手动测试。测试仅验证一次 HTTPS 请求。</Text>}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><CardAction icon={Pencil} label="编辑" disabled={testing || deleting} onPress={onEdit} /><CardAction icon={Network} label="单次测试" busy={testing} disabled={deleting} onPress={onTest} /><CardAction icon={Trash2} label="删除" danger busy={deleting} disabled={testing} onPress={onDelete} /></View>
    </View> : null}
  </View>;
}

export default function AdminProxiesScreen() {
  const colors = useAppTheme();
  const [expandedId, setExpandedId] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('');
  const [editingItem, setEditingItem] = useState<ApiRecord>();
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [systemSheetVisible, setSystemSheetVisible] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);
  const [testingId, setTestingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [testResults, setTestResults] = useState<Record<string, ApiRecord>>({});

  const query = useQuery({
    queryKey: ['admin', 'proxies'],
    queryFn: async ({ signal }) => firstArray<ApiRecord>(await apiJson<unknown>('/admin/proxies', { signal }), ['proxies', 'items', 'data', 'list']),
  });
  const proxies = query.data ?? [];
  const systemProxy = proxies.find((item) => item.system_selected === true);
  const systemProxyId = systemProxy ? proxyId(systemProxy) : '';
  const summary = useMemo(() => ({
    enabled: proxies.filter((item) => item.enabled !== false).length,
    total: proxies.length,
    accounts: proxies.reduce((total, item) => total + accountCount(item), 0),
  }), [proxies]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'proxies'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  }

  function openCreate() {
    setEditingItem(undefined);
    setFormError('');
    setFormMode('create');
  }

  function openEdit(item: ApiRecord) {
    setEditingItem(item);
    setFormError('');
    setFormMode('edit');
  }

  async function saveProxy(draft: ProxyDraft) {
    if (saving) return;
    setSaving(true);
    setFormError('');
    try {
      const editing = formMode === 'edit' && editingItem;
      await apiJson(editing ? `/admin/proxies/${encodeURIComponent(proxyId(editingItem))}` : '/admin/proxies', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(proxyPayload(draft, Boolean(editing))) });
      setFormMode('');
      setEditingItem(undefined);
      invalidate();
      Alert.alert('已保存', editing ? '代理配置已更新。' : '代理已添加。');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function selectSystemProxy(id: string) {
    if (systemSaving) return;
    setSystemSaving(true);
    try {
      await apiJson('/admin/proxies/system', { method: 'PUT', body: JSON.stringify({ proxy_id: id }) });
      setSystemSheetVisible(false);
      invalidate();
      Alert.alert('已更新', '系统出口已更新。');
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请求失败');
    } finally {
      setSystemSaving(false);
    }
  }

  async function testProxy(item: ApiRecord) {
    const id = proxyId(item);
    if (!id || testingId) return;
    setTestingId(id);
    setExpandedId(id);
    try {
      const result = await apiJson<ApiRecord>(`/admin/proxies/${encodeURIComponent(id)}/test`, { method: 'POST', timeoutMs: 60000 });
      setTestResults((current) => ({ ...current, [id]: result }));
      invalidate();
      const status = stringValue(result.evidence_status);
      if (status === 'reachable') Alert.alert('测试完成', `代理可达${result.egress_ip ? `，出口 IP：${result.egress_ip}` : ''}。`);
      else if (status === 'reachable_no_ip') Alert.alert('测试完成', 'HTTPS 请求成功，但测试端点未返回出口 IP。');
      else Alert.alert('测试失败', stringValue(result.error) || '代理不可达');
    } catch (error) {
      Alert.alert('测试失败', error instanceof Error ? error.message : '无法执行连通性测试');
    } finally {
      setTestingId('');
    }
  }

  async function deleteProxy(item: ApiRecord) {
    const id = proxyId(item);
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      const impact = await apiJson<ApiRecord>(`/admin/proxies/${encodeURIComponent(id)}/impact`);
      const count = Math.max(0, numberValue(impact.account_count));
      const stranded = Math.max(0, numberValue(impact.stranded_count));
      const system = impact.is_system_proxy === true;
      setDeletingId('');
      Alert.alert('删除代理', `确定删除“${proxyName(item)}”？${count} 个账号正在经由它出网，其中 ${stranded} 个将改为从本机地址直连。${system ? '系统服务也会改用默认网络路径。' : '系统路由不会改变。'}`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => void performDelete(item) }]);
    } catch (error) {
      setDeletingId('');
      Alert.alert('无法评估删除影响', error instanceof Error ? error.message : '请求失败');
    }
  }

  async function performDelete(item: ApiRecord) {
    const id = proxyId(item);
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      const result = await apiJson<ApiRecord>(`/admin/proxies/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setExpandedId('');
      invalidate();
      const detached = Math.max(0, numberValue(result.detached_accounts));
      const systemText = result.cleared_system_proxy ? '系统任务已改用默认网络路径。' : '系统路由未改变。';
      Alert.alert('已删除', `已解绑 ${detached} 个账号。${systemText}${result.system_proxy_persist_ok === false ? `\n系统路由持久化失败：${stringValue(result.persist_error) || '未知错误'}` : ''}`);
    } catch (error) {
      Alert.alert('删除失败', error instanceof Error ? error.message : '请求失败');
    } finally {
      setDeletingId('');
    }
  }

  return <>
    <Page title="网络与出口" subtitle="查看并控制系统服务和上游账号的网络出口" icon={Waypoints} safeTop={false} contentMaxWidth={1180} scrollable={false} showHeader={false}>
      <FlatList
        data={proxies}
        extraData={`${expandedId}:${testingId}:${deletingId}:${JSON.stringify(testResults)}`}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        scrollToOverflowEnabled={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        keyExtractor={(item, index) => proxyId(item) || String(index)}
        removeClippedSubviews={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ gap: 7, paddingBottom: 10, flexGrow: proxies.length ? 0 : 1 }}
        ListHeaderComponent={<View style={{ gap: 10, paddingBottom: 3 }}>
          <PageHeader title="网络与出口" subtitle="查看并控制系统服务和上游账号从哪里离开你的网络" icon={Waypoints} refreshing={query.isFetching} onRefresh={() => query.refetch()} />
          <Pressable onPress={openCreate} style={({ pressed }) => ({ alignSelf: 'flex-end', minHeight: 40, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.72 : 1 })}><Plus color="#fff" size={15} /><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>添加代理</Text></Pressable>
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Network color={colors.primary} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>出口概览</Text></View><View style={{ flexDirection: 'row', gap: 10 }}><Metric label="已启用节点" value={String(summary.enabled)} detail={`/ ${summary.total}`} /><Metric label="账号覆盖" value={String(summary.accounts)} /><Metric label="系统路由" value={systemProxy?.enabled ? proxyName(systemProxy) : '默认网络'} /></View></View>
          <Pressable onPress={() => setSystemSheetVisible(true)} style={({ pressed }) => ({ minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: pressed ? colors.primary : colors.border, backgroundColor: pressed ? colors.mutedCard : colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 })}><View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Globe2 color={colors.primary} size={18} /></View><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>系统出口</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{systemProxy?.enabled ? proxyName(systemProxy) : '默认网络路径'}</Text></View><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>选择</Text></Pressable>
          {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 2 }}><Server color={colors.subtext} size={14} /><Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>出口节点</Text><Text style={{ color: colors.subtext, fontSize: 11 }}>{proxies.length}</Text></View>
        </View>}
        ListEmptyComponent={query.isLoading ? <View style={{ flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View> : !query.error ? <EmptyState icon={Waypoints} message="暂无代理" /> : null}
        renderItem={({ item }) => {
          const id = proxyId(item);
          return <ProxyCard item={item} expanded={expandedId === id} testResult={testResults[id]} testing={testingId === id} deleting={deletingId === id} onToggle={() => setExpandedId((current) => current === id ? '' : id)} onEdit={() => openEdit(item)} onTest={() => void testProxy(item)} onDelete={() => void deleteProxy(item)} />;
        }}
      />
    </Page>

    <ProxyFormSheet mode={formMode} item={editingItem} saving={saving} error={formError} onClose={() => { if (saving) return; setFormMode(''); setEditingItem(undefined); setFormError(''); }} onSubmit={(draft) => void saveProxy(draft)} />
    <SystemProxySheet visible={systemSheetVisible} proxies={proxies} selectedId={systemProxyId} saving={systemSaving} onClose={() => { if (!systemSaving) setSystemSheetVisible(false); }} onSelect={(id) => void selectSystemProxy(id)} />
  </>;
}
