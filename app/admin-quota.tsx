import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CircleAlert, Clock3, Coins, RefreshCw, Settings2 } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { EmptyState, ErrorState, IconTile, Page, SectionHeader } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminQuota, refreshAdminQuota } from '@/src/services/admin';
import type { ApiRecord } from '@/src/types/api';

type QuotaGroup = { key: string; label: string; accounts: ApiRecord[] };

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
  const nestedKeys = ['quota', 'usage', 'limits', 'billing', 'metadata'];
  const sources = [account];
  for (const key of nestedKeys) {
    if (isRecord(account[key])) sources.push(account[key] as ApiRecord);
  }
  const quota = sources.find((item) => item === account.quota);
  if (quota) {
    for (const key of ['usage', 'limits', 'period']) {
      if (isRecord(quota[key])) sources.push(quota[key] as ApiRecord);
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

function usagePercent(account: ApiRecord) {
  const sources = accountSources(account);
  const direct = firstNumber(sources, ['used_percent', 'usage_percent', 'percent_used', 'utilization', 'usage_ratio']);
  if (direct !== undefined) return Math.max(0, Math.min(100, direct <= 1 ? direct * 100 : direct));
  const remaining = firstNumber(sources, ['remaining_percent', 'percent_remaining']);
  if (remaining !== undefined) return Math.max(0, Math.min(100, 100 - (remaining <= 1 ? remaining * 100 : remaining)));
  const used = firstNumber(sources, ['used', 'usage', 'consumed', 'used_tokens', 'spent']);
  const limit = firstNumber(sources, ['limit', 'total', 'quota', 'max', 'token_limit']);
  if (used !== undefined && limit) return Math.max(0, Math.min(100, used / limit * 100));
  const error = String(account.last_error ?? account.error ?? '');
  return /usage_limit_reached|usage limit has been reached|rate limited/i.test(error) ? 100 : undefined;
}

function parseDate(value: unknown) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,13}$/.test(value.trim()))) {
    const number = Number(value);
    return new Date(number < 10_000_000_000 ? number * 1000 : number);
  }
  if (typeof value === 'string' && value.trim()) return new Date(value);
  return undefined;
}

function resetDate(account: ApiRecord) {
  const sources = accountSources(account);
  for (const record of sources) {
    for (const key of ['resets_at', 'reset_at', 'reset_time', 'next_reset_at', 'quota_reset_at']) {
      const date = parseDate(record[key]);
      if (date && !Number.isNaN(date.getTime())) return date;
    }
  }
  return undefined;
}

function resetLabel(account: ApiRecord) {
  const date = resetDate(account);
  if (!date) return '等待上游返回重置时间';
  const remaining = date.getTime() - Date.now();
  if (remaining <= 0) return '即将重置';
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `${days}天 ${hours % 24}小时后重置` : `${Math.max(1, hours)}小时后重置`;
}

function formatLastUsed(value: unknown) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '暂无使用记录';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `最近使用 ${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function periodLabel(account: ApiRecord) {
  const sources = accountSources(account);
  const days = firstNumber(sources, ['period_days', 'window_days', 'cycle_days']);
  if (days) return `${days} 天`;
  const period = firstText(sources, ['period', 'window', 'quota_period', 'interval']);
  return period || '额度周期';
}

function statusDetails(account: ApiRecord) {
  const status = firstText([account], ['status']).toLowerCase();
  const disabled = account.disabled === true || account.enabled === false || status === 'disabled' || status === 'inactive';
  const error = String(account.last_error ?? account.error ?? '');
  if (disabled) return { text: '禁用', tone: 'muted' as const };
  if (/usage_limit_reached|rate limited|quota|limit/i.test(`${status} ${error}`)) return { text: '受限', tone: 'danger' as const };
  return { text: '正常', tone: 'success' as const };
}

function QuotaCard({ account, provider }: { account: ApiRecord; provider: string }) {
  const colors = useAppTheme();
  const percent = usagePercent(account);
  const status = statusDetails(account);
  const sources = accountSources(account);
  const title = firstText([account], ['label', 'email', 'name', 'username']) || '未命名账号';
  const plan = firstText(sources, ['plan_type', 'plan', 'tier', 'subscription']) || '未知套餐';
  const priority = firstNumber([account], ['priority']) ?? 0;
  const progressColor = percent !== undefined && percent >= 90 ? colors.danger : percent !== undefined && percent >= 70 ? colors.warning : colors.success;
  const statusColors = status.tone === 'danger'
    ? { background: colors.dangerBg, foreground: colors.danger }
    : status.tone === 'success'
      ? { background: colors.successBg, foreground: colors.success }
      : { background: colors.mutedCard, foreground: colors.subtext };

  return <View style={{ minHeight: 154, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 9 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile icon={Coins} size={34} iconSize={16} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{provider}</Text>
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, backgroundColor: statusColors.background }}>
        <Text style={{ color: statusColors.foreground, fontSize: 9, fontWeight: '800' }}>{status.text}</Text>
      </View>
    </View>

    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' }}>{periodLabel(account)}</Text>
        <Text style={{ color: percent === undefined ? colors.subtext : progressColor, fontSize: 10, fontWeight: '800' }}>{percent === undefined ? '额度待查询' : `${percent.toFixed(percent >= 10 ? 0 : 1)}% 已用`}</Text>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.chartTrack, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(percent ? 2 : 0, percent ?? 0)}%`, height: 5, borderRadius: 3, backgroundColor: progressColor }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Clock3 color={colors.subtext} size={12} /><Text style={{ color: colors.subtext, fontSize: 9 }}>{resetLabel(account)}</Text></View>
    </View>

    <View style={{ marginTop: 'auto', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 9 }}>{formatLastUsed(account.last_used_at ?? account.last_used)}</Text>
      <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.subtext, fontSize: 8, fontWeight: '700' }}>{plan}</Text></View>
      <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontSize: 8, fontWeight: '700' }}>优先级 {priority}</Text></View>
    </View>
  </View>;
}

export default function AdminQuotaScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const quota = useQuery({ queryKey: ['admin', 'quota', 'detail'], queryFn: ({ signal }) => getAdminQuota(signal) });
  const groups = quotaGroups(quota.data);
  const accountCount = groups.reduce((total, group) => total + group.accounts.length, 0);
  const refresh = useMutation({
    mutationFn: () => refreshAdminQuota(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'quota'] });
      Alert.alert('额度已刷新', result && typeof result === 'object' && 'message' in result ? String(result.message) : '服务器已完成额度刷新。');
    },
    onError: (error) => Alert.alert('刷新失败', error.message),
  });

  return <Page title="供应商配额" subtitle="按供应商分组，实时展示各上游账号的限额用量" icon={Coins} safeTop={false} refreshing={quota.isFetching || refresh.isPending}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Pressable onPress={() => router.push('/admin-providers' as never)} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.65 : 1 })}><Settings2 color={colors.text} size={14} /><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>查询设置</Text></Pressable>
      <Pressable disabled={refresh.isPending} onPress={() => refresh.mutate()} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: refresh.isPending ? colors.disabled : colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.65 : 1 })}>{refresh.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={14} />}<Text style={{ color: refresh.isPending ? colors.subtext : colors.primary, fontSize: 11, fontWeight: '800' }}>{refresh.isPending ? '刷新中' : '刷新额度'}</Text></Pressable>
      <View style={{ flexGrow: 1 }} />
      <Text style={{ alignSelf: 'center', color: colors.subtext, fontSize: 10 }}>{groups.length} 个供应商 · {accountCount} 个账号</Text>
    </View>

    {quota.error ? <ErrorState message={quota.error.message} retry={() => quota.refetch()} /> : null}
    {groups.map((group) => <View key={group.key} style={{ gap: 10 }}>
      <SectionHeader icon={Coins} title={group.label} meta={`${group.accounts.length} 个账号`} />
      {group.accounts.map((account, index) => <QuotaCard key={String(account.id ?? account.email ?? account.label ?? index)} account={account} provider={group.label} />)}
    </View>)}
    {!quota.isFetching && !quota.error && !groups.length ? <EmptyState icon={CircleAlert} message="暂无可展示的供应商额度" /> : null}
  </Page>;
}
