import { Package } from 'lucide-react-native';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ResourceScreen } from '@/src/components/resource-screen';
import { AppSwitch } from '@/src/components/ui';
import { apiJson, firstArray } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

const metrics = [
  ['requests', '请求数'],
  ['total_tokens', '总 Token'],
  ['input_tokens', '输入 Token'],
  ['output_tokens', '输出 Token'],
  ['cost_usd', '费用'],
] as const;

function planId(item: ApiRecord) {
  return String(item.id ?? item.name ?? '');
}

function record(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function modelsText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join('\n') : '';
}

function initialPlan(item?: ApiRecord): ApiRecord {
  const limits = record(item?.quota_limits);
  return {
    name: item?.name ?? '',
    description: item?.description ?? '',
    type: item?.type === 'budget' ? 'budget' : 'quota',
    monthly_budget: item?.monthly_budget ?? 0,
    active: item?.active !== false,
    metric: limits.metric ?? 'requests',
    window_hours: limits.window_hours ?? 5,
    window_limit: limits.window_limit ?? 100,
    daily_limit: limits.daily_limit ?? 500,
    weekly_limit: limits.weekly_limit ?? 2000,
    allowed_models_text: modelsText(item?.allowed_models),
  };
}

function planPayload(value: ApiRecord) {
  const type = value.type === 'budget' ? 'budget' : 'quota';
  const allowedModels = String(value.allowed_models_text ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item, index, items) => item && items.indexOf(item) === index);
  const common = {
    name: String(value.name ?? '').trim(),
    type,
    description: String(value.description ?? '').trim(),
    currency: 'USD',
    active: Boolean(value.active),
    allowed_models: allowedModels,
  };
  if (type === 'budget') {
    return { ...common, monthly_budget: numberValue(value.monthly_budget), quota_limits: {} };
  }
  return {
    ...common,
    monthly_budget: 0,
    quota_limits: {
      window_hours: numberValue(value.window_hours, 5),
      window_limit: numberValue(value.window_limit, 100),
      daily_limit: numberValue(value.daily_limit, 500),
      weekly_limit: numberValue(value.weekly_limit, 2000),
      metric: String(value.metric ?? 'requests'),
    },
  };
}

function validatePlan(value: ApiRecord) {
  if (!String(value.name ?? '').trim()) return '请填写套餐名称';
  const fields = value.type === 'budget'
    ? [value.monthly_budget]
    : [value.window_hours, value.window_limit, value.daily_limit, value.weekly_limit];
  if (fields.some((field) => !Number.isFinite(Number(field)) || Number(field) < 0)) return '额度数值必须大于或等于 0';
  if (value.type !== 'budget' && numberValue(value.window_hours) < 1) return '滚动窗口至少为 1 小时';
  return undefined;
}

function PlanField({ label, value, onChangeText, placeholder, numeric = false, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean }) {
  const colors = useAppTheme();
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      autoCapitalize="none"
      autoCorrect={false}
      style={{ minHeight: multiline ? 76 : 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0, fontSize: 12, lineHeight: 18 }}
    />
  </View>;
}

function PlanForm({ value, onChange }: { value: ApiRecord; onChange: (value: ApiRecord) => void }) {
  const colors = useAppTheme();
  const type = value.type === 'budget' ? 'budget' : 'quota';
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  return <View style={{ gap: 12 }}>
    <PlanField label="套餐名称" value={String(value.name ?? '')} onChangeText={(next) => set('name', next)} placeholder="例如：专业版" />
    <PlanField label="说明" value={String(value.description ?? '')} onChangeText={(next) => set('description', next)} placeholder="套餐用途与适用对象" multiline />
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>限制类型</Text>
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        {([['quota', '用量额度'], ['budget', '月度预算']] as const).map(([key, label]) => <Pressable key={key} onPress={() => set('type', key)} style={{ flex: 1, minHeight: 38, borderRadius: 9, backgroundColor: type === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: type === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </View>
    </View>
    {type === 'budget' ? <PlanField label="每月预算 (USD)" value={String(value.monthly_budget ?? 0)} onChangeText={(next) => set('monthly_budget', next)} numeric /> : <>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>计量指标</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          {metrics.map(([key, label]) => <Pressable key={key} onPress={() => set('metric', key)} style={{ flexGrow: 1, flexBasis: '30%', minHeight: 38, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: value.metric === key ? colors.primary : colors.border, backgroundColor: value.metric === key ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: value.metric === key ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text></Pressable>)}
        </View>
      </View>
      <PlanField label="滚动窗口（小时）" value={String(value.window_hours ?? 5)} onChangeText={(next) => set('window_hours', next)} numeric />
      <PlanField label="窗口额度" value={String(value.window_limit ?? 100)} onChangeText={(next) => set('window_limit', next)} numeric />
      <PlanField label="每日额度" value={String(value.daily_limit ?? 500)} onChangeText={(next) => set('daily_limit', next)} numeric />
      <PlanField label="每周额度" value={String(value.weekly_limit ?? 2000)} onChangeText={(next) => set('weekly_limit', next)} numeric />
      <Text style={{ color: colors.subtext, fontSize: 10 }}>额度填写 0 表示不限制。</Text>
    </>}
    <PlanField label="允许的模型" value={String(value.allowed_models_text ?? '')} onChangeText={(next) => set('allowed_models_text', next)} placeholder="每行一个模型；留空允许全部模型" multiline />
    <View style={{ minHeight: 48, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>套餐上架</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>用户端只展示已上架套餐</Text></View>
      <AppSwitch accessibilityLabel="套餐上架" value={Boolean(value.active)} onValueChange={(next) => set('active', next)} />
    </View>
  </View>;
}

function planSummary(item: ApiRecord) {
  if (item.type === 'budget') return `月度预算 $${numberValue(item.monthly_budget).toFixed(2)} · ${item.description || '无说明'}`;
  const limits = record(item.quota_limits);
  const metric = metrics.find(([key]) => key === limits.metric)?.[1] ?? String(limits.metric ?? '请求数');
  return `${metric} · 窗口 ${numberValue(limits.window_limit)} / ${numberValue(limits.window_hours, 5)} 小时 · 每日 ${numberValue(limits.daily_limit)} · 每周 ${numberValue(limits.weekly_limit)}`;
}

export default function AdminPlansScreen() {
  return <ResourceScreen
    title="套餐管理"
    subtitle="预算、用量额度与模型权限"
    icon={Package}
    queryKey={['admin', 'plans']}
    fetchItems={async (signal) => firstArray(await apiJson('/admin/plans', { signal }), ['plans', 'items', 'data', 'list'])}
    idOf={planId}
    titleOf={(item) => String(item.name ?? planId(item)) || '套餐'}
    subtitleOf={planSummary}
    badgeOf={(item) => item.active === false ? { text: '已下架', tone: 'muted' } : { text: '已上架', tone: 'success' }}
    toggle={{
      label: '套餐上架',
      value: (item) => item.active !== false,
      run: (item, active) => apiJson(`/admin/plans/${encodeURIComponent(planId(item))}`, { method: 'PUT', body: JSON.stringify({ active }) }),
    }}
    create={{
      label: '创建套餐',
      template: initialPlan(),
      renderForm: ({ value, onChange }) => <PlanForm value={value} onChange={onChange} />,
      validate: validatePlan,
      submitLabel: '创建套餐',
      run: (value) => apiJson('/admin/plans', { method: 'POST', body: JSON.stringify(planPayload(value)) }),
    }}
    edit={{
      pick: initialPlan,
      renderForm: ({ value, onChange }) => <PlanForm value={value} onChange={onChange} />,
      validate: validatePlan,
      submitLabel: '保存套餐',
      run: (item, value) => apiJson(`/admin/plans/${encodeURIComponent(planId(item))}`, { method: 'PUT', body: JSON.stringify(planPayload(value)) }),
    }}
    remove={{
      confirm: (item) => `确定删除套餐「${item.name ?? planId(item)}」吗？`,
      run: (item) => apiJson(`/admin/plans/${encodeURIComponent(planId(item))}`, { method: 'DELETE' }),
    }}
  />;
}
