import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import type { LucideIcon } from 'lucide-react-native';
import {
  Boxes,
  Check,
  ChevronDown,
  Clock3,
  CloudCog,
  Copy,
  Download,
  FileUp,
  Filter,
  LogIn,
  MoreHorizontal,
  Network,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  SearchX,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { StructuredDataView } from '@/src/components/structured-form';
import { EmptyState, ErrorState, FullScreenSafeArea, Page, SearchField, SheetHandle } from '@/src/components/ui';
import {
  accountEgress,
  accountIdentity,
  accountLastUsed,
  accountProvider,
  accountSearchText,
  accountStatus,
  accountStatusLabels,
  accountStatusNeedsAttention,
  accountStatusReason,
  type UpstreamAccountStatus,
} from '@/src/lib/account-display';
import { apiFetch, apiJson, firstArray, type ApiResult } from '@/src/lib/api';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type StatusFilter = 'all' | UpstreamAccountStatus;
type FilterMode = 'status' | 'provider' | '';
type ModelTestState = { ok: boolean; message: string; testedAt: string };
type ModelTestProgress = { completed: number; total: number };
type AccountDraft = {
  label: string;
  priority: string;
  status: string;
  egressSelector: string;
  wsEnabled: boolean;
  credentials: Record<string, string>;
};
type WarmupDraft = { enabled: boolean; times: string[]; timezone: string; model: string };
type ChoiceOption = { key: string; label: string; detail?: string; count?: number };

const credentialFields: Record<string, Array<{ key: string; label: string; placeholder: string; secure?: boolean }>> = {
  cursor: [{ key: 'machine_id', label: 'Machine ID', placeholder: 'storage.serviceMachineId' }],
  qianwen: [{ key: 'console_cookie', label: '控制台 Cookie', placeholder: 'login_qianwenai_ticket=...', secure: true }],
  qwen: [{ key: 'console_cookie', label: '控制台 Cookie', placeholder: 'login_qianwenai_ticket=...', secure: true }],
  ark: [
    { key: 'volc_access_key_id', label: 'Access Key ID', placeholder: 'AKLT...' },
    { key: 'volc_secret_access_key', label: 'Secret Access Key', placeholder: '仅在需要替换时填写', secure: true },
  ],
  doubao: [
    { key: 'volc_access_key_id', label: 'Access Key ID', placeholder: 'AKLT...' },
    { key: 'volc_secret_access_key', label: 'Secret Access Key', placeholder: '仅在需要替换时填写', secure: true },
  ],
};

const statusOrder: UpstreamAccountStatus[] = ['active', 'error', 'needs_reauth', 'suspended', 'rate_limited', 'cooldown', 'disabled'];

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function recordValue(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function accountId(item: ApiRecord) {
  return stringValue(item.id);
}

function availableModelId(item: ApiRecord) {
  return stringValue(item.id ?? item.model ?? item.model_id ?? item.name);
}

function modelArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as ApiRecord;
  for (const key of ['models', 'items', 'data', 'list', 'results', 'rows']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = modelArray(value);
      if (nested.length) return nested;
    }
  }
  return availableModelId(record) ? [record] : [];
}

function normalizeAvailableModels(payload: unknown, provider: string): ApiRecord[] {
  return modelArray(payload).flatMap((value) => {
    if (typeof value === 'string' || typeof value === 'number') return [{ id: String(value), provider }];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as ApiRecord;
    if (!availableModelId(item) && Array.isArray(item.models)) {
      return normalizeAvailableModels(item.models, stringValue(item.provider ?? item.name) || provider);
    }
    return availableModelId(item) ? [{ ...item, provider: item.provider ?? provider }] : [];
  });
}

function findModelEnvelope(payload: unknown): ApiRecord | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const record = payload as ApiRecord;
  if (typeof record.supported === 'boolean' || Array.isArray(record.models)) return record;
  for (const key of ['data', 'result', 'payload']) {
    const nested = findModelEnvelope(record[key]);
    if (nested) return nested;
  }
  return undefined;
}

function modelContext(item: ApiRecord) {
  const value = Number(item.context_window ?? item.context_length ?? item.max_context_tokens ?? item.input_token_limit);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M 上下文`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K 上下文`;
  return `${value} 上下文`;
}

function modelTestOutcome(payload: unknown) {
  const outer = recordValue(payload);
  const nested = Object.keys(recordValue(outer.data)).length ? recordValue(outer.data) : outer;
  const success = nested.success ?? nested.ok ?? outer.success ?? outer.ok;
  const error = nested.error ?? nested.message ?? outer.error ?? outer.message;
  if (success === false) throw new Error(stringValue(error) || '模型不可用');
  const latency = Number(nested.latency_ms ?? nested.latency ?? outer.latency_ms ?? outer.latency);
  return Number.isFinite(latency) && latency >= 0 ? `可用 · ${Math.round(latency)} ms` : '模型可用';
}

function modelTestTime() {
  const date = new Date();
  try {
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':');
  }
}

function modelTestError(error: unknown) {
  return error instanceof Error && typeof error.message === 'string' && error.message.trim() ? error.message : '测试失败';
}

async function requestModelTest(account: string, model: string, signal: AbortSignal): Promise<ModelTestState> {
  try {
    const payload = await apiJson(`/admin/accounts/${encodeURIComponent(account)}/models/test`, {
      method: 'POST',
      body: JSON.stringify({ model }),
      timeoutMs: 60000,
      signal,
    });
    return { ok: true, message: modelTestOutcome(payload), testedAt: modelTestTime() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, message: modelTestError(error), testedAt: modelTestTime() };
  }
}

function formatTimestamp(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-CN');
}

function statusTone(status: UpstreamAccountStatus, colors: ReturnType<typeof useAppTheme>) {
  if (status === 'active') return { background: colors.successBg, foreground: colors.success };
  if (status === 'cooldown' || status === 'rate_limited') return { background: colors.warningBg, foreground: colors.warning };
  return { background: colors.dangerBg, foreground: colors.danger };
}

function safeFilename(value: string | undefined) {
  return (value?.trim() || `accounts-export-${Date.now()}.json`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
}

function exportBlob(result: ApiResult) {
  if (result.blob) return result.blob;
  if (result.kind === 'json') return new Blob([JSON.stringify(result.data, null, 2)], { type: result.contentType || 'application/json' });
  if (result.kind === 'text') return new Blob([String(result.data ?? '')], { type: result.contentType || 'text/plain' });
  throw new Error('服务器没有返回可导出的文件');
}

async function shareExportResult(result: ApiResult) {
  const blob = exportBlob(result);
  const filename = safeFilename(result.filename);
  const mimeType = (result.contentType || blob.type || 'application/json').split(';')[0];
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('当前设备不支持文件分享');
  const file = new ExpoFile(Paths.cache, `${Date.now()}-${filename}`);
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(await blob.arrayBuffer()));
  await Sharing.shareAsync(file.uri, {
    dialogTitle: '导出上游账号',
    mimeType,
    UTI: mimeType.includes('json') ? 'public.json' : 'public.data',
  });
}

function multipartBody(asset: DocumentPickerAsset) {
  if (typeof FormData === 'undefined') throw new Error('当前设备不支持文件上传');
  const data = new FormData();
  if (asset.file) data.append('file', asset.file, asset.name);
  else data.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/json' } as unknown as Blob);
  return data;
}

function SheetFrame({ visible, onClose, children, maxHeight = '88%' }: { visible: boolean; onClose: () => void; children: React.ReactNode; maxHeight?: `${number}%` }) {
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
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{subtitle}</Text> : null}</View>
    <Pressable accessibilityLabel="关闭" onPress={onClose} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable>
  </View>;
}

function CompactButton({ icon: Icon, label, onPress, primary = false, busy = false, disabled = false }: { icon: LucideIcon; label: string; onPress: () => void; primary?: boolean; busy?: boolean; disabled?: boolean }) {
  const colors = useAppTheme();
  const inactive = disabled || busy;
  return <Pressable disabled={inactive} onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 104, minWidth: 0, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: primary ? colors.primary : colors.border, backgroundColor: primary ? colors.primary : colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: inactive ? 0.48 : pressed ? 0.68 : 1 })}>
    {busy ? <ActivityIndicator color={primary ? '#fff' : colors.primary} size="small" /> : <Icon color={primary ? '#fff' : colors.primary} size={15} />}
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: primary ? '#fff' : colors.primary, fontSize: 11, fontWeight: '800' }}>{label}</Text>
  </Pressable>;
}

function FilterButton({ icon: Icon, label, active, onPress }: { icon: LucideIcon; label: string; active: boolean; onPress: () => void }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.66 : 1 })}>
    <Icon color={active ? colors.primary : colors.subtext} size={15} />
    <Text numberOfLines={1} style={{ flex: 1, color: active ? colors.primary : colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    <ChevronDown color={active ? colors.primary : colors.subtext} size={14} />
  </Pressable>;
}

function StatusBadge({ status }: { status: UpstreamAccountStatus }) {
  const colors = useAppTheme();
  const tone = statusTone(status, colors);
  return <View style={{ flexShrink: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: tone.background }}><Text style={{ color: tone.foreground, fontSize: 9, fontWeight: '800' }}>{accountStatusLabels[status]}</Text></View>;
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  const colors = useAppTheme();
  const foreground = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.text;
  return <View style={{ minHeight: 30, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}><Text style={{ color: foreground, fontSize: 14, fontWeight: '900' }}>{value}</Text><Text style={{ color: colors.subtext, fontSize: 10, fontWeight: '600' }}>{label}</Text></View>;
}

function AccountCard({ item, proxies, proxiesLoaded, now, onPress }: { item: ApiRecord; proxies: ApiRecord[]; proxiesLoaded: boolean; now: number; onPress: () => void }) {
  const colors = useAppTheme();
  const identity = accountIdentity(item);
  const provider = accountProvider(item);
  const status = accountStatus(item, now);
  const egress = accountEgress(item, proxies, proxiesLoaded);
  const reason = accountStatusReason(item, status);
  const plan = stringValue(item.plan_label);
  const priority = Number(item.priority ?? 0);
  const warmupTimes = Array.isArray(item.warmup_times) ? item.warmup_times.map(String).filter(Boolean) : [];
  const egressText = egress.missing ? `出口缺失 · ${egress.label}` : egress.direct ? '直连' : `经 ${egress.label}`;
  return <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: 112, borderRadius: 16, borderWidth: 1, borderColor: egress.missing ? colors.warning : pressed ? colors.primary : colors.border, backgroundColor: pressed ? colors.mutedCard : colors.card, padding: 12, gap: 8, opacity: pressed ? 0.76 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: provider.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>{provider.mark}</Text></View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' }}>{identity.primary}</Text><StatusBadge status={status} /></View>
        {identity.secondary ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{identity.secondary}</Text> : null}
        <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, fontWeight: '600' }}>{provider.label}{plan ? ` / ${plan}` : ''}</Text>
      </View>
      <MoreHorizontal color={colors.subtext} size={18} />
    </View>
    <View style={{ marginLeft: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Network color={egress.missing ? colors.warning : colors.subtext} size={13} /><Text numberOfLines={1} style={{ flex: 1, color: egress.missing ? colors.warning : colors.subtext, fontSize: 10, fontWeight: egress.missing ? '700' : '500' }}>{egressText}</Text></View>
      <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Clock3 color={colors.subtext} size={13} /><Text style={{ color: colors.subtext, fontSize: 10 }}>{accountLastUsed(item.last_used_at, now)}</Text></View>
    </View>
    {reason ? <Text numberOfLines={2} style={{ marginLeft: 48, color: statusTone(status, colors).foreground, fontSize: 10, lineHeight: 14 }}>{reason}</Text> : null}
    {item.ws_enabled || priority !== 0 || item.warmup_enabled || item.models_probe_error ? <View style={{ marginLeft: 48, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
      {item.ws_enabled ? <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.subtext, fontSize: 8, fontWeight: '700' }}>WS</Text></View> : null}
      {priority !== 0 ? <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.subtext, fontSize: 8, fontWeight: '700' }}>优先级 {priority}</Text></View> : null}
      {item.warmup_enabled ? <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: item.warmup_last_error ? colors.warningBg : colors.mutedCard }}><Text numberOfLines={1} style={{ color: item.warmup_last_error ? colors.warning : colors.subtext, fontSize: 8, fontWeight: '700' }}>预热{warmupTimes.length ? ` ${warmupTimes.join(' ')}` : ''}</Text></View> : null}
      {item.models_probe_error ? <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.warningBg }}><Text style={{ color: colors.warning, fontSize: 8, fontWeight: '700' }}>模型探测失败</Text></View> : null}
    </View> : null}
  </Pressable>;
}

function ActionRow({ icon: Icon, label, onPress, busy = false, disabled = false, danger = false }: { icon: LucideIcon; label: string; onPress: () => void; busy?: boolean; disabled?: boolean; danger?: boolean }) {
  const colors = useAppTheme();
  return <Pressable disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 46, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.42 : pressed ? 0.62 : 1 })}>
    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: danger ? colors.dangerBg : colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator color={danger ? colors.danger : colors.primary} size="small" /> : <Icon color={danger ? colors.danger : colors.subtext} size={15} />}</View>
    <Text style={{ flex: 1, color: danger ? colors.danger : colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}

function AccountActionsSheet({ account, busyAction, onClose, onRecover, onReauth, onEdit, onModels, onWarmup, onToggle, onExport, onDelete }: { account?: ApiRecord; busyAction: string; onClose: () => void; onRecover: () => void; onReauth: () => void; onEdit: () => void; onModels: () => void; onWarmup: () => void; onToggle: () => void; onExport: () => void; onDelete: () => void }) {
  const identity = account ? accountIdentity(account) : { primary: '', secondary: '' };
  const provider = account ? accountProvider(account) : accountProvider('');
  const status = account ? accountStatus(account) : 'active';
  const rawDisabled = account?.status === 'disabled';
  return <SheetFrame visible={Boolean(account)} onClose={onClose} maxHeight="88%">
    <SheetHeader title={identity.primary || '上游账号'} subtitle={[provider.label, identity.secondary].filter(Boolean).join(' · ')} onClose={onClose} />
    <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 2 }}>
      {status === 'needs_reauth' ? <ActionRow icon={LogIn} label="重新登录" onPress={onReauth} disabled={Boolean(busyAction)} /> : null}
      {status !== 'active' ? <ActionRow icon={RotateCcw} label="恢复账号" onPress={onRecover} busy={busyAction === 'recover'} disabled={Boolean(busyAction) && busyAction !== 'recover'} /> : null}
      <ActionRow icon={Pencil} label="编辑" onPress={onEdit} disabled={Boolean(busyAction)} />
      <ActionRow icon={Boxes} label="查看可用模型" onPress={onModels} disabled={Boolean(busyAction)} />
      <ActionRow icon={Clock3} label="定时预热" onPress={onWarmup} disabled={Boolean(busyAction)} />
      <ActionRow icon={Power} label={rawDisabled ? '启用' : '禁用'} onPress={onToggle} busy={busyAction === 'toggle'} disabled={Boolean(busyAction) && busyAction !== 'toggle'} />
      <ActionRow icon={Download} label="导出" onPress={onExport} busy={busyAction === 'export'} disabled={Boolean(busyAction) && busyAction !== 'export'} />
      <ActionRow icon={Trash2} label="删除" onPress={onDelete} busy={busyAction === 'delete'} disabled={Boolean(busyAction) && busyAction !== 'delete'} danger />
    </ScrollView>
  </SheetFrame>;
}

function AccountInput({ label, value, onChangeText, placeholder, numeric = false, secure = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; numeric?: boolean; secure?: boolean }) {
  const colors = useAppTheme();
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    <View style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }}>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} secureTextEntry={secure && !visible} style={{ flex: 1, minHeight: 42, color: colors.text, paddingHorizontal: 11, fontSize: 12 }} />
      {secure ? <Pressable accessibilityLabel={visible ? '隐藏凭据' : '显示凭据'} onPress={() => setVisible((current) => !current)} style={{ width: 40, height: 42, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{visible ? '隐藏' : '显示'}</Text></Pressable> : null}
    </View>
  </View>;
}

function emptyAccountDraft(): AccountDraft {
  return { label: '', priority: '0', status: 'active', egressSelector: '', wsEnabled: false, credentials: {} };
}

function draftFromAccount(item: ApiRecord, proxies: ApiRecord[], proxiesLoaded: boolean): AccountDraft {
  const provider = stringValue(item.provider).toLowerCase();
  const credentials = Object.fromEntries((credentialFields[provider] ?? []).map((field) => [field.key, '']));
  return {
    label: stringValue(item.label),
    priority: String(Number(item.priority ?? 0) || 0),
    status: stringValue(item.status) || 'active',
    egressSelector: accountEgress(item, proxies, proxiesLoaded).id,
    wsEnabled: Boolean(item.ws_enabled),
    credentials,
  };
}

function accountEditPatch(item: ApiRecord, draft: AccountDraft, proxies: ApiRecord[], proxiesLoaded: boolean) {
  const patch: ApiRecord = {};
  const label = draft.label.trim();
  if (label !== stringValue(item.label)) patch.label = label;
  const priority = Number(draft.priority);
  if (Number.isFinite(priority) && priority !== Number(item.priority ?? 0)) patch.priority = priority;
  const rawStatus = stringValue(item.status);
  if ((rawStatus === 'active' || rawStatus === 'disabled') && draft.status !== rawStatus) patch.status = draft.status;
  const egress = accountEgress(item, proxies, proxiesLoaded);
  if (!egress.advanced && draft.egressSelector !== egress.id) patch.egress_selector = draft.egressSelector;
  if (draft.wsEnabled !== Boolean(item.ws_enabled)) patch.ws_enabled = draft.wsEnabled;
  const providerData = Object.fromEntries(Object.entries(draft.credentials).map(([key, value]) => [key, value.trim()]).filter(([, value]) => Boolean(value)));
  if (Object.keys(providerData).length) patch.provider_data = providerData;
  return patch;
}

function stickyProxyOwners(accounts: ApiRecord[], proxies: ApiRecord[]) {
  const sticky = new Set(proxies.filter((proxy) => proxy.sticky).map((proxy) => stringValue(proxy.id)).filter(Boolean));
  const owners: Record<string, string> = {};
  for (const account of [...accounts].sort((left, right) => accountId(left).localeCompare(accountId(right)))) {
    const selector = stringValue(account.egress_selector);
    const selectors = selector
      ? selector.split(',').map((value) => value.trim()).filter((value) => value && !value.startsWith('region:'))
      : [stringValue(account.proxy_id)].filter(Boolean);
    for (const proxyId of selectors) {
      if (sticky.has(proxyId) && !owners[proxyId]) owners[proxyId] = accountId(account);
    }
  }
  return owners;
}

function AccountEditSheet({ account, accounts, proxies, proxiesLoaded, onClose, onSaved }: { account?: ApiRecord; accounts: ApiRecord[]; proxies: ApiRecord[]; proxiesLoaded: boolean; onClose: () => void; onSaved: () => void }) {
  const colors = useAppTheme();
  const [draft, setDraft] = useState<AccountDraft>(emptyAccountDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const key = account ? accountId(account) : '';
  const proxyOwners = useMemo(() => stickyProxyOwners(accounts, proxies), [accounts, proxies]);

  useEffect(() => {
    setDraft(account ? draftFromAccount(account, proxies, proxiesLoaded) : emptyAccountDraft());
    setError('');
  }, [key]);

  if (!account) return <SheetFrame visible={false} onClose={onClose}><View /></SheetFrame>;
  const provider = accountProvider(account);
  const egress = accountEgress(account, proxies, proxiesLoaded);
  const rawStatus = stringValue(account.status);
  const editableStatus = rawStatus === 'active' || rawStatus === 'disabled';
  const fields = credentialFields[provider.key] ?? [];
  const priorityValid = draft.priority.trim() !== '' && Number.isFinite(Number(draft.priority));

  async function save() {
    if (!account || !priorityValid || saving) return;
    setSaving(true);
    setError('');
    try {
      const patch = accountEditPatch(account, draft, proxies, proxiesLoaded);
      if (Object.keys(patch).length) {
        await apiJson(`/admin/accounts/${encodeURIComponent(accountId(account))}`, { method: 'PUT', body: JSON.stringify(patch) });
        onSaved();
        Alert.alert('已保存', '账号配置已更新。');
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return <SheetFrame visible onClose={onClose} maxHeight="92%">
    <SheetHeader title="编辑上游账号" subtitle={`${accountIdentity(account).primary} · ${provider.label}`} onClose={onClose} />
    <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
      <AccountInput label="账号标签" value={draft.label} onChangeText={(label) => setDraft((current) => ({ ...current, label }))} placeholder={accountIdentity(account).primary} />
      <AccountInput label="优先级" value={draft.priority} onChangeText={(priority) => setDraft((current) => ({ ...current, priority }))} numeric />
      {!priorityValid ? <Text style={{ color: colors.danger, fontSize: 9 }}>优先级必须是数字</Text> : null}
      <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>状态</Text>{editableStatus ? <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>{([['active', '启用'], ['disabled', '禁用']] as const).map(([status, label]) => <Pressable key={status} onPress={() => setDraft((current) => ({ ...current, status }))} style={{ flex: 1, minHeight: 38, borderRadius: 9, backgroundColor: draft.status === status ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: draft.status === status ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}</View> : <View style={{ minHeight: 42, borderRadius: 12, backgroundColor: colors.mutedCard, paddingHorizontal: 11, justifyContent: 'center' }}><Text style={{ color: colors.subtext, fontSize: 11 }}>{accountStatusLabels[accountStatus(account)]} · 系统维护状态</Text></View>}</View>
      <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>出口代理</Text>{egress.advanced ? <View style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, paddingHorizontal: 11, justifyContent: 'center' }}><Text selectable numberOfLines={2} style={{ color: colors.subtext, fontFamily: 'monospace', fontSize: 10 }}>{stringValue(account.egress_selector)}</Text></View> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        <Pressable onPress={() => setDraft((current) => ({ ...current, egressSelector: '' }))} style={{ minHeight: 36, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: draft.egressSelector === '' ? colors.primary : colors.border, backgroundColor: draft.egressSelector === '' ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: draft.egressSelector === '' ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>直连</Text></Pressable>
        {proxies.map((proxy, index) => { const id = stringValue(proxy.id) || String(index); const selected = draft.egressSelector === id; const name = stringValue(proxy.name) || stringValue(proxy.host) || id; const ownerId = proxyOwners[id]; const ownedByOther = Boolean(ownerId && ownerId !== accountId(account)); const owner = ownedByOther ? accounts.find((item) => accountId(item) === ownerId) : undefined; return <Pressable key={id} disabled={ownedByOther} onPress={() => setDraft((current) => ({ ...current, egressSelector: id }))} style={{ minHeight: 36, maxWidth: '100%', paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center', opacity: ownedByOther ? 0.45 : 1 }}><Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{name}{proxy.enabled === false ? '（禁用）' : ''}{proxy.sticky ? ' · 专属' : ''}{owner ? ` · 已分配给 ${accountIdentity(owner).primary}` : ''}</Text></Pressable>; })}
        {draft.egressSelector && !proxies.some((proxy) => stringValue(proxy.id) === draft.egressSelector) ? <View style={{ minHeight: 36, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.warningBg, justifyContent: 'center' }}><Text style={{ color: colors.warning, fontSize: 10, fontWeight: '700' }}>{draft.egressSelector}（未找到）</Text></View> : null}
      </View>}</View>
      <View style={{ minHeight: 46, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Wifi color={draft.wsEnabled ? colors.primary : colors.subtext} size={15} /><View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>WebSocket</Text><Text style={{ color: colors.subtext, fontSize: 9 }}>允许该账号承载 WebSocket 会话</Text></View><Switch value={draft.wsEnabled} onValueChange={(wsEnabled) => setDraft((current) => ({ ...current, wsEnabled }))} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>
      {fields.map((field) => <AccountInput key={field.key} label={field.label} value={draft.credentials[field.key] ?? ''} onChangeText={(value) => setDraft((current) => ({ ...current, credentials: { ...current.credentials, [field.key]: value } }))} placeholder={field.placeholder} secure={field.secure} />)}
      {fields.length ? <Text style={{ color: colors.subtext, fontSize: 9, lineHeight: 14 }}>凭据留空时保持现有值不变。</Text> : null}
    </ScrollView>
    {error ? <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text> : null}
    <Pressable disabled={!priorityValid || saving} onPress={() => void save()} style={{ minHeight: 48, borderRadius: 13, backgroundColor: priorityValid && !saving ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>{saving ? <ActivityIndicator color="#fff" /> : <Save color="#fff" size={16} />}<Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{saving ? '保存中...' : '保存账号'}</Text></Pressable>
  </SheetFrame>;
}

function AccountModelsSheet({ account, onClose }: { account?: ApiRecord; onClose: () => void }) {
  const colors = useAppTheme();
  const { height } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [testingAll, setTestingAll] = useState(false);
  const [testProgress, setTestProgress] = useState<ModelTestProgress>();
  const [testAllError, setTestAllError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [testStates, setTestStates] = useState<Record<string, ModelTestState>>({});
  const activeTestRef = useRef(false);
  const testControllerRef = useRef<AbortController | undefined>(undefined);
  const testRunRef = useRef(0);
  const id = account ? accountId(account) : '';
  const query = useQuery({
    queryKey: ['admin', 'accounts', 'models', id],
    queryFn: ({ signal }) => apiJson<unknown>(`/admin/accounts/${encodeURIComponent(id)}/models`, { signal }),
    enabled: Boolean(id),
    staleTime: 0,
    retry: 0,
  });

  useEffect(() => {
    testRunRef.current += 1;
    testControllerRef.current?.abort();
    testControllerRef.current = undefined;
    activeTestRef.current = false;
    setSearch('');
    setManualModel('');
    setTesting(new Set());
    setTestingAll(false);
    setTestProgress(undefined);
    setTestAllError('');
    setTestStates({});
    return () => {
      testRunRef.current += 1;
      testControllerRef.current?.abort();
      testControllerRef.current = undefined;
      activeTestRef.current = false;
    };
  }, [id]);

  const provider = account ? stringValue(account.provider) : '';
  const envelope = findModelEnvelope(query.data);
  const supported = envelope?.supported !== false;
  const models = useMemo(() => normalizeAvailableModels(query.data, provider), [provider, query.data]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return models;
    return models.filter((item) => `${availableModelId(item)} ${item.display_name ?? ''} ${item.label ?? ''} ${item.provider ?? ''}`.toLowerCase().includes(keyword));
  }, [models, search]);

  async function testModel(idToTest: string) {
    const model = idToTest.trim();
    if (!id || !model || activeTestRef.current) return;
    const run = ++testRunRef.current;
    const controller = new AbortController();
    activeTestRef.current = true;
    testControllerRef.current = controller;
    setTestAllError('');
    setTestProgress(undefined);
    setTesting(new Set([model]));
    try {
      const result = await requestModelTest(id, model, controller.signal);
      if (testRunRef.current === run) setTestStates((current) => ({ ...current, [model]: result }));
    } catch (error) {
      if (!controller.signal.aborted && testRunRef.current === run) {
        setTestStates((current) => ({ ...current, [model]: { ok: false, message: modelTestError(error), testedAt: modelTestTime() } }));
      }
    } finally {
      if (testRunRef.current === run) {
        activeTestRef.current = false;
        testControllerRef.current = undefined;
        setTesting(new Set());
      }
    }
  }

  async function testAll() {
    const queue = [...new Set(models.map(availableModelId).filter((model) => Boolean(model)))];
    if (!id || !queue.length || activeTestRef.current) return;
    const run = ++testRunRef.current;
    const controller = new AbortController();
    activeTestRef.current = true;
    testControllerRef.current = controller;
    setTestingAll(true);
    setTestAllError('');
    setTestProgress({ completed: 0, total: queue.length });
    try {
      for (let index = 0; index < queue.length; index += 1) {
        if (controller.signal.aborted || testRunRef.current !== run) return;
        const model = queue[index];
        setTesting(new Set([model]));
        const result = await requestModelTest(id, model, controller.signal);
        if (controller.signal.aborted || testRunRef.current !== run) return;
        setTestStates((current) => ({ ...current, [model]: result }));
        setTestProgress({ completed: index + 1, total: queue.length });
      }
    } catch (error) {
      if (!controller.signal.aborted && testRunRef.current === run) setTestAllError(modelTestError(error));
    } finally {
      if (testRunRef.current === run) {
        activeTestRef.current = false;
        testControllerRef.current = undefined;
        setTesting(new Set());
        setTestingAll(false);
      }
    }
  }

  function closeSheet() {
    testRunRef.current += 1;
    testControllerRef.current?.abort();
    testControllerRef.current = undefined;
    activeTestRef.current = false;
    setTesting(new Set());
    setTestingAll(false);
    setTestProgress(undefined);
    onClose();
  }

  async function copyModel(model: string) {
    await Clipboard.setStringAsync(model);
    setCopiedId(model);
    setTimeout(() => setCopiedId((current) => current === model ? '' : current), 1600);
  }

  const identity = account ? accountIdentity(account) : { primary: '', secondary: '' };
  const manualState = testStates[manualModel.trim()];
  const testsBusy = testingAll || testing.size > 0;
  const manualTestEnabled = Boolean(manualModel.trim()) && !testsBusy;
  const testAllLabel = testingAll && testProgress ? `${testProgress.completed}/${testProgress.total}` : '测试全部';
  return <SheetFrame visible={Boolean(account)} onClose={closeSheet} maxHeight="90%">
    <SheetHeader title="可用模型" subtitle={account ? `${identity.primary} · ${accountProvider(account).label}` : undefined} onClose={closeSheet} />
    <View style={{ height: Math.min(640, Math.max(330, height * 0.7)), gap: 10 }}>
      {query.isLoading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.subtext, fontSize: 11 }}>正在读取账号模型...</Text></View> : query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : !supported ? <View style={{ gap: 12 }}>
        <View style={{ borderRadius: 14, backgroundColor: colors.mutedCard, padding: 12, gap: 4 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>该提供商不支持模型目录</Text><Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 15 }}>输入模型 ID 可直接检查该账号是否可用。</Text></View>
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={manualModel} onChangeText={setManualModel} placeholder="输入模型 ID" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 11, fontSize: 12, fontFamily: 'monospace' }} /><Pressable disabled={!manualTestEnabled} onPress={() => void testModel(manualModel)} style={{ width: 46, height: 44, borderRadius: 12, backgroundColor: manualTestEnabled || testing.has(manualModel.trim()) ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>{testing.has(manualModel.trim()) ? <ActivityIndicator color="#fff" size="small" /> : <Play color="#fff" size={16} />}</Pressable></View>
        {manualState ? <Text style={{ color: manualState.ok ? colors.success : colors.danger, fontSize: 11, lineHeight: 16 }}>{manualState.message} · {manualState.testedAt}</Text> : null}
      </View> : <>
        <View style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' }}>{models.length} 个模型</Text><Pressable disabled={!models.length || testsBusy} onPress={() => void testAll()} style={{ minHeight: 38, paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: models.length ? 1 : 0.45 }}>{testingAll ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={14} />}<Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{testAllLabel}</Text></Pressable></View>
        {testAllError ? <Text numberOfLines={2} style={{ color: colors.danger, fontSize: 10, lineHeight: 14 }}>批量测试已中断：{testAllError}</Text> : null}
        <SearchField value={search} onChangeText={setSearch} placeholder="搜索模型" />
        {account?.models_probe_error ? <Text numberOfLines={2} style={{ color: colors.warning, fontSize: 10, lineHeight: 14 }}>目录探测：{String(account.models_probe_error)}</Text> : null}
        <FlatList
          data={filtered}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item, index) => `${availableModelId(item)}-${index}`}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: filtered.length ? 0 : 1, paddingBottom: 2 }}
          ListEmptyComponent={<EmptyState embedded icon={Boxes} message={models.length ? '没有匹配的模型' : '该账号暂无可用模型'} />}
          renderItem={({ item }) => {
            const model = availableModelId(item);
            const displayName = stringValue(item.display_name ?? item.label ?? item.title);
            const context = modelContext(item);
            const testState = testStates[model];
            const probeError = stringValue(item.probe_error ?? item.last_error);
            const probeTime = formatTimestamp(item.last_probe_at ?? item.probed_at ?? item.last_tested_at);
            const message = testState?.message || probeError;
            const ok = testState ? testState.ok : !probeError;
            return <View style={{ minHeight: 70, borderBottomWidth: 1, borderBottomColor: colors.rowBorder, paddingVertical: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><Boxes color={colors.primary} size={16} /></View><View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text selectable numberOfLines={2} style={{ color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800', fontFamily: 'monospace' }}>{model || '未命名模型'}</Text>{displayName || context ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9 }}>{[displayName !== model ? displayName : '', context].filter(Boolean).join(' · ')}</Text> : null}</View><Pressable accessibilityLabel="复制模型 ID" onPress={() => void copyModel(model)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}>{copiedId === model ? <Check color={colors.success} size={15} /> : <Copy color={colors.subtext} size={15} />}</Pressable><Pressable accessibilityLabel="测试模型" disabled={testsBusy} onPress={() => void testModel(model)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', opacity: testsBusy && !testing.has(model) ? 0.45 : 1 }}>{testing.has(model) ? <ActivityIndicator color={colors.primary} size="small" /> : <Play color={colors.primary} size={15} />}</Pressable></View>
              {message || probeTime ? <Text numberOfLines={2} style={{ marginLeft: 42, color: ok ? colors.success : colors.danger, fontSize: 9, lineHeight: 14 }}>{message || '上次探测成功'}{testState?.testedAt ? ` · ${testState.testedAt}` : probeTime ? ` · ${probeTime}` : ''}</Text> : null}
            </View>;
          }}
        />
      </>}
    </View>
  </SheetFrame>;
}

function warmupDraftFrom(item: ApiRecord): WarmupDraft {
  const nested = recordValue(item.warmup);
  const timesValue = item.warmup_times ?? nested.times;
  const times = Array.isArray(timesValue) ? timesValue.map(String).filter(Boolean) : [];
  let timezone = '';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch { timezone = 'Asia/Shanghai'; }
  return {
    enabled: Boolean(item.warmup_enabled ?? nested.enabled),
    times: times.length ? times : ['07:00'],
    timezone: stringValue(item.warmup_timezone ?? nested.timezone) || timezone,
    model: stringValue(item.warmup_model ?? nested.model),
  };
}

function WarmupSheet({ account, onClose, onSaved }: { account?: ApiRecord; onClose: () => void; onSaved: () => void }) {
  const colors = useAppTheme();
  const id = account ? accountId(account) : '';
  const [draft, setDraft] = useState<WarmupDraft>({ enabled: false, times: ['07:00'], timezone: 'Asia/Shanghai', model: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modelsQuery = useQuery({ queryKey: ['admin', 'accounts', 'warmup-models', id], queryFn: ({ signal }) => apiJson<unknown>(`/admin/accounts/${encodeURIComponent(id)}/models`, { signal }), enabled: Boolean(id), retry: 0 });
  const models = useMemo(() => normalizeAvailableModels(modelsQuery.data, account ? stringValue(account.provider) : ''), [account, modelsQuery.data]);
  const suggestions = models.filter((item) => !draft.model.trim() || availableModelId(item).toLowerCase().includes(draft.model.trim().toLowerCase())).slice(0, 8);
  const timeValid = draft.times.length > 0 && draft.times.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const canSave = !saving && (!draft.enabled || timeValid);
  const timezonePresets = [...new Set(['Asia/Shanghai', 'UTC', 'Asia/Tokyo', 'America/Los_Angeles', draft.timezone].filter(Boolean))];

  useEffect(() => {
    if (account) setDraft(warmupDraftFrom(account));
    setError('');
  }, [id]);

  async function save() {
    if (!account || !canSave) return;
    setSaving(true);
    setError('');
    try {
      await apiJson(`/admin/accounts/${encodeURIComponent(accountId(account))}`, { method: 'PUT', body: JSON.stringify({ warmup: { enabled: draft.enabled, times: [...new Set(draft.times)].sort(), timezone: draft.timezone.trim(), model: draft.model.trim() } }) });
      onSaved();
      onClose();
      Alert.alert('已保存', '定时预热配置已更新。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return <SheetFrame visible={Boolean(account)} onClose={onClose} maxHeight="92%">
    <SheetHeader title="定时预热" subtitle={account ? accountIdentity(account).primary : undefined} onClose={onClose} />
    <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
      <View style={{ minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Clock3 color={draft.enabled ? colors.primary : colors.subtext} size={16} /><View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>启用定时预热</Text><Text style={{ color: colors.subtext, fontSize: 9 }}>按设定时间预先调用上游账号</Text></View><Switch value={draft.enabled} onValueChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>
      <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>执行时间</Text>{draft.times.map((time, index) => <View key={index} style={{ flexDirection: 'row', gap: 7 }}><TextInput value={time} onChangeText={(value) => setDraft((current) => ({ ...current, times: current.times.map((entry, entryIndex) => entryIndex === index ? value : entry) }))} placeholder="07:00" placeholderTextColor={colors.placeholder} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} style={{ flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? colors.border : colors.danger, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 11, fontSize: 12, fontFamily: 'monospace' }} /><Pressable accessibilityLabel="移除时间" disabled={draft.times.length <= 1} onPress={() => setDraft((current) => ({ ...current, times: current.times.filter((_, entryIndex) => entryIndex !== index) }))} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', opacity: draft.times.length <= 1 ? 0.4 : 1 }}><Trash2 color={colors.subtext} size={15} /></Pressable></View>)}<Pressable disabled={draft.times.length >= 8} onPress={() => setDraft((current) => ({ ...current, times: [...current.times, ''] }))} style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Plus color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>添加时间</Text></Pressable></View>
      <AccountInput label="时区" value={draft.timezone} onChangeText={(timezone) => setDraft((current) => ({ ...current, timezone }))} placeholder="留空跟随服务器" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{timezonePresets.map((timezone) => <Pressable key={timezone} onPress={() => setDraft((current) => ({ ...current, timezone }))} style={{ minHeight: 32, paddingHorizontal: 9, borderRadius: 10, backgroundColor: draft.timezone === timezone ? colors.primarySoft : colors.mutedCard, justifyContent: 'center' }}><Text style={{ color: draft.timezone === timezone ? colors.primary : colors.subtext, fontSize: 9, fontWeight: '700' }}>{timezone}</Text></Pressable>)}</View>
      <AccountInput label="预热模型" value={draft.model} onChangeText={(model) => setDraft((current) => ({ ...current, model }))} placeholder="留空自动选择" />
      {suggestions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{suggestions.map((item) => { const model = availableModelId(item); return <Pressable key={model} onPress={() => setDraft((current) => ({ ...current, model }))} style={{ maxWidth: '100%', minHeight: 32, paddingHorizontal: 9, borderRadius: 10, backgroundColor: colors.mutedCard, justifyContent: 'center' }}><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9, fontFamily: 'monospace' }}>{model}</Text></Pressable>; })}</View> : null}
      {account?.warmup_last_at ? <View style={{ borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 9, gap: 4 }}><Text style={{ color: colors.subtext, fontSize: 9 }}>上次执行 · {formatTimestamp(account.warmup_last_at)}</Text>{account.warmup_last_error ? <Text style={{ color: colors.warning, fontSize: 10, lineHeight: 14 }}>{String(account.warmup_last_error)}</Text> : null}</View> : null}
    </ScrollView>
    {draft.enabled && !timeValid ? <Text style={{ color: colors.danger, fontSize: 10 }}>请填写有效时间，格式为 HH:mm。</Text> : null}
    {error ? <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text> : null}
    <Pressable disabled={!canSave} onPress={() => void save()} style={{ minHeight: 48, borderRadius: 13, backgroundColor: canSave ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>{saving ? <ActivityIndicator color="#fff" /> : <Save color="#fff" size={16} />}<Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{saving ? '保存中...' : '保存预热配置'}</Text></Pressable>
  </SheetFrame>;
}

function ImportSheet({ visible, onClose, onImported }: { visible: boolean; onClose: () => void; onImported: () => void }) {
  const colors = useAppTheme();
  const [file, setFile] = useState<DocumentPickerAsset>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>();
  const [resultMode, setResultMode] = useState<'check' | 'import'>('check');

  useEffect(() => {
    if (!visible) {
      setFile(undefined);
      setError('');
      setResult(undefined);
    }
  }, [visible]);

  async function chooseFile() {
    const selection = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/csv', 'text/plain'], copyToCacheDirectory: true, multiple: false });
    if (!selection.canceled && selection.assets[0]) {
      setFile(selection.assets[0]);
      setResult(undefined);
      setError('');
    }
  }

  async function submit(dryRun: boolean) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await apiJson<unknown>('/admin/accounts/import', { method: 'POST', body: multipartBody(file), query: { dry_run: dryRun ? 1 : undefined }, timeoutMs: 120000 });
      setResult(payload);
      setResultMode(dryRun ? 'check' : 'import');
      if (!dryRun) onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文件导入失败');
    } finally {
      setBusy(false);
    }
  }

  return <SheetFrame visible={visible} onClose={onClose} maxHeight="90%">
    <SheetHeader title="导入账号文件" subtitle="JSON、CSV 或文本格式" onClose={onClose} />
    <Pressable disabled={busy} onPress={() => void chooseFile()} style={{ minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: file ? colors.success : colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }}><FileUp color={file ? colors.success : colors.primary} size={17} /><View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: file ? colors.text : colors.subtext, fontSize: 11, fontWeight: '700' }}>{file?.name ?? '选择账号文件'}</Text>{file?.size ? <Text style={{ color: colors.subtext, fontSize: 9 }}>{file.size} bytes</Text> : null}</View></Pressable>
    {file ? <View style={{ flexDirection: 'row', gap: 8 }}><CompactButton icon={SearchX} label="检查文件" busy={busy} onPress={() => void submit(true)} /><CompactButton icon={Upload} label="正式导入" primary busy={busy} onPress={() => void submit(false)} /></View> : null}
    {error ? <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text> : null}
    {result !== undefined ? <View style={{ maxHeight: 280, gap: 7 }}><Text style={{ color: resultMode === 'import' ? colors.success : colors.primary, fontSize: 11, fontWeight: '800' }}>{resultMode === 'import' ? '导入完成' : '文件检查结果'}</Text><ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" style={{ flexGrow: 0 }}><StructuredDataView value={result} /></ScrollView></View> : null}
  </SheetFrame>;
}

function FilterSheet({ mode, options, selected, onSelect, onClose }: { mode: FilterMode; options: ChoiceOption[]; selected: string; onSelect: (key: string) => void; onClose: () => void }) {
  const colors = useAppTheme();
  return <SheetFrame visible={Boolean(mode)} onClose={onClose} maxHeight="72%">
    <SheetHeader title={mode === 'status' ? '筛选状态' : '筛选供应商'} onClose={onClose} />
    <FlatList data={options} bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyExtractor={(item) => item.key} style={{ flexGrow: 0 }} renderItem={({ item }) => <Pressable onPress={() => { onSelect(item.key); onClose(); }} style={({ pressed }) => ({ minHeight: 48, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.62 : 1 })}><View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: selected === item.key ? '800' : '600' }}>{item.label}</Text>{item.detail ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9 }}>{item.detail}</Text> : null}</View>{item.count !== undefined ? <Text style={{ color: colors.subtext, fontSize: 10 }}>{item.count}</Text> : null}{selected === item.key ? <Check color={colors.primary} size={16} /> : null}</Pressable>} />
  </SheetFrame>;
}

export default function AdminAccountsScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [filterMode, setFilterMode] = useState<FilterMode>('');
  const [selectedId, setSelectedId] = useState('');
  const [editingAccount, setEditingAccount] = useState<ApiRecord>();
  const [modelsAccount, setModelsAccount] = useState<ApiRecord>();
  const [warmupAccount, setWarmupAccount] = useState<ApiRecord>();
  const [importVisible, setImportVisible] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [exportingAll, setExportingAll] = useState(false);

  const accounts = useQuery({
    queryKey: ['admin', 'accounts'],
    queryFn: async ({ signal }) => firstArray<ApiRecord>(await apiJson<unknown>('/admin/accounts', { signal }), ['accounts', 'items', 'data', 'list']),
    refetchInterval: autoRefresh ? 30_000 : false,
  });
  const proxies = useQuery({
    queryKey: ['admin', 'proxies', 'account-options'],
    queryFn: async ({ signal }) => firstArray<ApiRecord>(await apiJson<unknown>('/admin/proxies', { signal }), ['proxies', 'items', 'data', 'list']),
    retry: 0,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const allAccounts = accounts.data ?? [];
  const proxyItems = proxies.data ?? [];
  const proxiesLoaded = proxies.isSuccess;
  const selectedAccount = allAccounts.find((item) => accountId(item) === selectedId);
  const providerOptions = useMemo(() => {
    const map = new Map<string, ChoiceOption>();
    for (const item of allAccounts) {
      const provider = accountProvider(item);
      const current = map.get(provider.key);
      map.set(provider.key, { key: provider.key, label: provider.label, detail: provider.key !== provider.label.toLowerCase() ? provider.key : undefined, count: (current?.count ?? 0) + 1 });
    }
    return [{ key: 'all', label: '全部供应商', count: allAccounts.length }, ...[...map.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))];
  }, [allAccounts]);

  const counts = useMemo(() => {
    const statusCounts = Object.fromEntries(statusOrder.map((status) => [status, 0])) as Record<UpstreamAccountStatus, number>;
    let needsAttention = 0;
    for (const item of allAccounts) {
      const status = accountStatus(item, now);
      statusCounts[status] += 1;
      if (accountStatusNeedsAttention(status) || accountEgress(item, proxyItems, proxiesLoaded).missing) needsAttention += 1;
    }
    return { statuses: statusCounts, needsAttention };
  }, [allAccounts, now, proxiesLoaded, proxyItems]);

  const statusOptions = useMemo<ChoiceOption[]>(() => [
    { key: 'all', label: '全部状态', count: allAccounts.length },
    ...statusOrder.map((status) => ({ key: status, label: accountStatusLabels[status], count: counts.statuses[status] })),
  ], [allAccounts.length, counts.statuses]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return allAccounts.filter((item) => {
      if (statusFilter !== 'all' && accountStatus(item, now) !== statusFilter) return false;
      if (providerFilter !== 'all' && accountProvider(item).key !== providerFilter) return false;
      return !keyword || accountSearchText(item, proxyItems, proxiesLoaded).includes(keyword);
    });
  }, [allAccounts, now, providerFilter, proxiesLoaded, proxyItems, search, statusFilter]);

  const selectedStatusLabel = statusFilter === 'all' ? '全部状态' : accountStatusLabels[statusFilter];
  const selectedProviderLabel = providerOptions.find((option) => option.key === providerFilter)?.label ?? '全部供应商';
  const filtersActive = statusFilter !== 'all' || providerFilter !== 'all';

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  }

  async function runAction(key: string, label: string, operation: () => Promise<unknown>) {
    if (busyAction) return;
    setBusyAction(key);
    try {
      await operation();
      setSelectedId('');
      invalidate();
      Alert.alert('已完成', `${label}成功。`);
    } catch (error) {
      Alert.alert(`${label}失败`, error instanceof Error ? error.message : '请求失败');
    } finally {
      setBusyAction('');
    }
  }

  function recoverSelected() {
    if (!selectedAccount) return;
    Alert.alert('恢复账号', `尝试恢复「${accountIdentity(selectedAccount).primary}」？`, [{ text: '取消', style: 'cancel' }, { text: '恢复', onPress: () => void runAction('recover', '恢复账号', () => apiJson(`/admin/accounts/${encodeURIComponent(accountId(selectedAccount))}/recover`, { method: 'POST' })) }]);
  }

  function reauthSelected() {
    if (!selectedAccount) return;
    const proxyId = stringValue(selectedAccount.proxy_id);
    setSelectedId('');
    router.push({ pathname: '/admin-account-import', params: proxyId ? { proxy_id: proxyId } : undefined } as never);
  }

  function toggleSelected() {
    if (!selectedAccount) return;
    const enable = selectedAccount.status === 'disabled';
    Alert.alert(enable ? '启用账号' : '禁用账号', `确定${enable ? '启用' : '禁用'}「${accountIdentity(selectedAccount).primary}」？`, [{ text: '取消', style: 'cancel' }, { text: '确认', style: enable ? 'default' : 'destructive', onPress: () => void runAction('toggle', enable ? '启用账号' : '禁用账号', () => apiJson(`/admin/accounts/${encodeURIComponent(accountId(selectedAccount))}`, { method: 'PUT', body: JSON.stringify({ status: enable ? 'active' : 'disabled' }) })) }]);
  }

  function deleteSelected() {
    if (!selectedAccount) return;
    Alert.alert('删除账号', `确定删除「${accountIdentity(selectedAccount).primary}」吗？该操作不可撤销。`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => void runAction('delete', '删除账号', () => apiJson(`/admin/accounts/${encodeURIComponent(accountId(selectedAccount))}`, { method: 'DELETE' })) }]);
  }

  function confirmExport(ids: string[], count: number, all = false) {
    Alert.alert('导出账号', `确定导出 ${count} 个账号吗？导出文件包含敏感凭据，请妥善保存。`, [{ text: '取消', style: 'cancel' }, { text: '导出', onPress: () => void performExport(ids, count, all) }]);
  }

  async function performExport(ids: string[], count: number, all: boolean) {
    if (all) setExportingAll(true);
    else setBusyAction('export');
    setSelectedId('');
    try {
      const result = await apiFetch('/admin/accounts/export', { method: 'POST', body: JSON.stringify({ ids }), responseType: 'blob', timeoutMs: 120000 });
      await shareExportResult(result);
      Alert.alert('导出完成', `已准备 ${count} 个账号的导出文件。`);
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '请求失败');
    } finally {
      setExportingAll(false);
      setBusyAction('');
    }
  }

  return <>
    <Page title="上游账号" subtitle="账号状态、网络出口与运行维护" icon={CloudCog} safeTop={false} contentMaxWidth={1180} scrollable={false} refreshing={accounts.isFetching} onRefresh={() => { void accounts.refetch(); void proxies.refetch(); }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <CompactButton icon={FileUp} label="导入文件" onPress={() => setImportVisible(true)} />
        <CompactButton icon={Download} label="导出全部" busy={exportingAll} disabled={!allAccounts.length} onPress={() => confirmExport([], allAccounts.length, true)} />
        <CompactButton icon={Plus} label="添加账号" primary onPress={() => router.push('/admin-account-import' as never)} />
      </View>
      <View style={{ minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.rowBorder, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <SummaryMetric label="全部" value={allAccounts.length} />
        <SummaryMetric label="启用" value={counts.statuses.active} tone="success" />
        <SummaryMetric label="需处理" value={counts.needsAttention} tone={counts.needsAttention ? 'danger' : undefined} />
        <SummaryMetric label="禁用" value={counts.statuses.disabled} tone={counts.statuses.disabled ? 'danger' : undefined} />
        <View style={{ marginLeft: wide ? 'auto' : 0, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7 }}><RefreshCw color={autoRefresh ? colors.primary : colors.subtext} size={14} /><Text style={{ color: colors.subtext, fontSize: 10, fontWeight: '600' }}>自动刷新</Text><Switch value={autoRefresh} onValueChange={setAutoRefresh} trackColor={{ false: colors.disabled, true: colors.primary }} style={{ transform: [{ scaleX: 0.78 }, { scaleY: 0.78 }] }} /></View>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 8 }}>
        <View style={{ flex: wide ? 1 : undefined, minHeight: 44 }}><SearchField value={search} onChangeText={setSearch} placeholder="搜索账号、邮箱、供应商或出口" /></View>
        <View style={{ minWidth: wide ? 360 : undefined, flexDirection: 'row', gap: 8 }}><FilterButton icon={Filter} label={selectedStatusLabel} active={statusFilter !== 'all'} onPress={() => setFilterMode('status')} /><FilterButton icon={SlidersHorizontal} label={selectedProviderLabel} active={providerFilter !== 'all'} onPress={() => setFilterMode('provider')} />{filtersActive ? <Pressable accessibilityLabel="清除筛选" onPress={() => { setStatusFilter('all'); setProviderFilter('all'); }} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={15} /></Pressable> : null}</View>
      </View>
      {proxies.error ? <Text style={{ color: colors.warning, fontSize: 9 }}>出口配置暂时无法核对：{proxies.error.message}</Text> : null}
      {accounts.error ? <ErrorState message={accounts.error.message} retry={() => accounts.refetch()} /> : null}
      <FlatList
        data={filtered}
        extraData={now}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyExtractor={(item, index) => accountId(item) || String(index)}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ gap: 8, paddingBottom: 16, flexGrow: filtered.length ? 0 : 1 }}
        ListHeaderComponent={accounts.data ? <Text style={{ color: colors.subtext, fontSize: 9, paddingBottom: 2 }}>显示 {filtered.length} / {allAccounts.length}</Text> : null}
        ListEmptyComponent={accounts.isLoading ? <View style={{ flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View> : <EmptyState icon={filtersActive || search.trim() ? SearchX : CloudCog} message={filtersActive || search.trim() ? '没有匹配的账号' : '暂无上游账号'} />}
        renderItem={({ item }) => <AccountCard item={item} proxies={proxyItems} proxiesLoaded={proxiesLoaded} now={now} onPress={() => setSelectedId(accountId(item))} />}
      />
    </Page>

    <AccountActionsSheet
      account={selectedAccount}
      busyAction={busyAction}
      onClose={() => setSelectedId('')}
      onRecover={recoverSelected}
      onReauth={reauthSelected}
      onEdit={() => { if (selectedAccount) setEditingAccount(selectedAccount); setSelectedId(''); }}
      onModels={() => { if (selectedAccount) setModelsAccount(selectedAccount); setSelectedId(''); }}
      onWarmup={() => { if (selectedAccount) setWarmupAccount(selectedAccount); setSelectedId(''); }}
      onToggle={toggleSelected}
      onExport={() => { if (selectedAccount) confirmExport([accountId(selectedAccount)], 1); }}
      onDelete={deleteSelected}
    />
    <AccountEditSheet account={editingAccount} accounts={allAccounts} proxies={proxyItems} proxiesLoaded={proxiesLoaded} onClose={() => setEditingAccount(undefined)} onSaved={invalidate} />
    <AccountModelsSheet account={modelsAccount} onClose={() => setModelsAccount(undefined)} />
    <WarmupSheet account={warmupAccount} onClose={() => setWarmupAccount(undefined)} onSaved={invalidate} />
    <ImportSheet visible={importVisible} onClose={() => setImportVisible(false)} onImported={invalidate} />
    <FilterSheet mode={filterMode} options={filterMode === 'status' ? statusOptions : providerOptions} selected={filterMode === 'status' ? statusFilter : providerFilter} onSelect={(value) => filterMode === 'status' ? setStatusFilter(value as StatusFilter) : setProviderFilter(value)} onClose={() => setFilterMode('')} />
  </>;
}
