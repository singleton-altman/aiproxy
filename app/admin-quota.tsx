import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CircleAlert, Clock3, Coins, Eye, EyeOff, RefreshCw, Settings2 } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';

import { EmptyState, ErrorState, IconTile, Page, SectionHeader } from '@/src/components/ui';
import { maskAccountIdentity } from '@/src/lib/account-display';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminQuota, refreshAdminQuota } from '@/src/services/admin';
import { setPrivacyMode, usePrivacyMode } from '@/src/store/privacy';
import type { ApiRecord } from '@/src/types/api';

type QuotaGroup = { key: string; label: string; accounts: ApiRecord[] };

const QUOTA_QUERY_KEY = ['admin', 'quota', 'detail'] as const;
const WINDOW_LABELS: Record<string, string> = {
  primary: '主额度',
  secondary: '次额度',
  requests: '请求额度',
  tokens: 'Token 额度',
  tools: '工具额度',
  plan: '套餐额度',
  api: 'API 额度',
  on_demand: '按需额度',
  agentic: 'Agent 额度',
  balance: '可用余额',
  auto: 'Auto 额度',
  composer: 'Composer 额度',
  premium: 'Premium 额度',
  subscription: '订阅额度',
  bonus: '奖励额度',
};
const CYCLE_LABELS: Record<string, string> = {
  day: '每日额度',
  week: '每周额度',
  month: '每月额度',
  year: '每年额度',
};
const SCOPE_LABELS: Record<string, string> = {
  video: '视频',
  tools: '工具',
  mcp: 'MCP',
};

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstText(records: ApiRecord[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
    }
  }
  return '';
}

function firstNumber(records: ApiRecord[], keys: string[]) {
  const value = firstText(records, keys);
  if (!value) return undefined;
  const parsed = Number(value.replace(/[,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function embeddedError(value: unknown) {
  if (typeof value !== 'string') return [];
  const start = value.indexOf('{');
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(value.slice(start));
    if (!isRecord(parsed)) return [];
    return isRecord(parsed.error) ? [parsed, parsed.error] : [parsed];
  } catch {
    return [];
  }
}

function accountSources(account: ApiRecord) {
  const nestedKeys = ['quota', 'usage', 'limits', 'billing', 'metadata', 'period', 'subscription'];
  const sources: ApiRecord[] = [];
  const queue = [account];
  const seen = new Set<ApiRecord>();
  while (queue.length) {
    const source = queue.shift();
    if (!source || seen.has(source)) continue;
    seen.add(source);
    sources.push(source);
    for (const key of nestedKeys) {
      if (isRecord(source[key])) queue.push(source[key] as ApiRecord);
    }
  }
  sources.push(...embeddedError(account.last_error ?? account.error));
  return sources;
}

function quotaGroups(value: unknown): QuotaGroup[] {
  if (!isRecord(value)) return [];
  const rawGroups = Array.isArray(value.groups) ? value.groups : Array.isArray(value.providers) ? value.providers : [];
  const groups = rawGroups.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const accounts = (Array.isArray(entry.accounts) ? entry.accounts : Array.isArray(entry.items) ? entry.items : [])
      .filter(isRecord);
    if (!accounts.length) return [];
    const key = firstText([entry], ['provider', 'id', 'name']) || `provider-${index}`;
    const label = firstText([entry], ['display', 'label', 'name', 'provider']) || key;
    return [{ key, label, accounts }];
  });
  if (groups.length) return groups;
  const accounts = (Array.isArray(value.accounts) ? value.accounts : Array.isArray(value.items) ? value.items : []).filter(isRecord);
  const byProvider = new Map<string, ApiRecord[]>();
  for (const account of accounts) {
    const provider = firstText([account], ['provider', 'provider_name']) || '其他';
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), account]);
  }
  return Array.from(byProvider, ([key, items]) => ({ key, label: key, accounts: items }));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function quotaPercent(source: ApiRecord, account: ApiRecord) {
  const direct = firstNumber([source], ['used_percent', 'usage_percent', 'percent_used']);
  if (direct !== undefined) return clampPercent(direct);
  const ratio = firstNumber([source], ['utilization', 'usage_ratio']);
  if (ratio !== undefined) return clampPercent(ratio <= 1 ? ratio * 100 : ratio);
  const remainingPercent = firstNumber([source], ['remaining_percent', 'percent_remaining']);
  if (remainingPercent !== undefined) return clampPercent(100 - (remainingPercent <= 1 ? remainingPercent * 100 : remainingPercent));
  const used = firstNumber([source], ['used', 'usage', 'consumed', 'used_tokens', 'spent']);
  const limit = firstNumber([source], ['limit', 'total', 'quota', 'max', 'token_limit']);
  if (used !== undefined && limit) return clampPercent(used / limit * 100);
  const remaining = firstNumber([source], ['remaining', 'available']);
  if (remaining !== undefined && limit) return clampPercent((limit - remaining) / limit * 100);
  const error = String(account.last_error ?? account.error ?? '');
  return /usage_limit_reached|usage limit has been reached|rate limited/i.test(error) ? 100 : undefined;
}

function quotaWindows(account: ApiRecord) {
  const sources = accountSources(account);
  for (const source of sources) {
    for (const key of ['windows', 'quota_windows']) {
      if (Array.isArray(source[key])) {
        const windows = source[key].filter(isRecord);
        if (windows.length) return windows;
      }
    }
  }
  const quotaFields = [
    'used_percent', 'usage_percent', 'percent_used', 'utilization', 'usage_ratio',
    'remaining_percent', 'percent_remaining', 'used', 'usage', 'consumed', 'spent',
    'limit', 'total', 'max', 'token_limit', 'remaining', 'available', 'balance',
    'resets_at', 'reset_at', 'reset_time', 'next_reset_at', 'quota_reset_at',
  ];
  const fallback = sources.find((source) => quotaFields.some((key) => source[key] !== undefined && source[key] !== null));
  return fallback ? [fallback] : [];
}

function parseDate(value: unknown) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,13}$/.test(value.trim()))) {
    const number = Number(value);
    return new Date(number < 10_000_000_000 ? number * 1000 : number);
  }
  if (typeof value === 'string' && value.trim()) return new Date(value);
  return undefined;
}

function resetDate(source: ApiRecord) {
  for (const record of accountSources(source)) {
    for (const key of ['resets_at', 'reset_at', 'reset_time', 'next_reset_at', 'quota_reset_at']) {
      const date = parseDate(record[key]);
      if (date && !Number.isNaN(date.getTime())) return date;
    }
  }
  return undefined;
}

function resetLabel(source: ApiRecord) {
  if (firstText([source], ['key']).toLowerCase() === 'on_demand') return '按需结算';
  const date = resetDate(source);
  if (!date) return '等待上游返回重置时间';
  const remaining = date.getTime() - Date.now();
  if (remaining <= 0) return '即将重置';
  const minutes = Math.max(1, Math.floor(remaining / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days}天 ${hours % 24}小时后重置`;
  if (hours) return `${hours}小时 ${minutes % 60}分钟后重置`;
  return `${minutes}分钟后重置`;
}

function formatLastUsed(value: unknown) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '暂无使用记录';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `最近使用 ${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function periodLabel(source: ApiRecord) {
  const sources = accountSources(source);
  const days = firstNumber(sources, ['period_days', 'window_days', 'cycle_days']);
  if (days) return `${days} 天额度`;
  const period = firstText(sources, ['period', 'window', 'quota_period', 'interval']);
  return period || '额度周期';
}

function durationLabel(seconds: number) {
  if (seconds >= 86_400 && seconds % 86_400 === 0) return `${seconds / 86_400} 天额度`;
  if (seconds >= 3_600 && seconds % 3_600 === 0) return `${seconds / 3_600} 小时额度`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分钟额度`;
  return `${seconds} 秒额度`;
}

function refillLabel(source: ApiRecord) {
  const refill = source.refill;
  if (isRecord(refill)) {
    const kind = firstText([refill], ['kind']).toLowerCase();
    const seconds = firstNumber([refill], ['seconds']);
    if (kind === 'rolling' && seconds) return durationLabel(seconds);
    const cycle = firstText([refill], ['cycle']).toLowerCase();
    if (kind === 'cycle' && cycle) return CYCLE_LABELS[cycle] ?? cycle;
  }
  if (typeof refill === 'string') {
    const rolling = refill.match(/^rolling:(\d+)$/i);
    if (rolling) return durationLabel(Number(rolling[1]));
    const cycle = refill.match(/^cycle:(.+)$/i)?.[1]?.toLowerCase();
    if (cycle) return CYCLE_LABELS[cycle] ?? cycle;
  }
  return '';
}

function windowLabel(source: ApiRecord) {
  const key = firstText([source], ['key']).toLowerCase();
  const refill = refillLabel(source);
  const base = refill || WINDOW_LABELS[key] || firstText([source], ['label', 'name']) || periodLabel(source);
  const scope = isRecord(source.scope) ? firstText([source.scope], ['name']).toLowerCase() : '';
  const scopeLabel = scope ? SCOPE_LABELS[scope] ?? scope : '';
  return scopeLabel ? `${scopeLabel} · ${base}` : base;
}

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 });
}

function quotaAmount(source: ApiRecord) {
  const remaining = firstNumber([source], ['remaining', 'available', 'balance', 'credit']);
  const limit = firstNumber([source], ['limit', 'total', 'max']);
  const unit = firstText([source], ['unit', 'currency']);
  return { remaining, limit, unit };
}

function statusDetails(account: ApiRecord) {
  const status = firstText([account], ['status']).toLowerCase();
  const disabled = account.disabled === true || account.enabled === false || status === 'disabled' || status === 'auto_disabled' || status === 'inactive';
  const error = String(account.last_error ?? account.error ?? '');
  if (disabled) return { text: '禁用', tone: 'muted' as const };
  if (status === 'needs_reauth' || /suspend/i.test(`${status} ${account.status_reason ?? ''}`)) return { text: '异常', tone: 'danger' as const };
  if (/usage_limit_reached|rate limited|quota|limit/i.test(`${status} ${error}`)) return { text: '受限', tone: 'danger' as const };
  return { text: '正常', tone: 'success' as const };
}

function QuotaWindowRow({ source, account }: { source: ApiRecord; account: ApiRecord }) {
  const colors = useAppTheme();
  const percent = quotaPercent(source, account);
  const { remaining, limit, unit } = quotaAmount(source);
  const kind = firstText([source], ['kind']).toLowerCase();
  const key = firstText([source], ['key']).toLowerCase();
  const balance = kind === 'balance' || key === 'balance' || key === 'on_demand'
    || (!kind && percent === undefined && remaining !== undefined);
  const unlimited = source.unlimited === true;
  const progressColor = percent !== undefined && percent >= 90
    ? colors.danger
    : percent !== undefined && percent >= 70 ? colors.warning : colors.success;
  const amount = remaining !== undefined
    ? `${formatAmount(remaining)}${unit ? ` ${unit}` : ''}`
    : '';
  const limitText = limit !== undefined && limit > 0
    ? `${balance ? '上限 ' : ''}${formatAmount(limit)}${unit ? ` ${unit}` : ''}`
    : '';

  if (balance) {
    return <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>{windowLabel(source)}</Text>
        <Text numberOfLines={1} style={{ color: amount ? colors.text : colors.subtext, fontSize: amount ? 14 : 10, fontWeight: '800' }}>{amount || '额度待查询'}</Text>
      </View>
      <View style={{ minHeight: 15, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Clock3 color={colors.subtext} size={12} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 9 }}>{resetLabel(source)}</Text>
        {limitText ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9 }}>{limitText}</Text> : null}
      </View>
    </View>;
  }

  const progressWidth = `${Math.max(percent && percent > 0 ? 2 : 0, percent ?? 0)}%` as `${number}%`;
  const remainingText = remaining !== undefined && limit !== undefined
    ? `${formatAmount(remaining)} / ${formatAmount(limit)}${unit ? ` ${unit}` : ''}`
    : amount;
  return <View style={{ gap: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>{windowLabel(source)}</Text>
      <Text numberOfLines={1} style={{ color: unlimited ? colors.success : percent === undefined ? colors.subtext : progressColor, fontSize: 10, fontWeight: '800' }}>
        {unlimited ? '无限' : percent === undefined ? '额度待查询' : `${percent.toFixed(percent >= 10 ? 0 : 1)}% 已用`}
      </Text>
    </View>
    {!unlimited ? <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.chartTrack, overflow: 'hidden' }}>
      <View style={{ width: progressWidth, height: 5, borderRadius: 3, backgroundColor: progressColor }} />
    </View> : null}
    <View style={{ minHeight: 15, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Clock3 color={colors.subtext} size={12} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 9 }}>{resetLabel(source)}</Text>
      {remainingText ? <Text numberOfLines={1} style={{ maxWidth: '48%', color: colors.subtext, fontSize: 9 }}>{remainingText}</Text> : null}
    </View>
  </View>;
}

function QuotaCard({ account, provider, privacy }: { account: ApiRecord; provider: string; privacy: boolean }) {
  const colors = useAppTheme();
  const status = statusDetails(account);
  const sources = accountSources(account);
  const windows = quotaWindows(account);
  const rawTitle = firstText([account], ['label', 'email', 'name', 'username']);
  const rawEmail = firstText([account], ['email']);
  const title = rawTitle ? (privacy ? maskAccountIdentity(rawTitle) : rawTitle) : '未命名账号';
  const subtitle = rawEmail && rawEmail !== rawTitle
    ? (privacy ? maskAccountIdentity(rawEmail) : rawEmail)
    : provider;
  const plan = firstText(sources, ['plan_label', 'plan_type', 'plan', 'tier', 'subscription']) || '未知套餐';
  const priority = firstNumber([account], ['priority']) ?? 0;
  const statusColors = status.tone === 'danger'
    ? { background: colors.dangerBg, foreground: colors.danger }
    : status.tone === 'success'
      ? { background: colors.successBg, foreground: colors.success }
      : { background: colors.mutedCard, foreground: colors.subtext };

  return <View style={{ minHeight: 154, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile icon={Coins} size={34} iconSize={16} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{subtitle}</Text>
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, backgroundColor: statusColors.background }}>
        <Text style={{ color: statusColors.foreground, fontSize: 9, fontWeight: '800' }}>{status.text}</Text>
      </View>
    </View>

    {windows.length ? <View style={{ gap: 9 }}>
      {windows.map((source, index) => <View key={`${firstText([source], ['key', 'label', 'name']) || 'window'}-${index}`} style={{ paddingTop: index ? 9 : 0, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}>
        <QuotaWindowRow source={source} account={account} />
      </View>)}
    </View> : <View style={{ minHeight: 68, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 3 }}>
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>暂无额度数据</Text>
      <Text style={{ color: colors.subtext, fontSize: 9 }}>刷新后等待上游返回额度窗口</Text>
    </View>}

    <View style={{ marginTop: 'auto', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 90, color: colors.subtext, fontSize: 9 }}>{formatLastUsed(account.last_used_at ?? account.last_used)}</Text>
      <View style={{ maxWidth: '34%', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.mutedCard }}><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 8, fontWeight: '700' }}>{plan}</Text></View>
      <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontSize: 8, fontWeight: '700' }}>优先级 {priority}</Text></View>
    </View>
  </View>;
}

export default function AdminQuotaScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const privacy = usePrivacyMode();
  const quota = useQuery({
    queryKey: QUOTA_QUERY_KEY,
    queryFn: ({ signal }) => getAdminQuota(signal),
    refetchInterval: 30_000,
  });
  const groups = quotaGroups(quota.data);
  const accountCount = groups.reduce((total, group) => total + group.accounts.length, 0);
  const refresh = useMutation({
    mutationFn: () => refreshAdminQuota(),
    onSuccess: (result) => {
      if (Array.isArray(result.groups)) queryClient.setQueryData(QUOTA_QUERY_KEY, result);
      else void queryClient.invalidateQueries({ queryKey: ['admin', 'quota'] });
      const refreshed = firstNumber([result], ['refreshed', 'count']);
      const message = firstText([result], ['message']) || (refreshed !== undefined
        ? `已更新 ${refreshed} 个账号的额度数据。`
        : '服务器已完成额度刷新。');
      Alert.alert('额度已刷新', message);
    },
    onError: (error) => Alert.alert('刷新失败', error.message),
  });

  return <Page title="供应商配额" subtitle="按供应商分组，实时展示各上游账号的限额用量" icon={Coins} safeTop={false} refreshing={quota.isFetching || refresh.isPending}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <View style={{ minHeight: 40, paddingLeft: 10, paddingRight: 4, borderRadius: 12, borderWidth: 1, borderColor: privacy.enabled ? colors.primary : colors.border, backgroundColor: privacy.enabled ? colors.primarySoft : colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {privacy.enabled ? <EyeOff color={colors.primary} size={14} /> : <Eye color={colors.subtext} size={14} />}
        <Text style={{ color: privacy.enabled ? colors.primary : colors.text, fontSize: 11, fontWeight: '700' }}>账号脱敏</Text>
        <Switch accessibilityLabel="账号脱敏" value={privacy.enabled} onValueChange={setPrivacyMode} trackColor={{ false: colors.disabled, true: colors.primary }} style={{ transform: [{ scaleX: 0.72 }, { scaleY: 0.72 }] }} />
      </View>
      <Pressable onPress={() => router.push('/admin-providers' as never)} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.65 : 1 })}><Settings2 color={colors.text} size={14} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>查询设置</Text></Pressable>
      <Pressable disabled={refresh.isPending} onPress={() => refresh.mutate()} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: refresh.isPending ? colors.disabled : colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.65 : 1 })}>{refresh.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={14} />}<Text style={{ color: refresh.isPending ? colors.subtext : colors.primary, fontSize: 11, fontWeight: '800' }}>{refresh.isPending ? '刷新中' : '刷新额度'}</Text></Pressable>
      <View style={{ flexGrow: 1 }} />
      <Text style={{ alignSelf: 'center', color: colors.subtext, fontSize: 10 }}>{groups.length} 个供应商 · {accountCount} 个账号</Text>
    </View>

    {quota.error ? <ErrorState message={quota.error.message} retry={() => quota.refetch()} /> : null}
    {groups.map((group) => <View key={group.key} style={{ gap: 10 }}>
      <SectionHeader icon={Coins} title={group.label} meta={`${group.accounts.length} 个账号`} />
      {group.accounts.map((account, index) => <QuotaCard key={String(account.id ?? account.email ?? account.label ?? index)} account={account} provider={group.label} privacy={privacy.enabled} />)}
    </View>)}
    {!quota.isFetching && !quota.error && !groups.length ? <EmptyState icon={CircleAlert} message="暂无可展示的供应商额度" /> : null}
  </Page>;
}
