import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Eye,
  Github,
  Mail,
  Network,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  TestTube,
  Trash2,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { StructuredDataView } from '@/src/components/structured-form';
import { AppSwitch, ErrorState, FullScreenSafeArea, Page, Panel, SectionHeader } from '@/src/components/ui';
import { emailPreviewDocument, normalizeEmailPreview } from '@/src/lib/email-preview';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import {
  getAdminConfig,
  getAdminEmailSettings,
  getAdminEmailTemplateDefaults,
  getAdminGithubSettings,
  runAdminEmailAction,
  updateAdminConfig,
  updateAdminEmailSettings,
  updateAdminGithubSettings,
  validateAdminConfig,
} from '@/src/services/admin';
import { sessionState } from '@/src/store/session';
import type { ApiRecord } from '@/src/types/api';

const tabs = [['config', '系统配置', Settings2], ['email', '邮件设置', Mail], ['github', 'GitHub', Github]] as const;
type Tab = typeof tabs[number][0];
type EmailTemplateMode = 'preview' | 'edit';

const strategies = [
  ['round_robin', '轮询'],
  ['fill_first', '优先填充'],
  ['quota_priority', '额度优先'],
  ['reset_priority', '重置优先'],
] as const;

function record(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizedConfig(value: ApiRecord) {
  const server = record(value.server);
  const routing = record(value.routing);
  const security = record(value.security);
  const usage = record(value.usage);
  const logging = record(value.logging);
  return {
    server: {
      public_url: String(server.public_url ?? ''),
      site_name: String(server.site_name ?? ''),
    },
    routing: {
      strategy: String(routing.strategy ?? 'round_robin'),
      session_affinity: Boolean(routing.session_affinity),
      max_account_switches: numberValue(routing.max_account_switches, -1),
      same_account_retries: numberValue(routing.same_account_retries, -1),
      max_concurrent_per_account: numberValue(routing.max_concurrent_per_account),
      account_cache_ttl_ms: numberValue(routing.account_cache_ttl_ms),
    },
    security: {
      allowed_origins: listValue(security.allowed_origins),
      trusted_proxies: listValue(security.trusted_proxies),
      allow_open_registration: Boolean(security.allow_open_registration),
      require_invite_code: Boolean(security.require_invite_code),
      max_login_attempts: numberValue(security.max_login_attempts),
      lockout_minutes: numberValue(security.lockout_minutes ?? security.lockout_duration),
    },
    usage: {
      enabled: usage.enabled !== false,
      aggregation_minutes: numberValue(usage.aggregation_minutes ?? usage.aggregation_interval),
    },
    logging: {
      level: String(logging.level ?? 'info'),
      retention_days: numberValue(logging.retention_days),
    },
  } satisfies Record<string, ApiRecord>;
}

function configPatch(original: ApiRecord, draft: ApiRecord) {
  const before = normalizedConfig(original);
  const after = normalizedConfig(draft);
  const patch: ApiRecord = {};
  for (const section of Object.keys(after) as Array<keyof typeof after>) {
    const changed: ApiRecord = {};
    const beforeSection = before[section] as ApiRecord;
    for (const [key, value] of Object.entries(after[section] as ApiRecord)) {
      if (JSON.stringify(value) !== JSON.stringify(beforeSection[key])) changed[key] = value;
    }
    if (Object.keys(changed).length) patch[section] = changed;
  }
  return patch;
}

function normalizedEmail(value: ApiRecord) {
  return {
    enabled: Boolean(value.enabled),
    smtp_host: String(value.smtp_host ?? '').trim(),
    smtp_port: numberValue(value.smtp_port, 587),
    username: String(value.username ?? '').trim(),
    password: String(value.password ?? ''),
    from: String(value.from ?? '').trim(),
    from_name: String(value.from_name ?? '').trim(),
    security: String(value.security ?? 'starttls'),
    code_ttl_minutes: numberValue(value.code_ttl_minutes, 10),
    templates: record(value.templates),
  };
}

function ConfigField({ label, value, onChangeText, placeholder, numeric = false, multiline = false, multilineHeight = 84, secure = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean; multilineHeight?: number; secure?: boolean }) {
  const colors = useAppTheme();
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      multiline={multiline}
      secureTextEntry={secure}
      textAlignVertical={multiline ? 'top' : 'center'}
      autoCapitalize="none"
      autoCorrect={false}
      style={{ minHeight: multiline ? multilineHeight : 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0, fontSize: 11, lineHeight: 18 }}
    />
  </View>;
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (value: boolean) => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 48, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>{detail ? <Text style={{ color: colors.subtext, fontSize: 11 }}>{detail}</Text> : null}</View>
    <AppSwitch accessibilityLabel={label} value={value} onValueChange={onChange} />
  </View>;
}

function ChoiceRow({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  const colors = useAppTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{options.map(([key, label]) => <Pressable key={key} onPress={() => onChange(key)} style={{ flexGrow: 1, flexBasis: options.length > 3 ? '44%' : 0, minHeight: 38, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: value === key ? colors.primary : colors.border, backgroundColor: value === key ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: value === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}</View>;
}

function Section({ icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <Panel><SectionHeader icon={icon} title={title} />{children}</Panel>;
}

function SystemConfigForm({ draft, onChange }: { draft: ApiRecord; onChange: (value: ApiRecord) => void }) {
  const colors = useAppTheme();
  const server = record(draft.server);
  const routing = record(draft.routing);
  const security = record(draft.security);
  const usage = record(draft.usage);
  const logging = record(draft.logging);
  const set = (section: string, key: string, value: unknown) => onChange({ ...draft, [section]: { ...record(draft[section]), [key]: value } });
  return <>
    <Section icon={Server} title="站点与服务">
      <ConfigField label="站点名称" value={String(server.site_name ?? '')} onChangeText={(value) => set('server', 'site_name', value)} />
      <ConfigField label="公开地址" value={String(server.public_url ?? '')} onChangeText={(value) => set('server', 'public_url', value)} placeholder="https://proxy.example.com" />
    </Section>
    <Section icon={Network} title="路由策略">
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>账号选择策略</Text>
      <ChoiceRow value={String(routing.strategy ?? 'round_robin')} options={strategies} onChange={(value) => set('routing', 'strategy', value)} />
      <ToggleRow label="会话粘滞" detail="同一会话优先使用同一上游账号" value={Boolean(routing.session_affinity)} onChange={(value) => set('routing', 'session_affinity', value)} />
      <ConfigField label="最大账号切换次数" value={String(routing.max_account_switches ?? -1)} onChangeText={(value) => set('routing', 'max_account_switches', value)} numeric />
      <ConfigField label="同账号重试次数" value={String(routing.same_account_retries ?? -1)} onChangeText={(value) => set('routing', 'same_account_retries', value)} numeric />
      <ConfigField label="单账号最大并发" value={String(routing.max_concurrent_per_account ?? 0)} onChangeText={(value) => set('routing', 'max_concurrent_per_account', value)} numeric />
      <ConfigField label="账号缓存时长 (ms)" value={String(routing.account_cache_ttl_ms ?? 0)} onChangeText={(value) => set('routing', 'account_cache_ttl_ms', value)} numeric />
    </Section>
    <Section icon={ShieldCheck} title="登录与网络安全">
      <ToggleRow label="开放注册" value={Boolean(security.allow_open_registration)} onChange={(value) => set('security', 'allow_open_registration', value)} />
      <ToggleRow label="必须使用邀请码" value={Boolean(security.require_invite_code)} onChange={(value) => set('security', 'require_invite_code', value)} />
      <ConfigField label="最大登录尝试次数" value={String(security.max_login_attempts ?? 0)} onChangeText={(value) => set('security', 'max_login_attempts', value)} numeric />
      <ConfigField label="锁定时长（分钟）" value={String(security.lockout_minutes ?? security.lockout_duration ?? 0)} onChangeText={(value) => set('security', 'lockout_minutes', value)} numeric />
      <ConfigField label="允许的来源" value={listValue(security.allowed_origins).join('\n')} onChangeText={(value) => set('security', 'allowed_origins', listValue(value))} placeholder="每行一个 Origin" multiline />
      <ConfigField label="受信任代理" value={listValue(security.trusted_proxies).join('\n')} onChangeText={(value) => set('security', 'trusted_proxies', listValue(value))} placeholder="每行一个 IP 或 CIDR" multiline />
    </Section>
    <Section icon={BarChart3} title="用量与日志">
      <ToggleRow label="启用用量统计" value={usage.enabled !== false} onChange={(value) => set('usage', 'enabled', value)} />
      <ConfigField label="聚合间隔（分钟）" value={String(usage.aggregation_minutes ?? usage.aggregation_interval ?? 0)} onChangeText={(value) => set('usage', 'aggregation_minutes', value)} numeric />
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>日志级别</Text>
      <ChoiceRow value={String(logging.level ?? 'info')} options={[['debug', 'debug'], ['info', 'info'], ['warn', 'warn'], ['error', 'error']]} onChange={(value) => set('logging', 'level', value)} />
      <ConfigField label="日志保留天数" value={String(logging.retention_days ?? 0)} onChangeText={(value) => set('logging', 'retention_days', value)} numeric />
    </Section>
  </>;
}

function EmailForm({ draft, onChange, scene, onSceneChange, mode, onModeChange, preview, previewLoading, previewError, onPreviewRetry, onRestoreDefaults }: { draft: ApiRecord; onChange: (value: ApiRecord) => void; scene: 'register' | 'reset'; onSceneChange: (value: 'register' | 'reset') => void; mode: EmailTemplateMode; onModeChange: (value: EmailTemplateMode) => void; preview: { subject: string; html: string }; previewLoading: boolean; previewError?: string; onPreviewRetry: () => void; onRestoreDefaults: () => void }) {
  const colors = useAppTheme();
  const templates = record(draft.templates);
  const template = record(templates[scene]);
  const set = (key: string, value: unknown) => onChange({ ...draft, [key]: value });
  const setTemplate = (key: string, value: string) => onChange({ ...draft, templates: { ...templates, [scene]: { ...template, [key]: value } } });
  return <>
    <Section icon={Mail} title="SMTP 设置">
      <ToggleRow label="启用邮件" value={Boolean(draft.enabled)} onChange={(value) => set('enabled', value)} />
      <ConfigField label="SMTP 主机" value={String(draft.smtp_host ?? '')} onChangeText={(value) => set('smtp_host', value)} />
      <ConfigField label="SMTP 端口" value={String(draft.smtp_port ?? 587)} onChangeText={(value) => set('smtp_port', value)} numeric />
      <ConfigField label="用户名" value={String(draft.username ?? '')} onChangeText={(value) => set('username', value)} />
      <ConfigField label="密码" value={String(draft.password ?? '')} onChangeText={(value) => set('password', value)} placeholder="留空保持当前密码" secure />
      <ConfigField label="发件地址" value={String(draft.from ?? '')} onChangeText={(value) => set('from', value)} />
      <ConfigField label="发件人名称" value={String(draft.from_name ?? '')} onChangeText={(value) => set('from_name', value)} />
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>连接安全</Text>
      <ChoiceRow value={String(draft.security ?? 'starttls')} options={[['starttls', 'STARTTLS'], ['tls', 'TLS'], ['none', '无']]} onChange={(value) => set('security', value)} />
      <ConfigField label="验证码有效期（分钟）" value={String(draft.code_ttl_minutes ?? 10)} onChangeText={(value) => set('code_ttl_minutes', value)} numeric />
    </Section>
    <Panel>
      <SectionHeader icon={Mail} title="邮件模板" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
        <View style={{ flex: 1, minWidth: 180 }}><ChoiceRow value={scene} options={[['register', '注册'], ['reset', '密码找回']]} onChange={(value) => onSceneChange(value as 'register' | 'reset')} /></View>
        <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.mutedCard }}>
          {([['preview', '预览', Eye], ['edit', '编辑', Pencil]] as const).map(([key, label, Icon]) => <Pressable key={key} onPress={() => onModeChange(key)} style={{ minHeight: 34, paddingHorizontal: 9, borderRadius: 8, backgroundColor: mode === key ? colors.card : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Icon color={mode === key ? colors.primary : colors.subtext} size={13} /><Text style={{ color: mode === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
        </View>
      </View>
      {mode === 'edit' ? <>
        <ConfigField label="主题" value={String(template.subject ?? '')} onChangeText={(value) => setTemplate('subject', value)} />
        <ConfigField label="正文" value={String(template.body ?? '')} onChangeText={(value) => setTemplate('body', value)} multiline multilineHeight={280} />
        <Pressable onPress={onRestoreDefaults} style={{ minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RotateCcw color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>恢复默认模板</Text></Pressable>
      </> : <>
        <View style={{ minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, paddingHorizontal: 10, justifyContent: 'center' }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 11, lineHeight: 17 }}><Text style={{ color: colors.subtext }}>主题: </Text>{preview.subject || '暂无主题'}</Text></View>
        {previewError ? <ErrorState message={previewError} retry={onPreviewRetry} /> : <View style={{ height: 390, overflow: 'hidden', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#eef1f6' }}>
          {previewLoading && !preview.html ? <ActivityIndicator color={colors.primary} style={{ flex: 1 }} /> : <WebView originWhitelist={['*']} source={{ html: emailPreviewDocument(preview.html || '<div style="padding:24px;color:#64748b;font-family:Arial,sans-serif">暂无模板内容</div>') }} style={{ flex: 1, backgroundColor: '#eef1f6' }} nestedScrollEnabled startInLoadingState renderLoading={() => <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />}/>}
        </View>}
      </>}
    </Panel>
  </>;
}

export default function AdminConfigScreen() {
  const colors = useAppTheme();
  const [tab, setTab] = useState<Tab>('config');
  const [draft, setDraft] = useState<ApiRecord>({});
  const [result, setResult] = useState<unknown>();
  const [resultTitle, setResultTitle] = useState('服务器响应');
  const [testTo, setTestTo] = useState('');
  const [scene, setScene] = useState<'register' | 'reset'>('register');
  const [emailTemplateMode, setEmailTemplateMode] = useState<EmailTemplateMode>('preview');
  const [githubToken, setGithubToken] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'config', tab],
    queryFn: ({ signal }) => tab === 'config' ? getAdminConfig(signal) : tab === 'email' ? getAdminEmailSettings(signal) : getAdminGithubSettings(signal),
  });
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  useEffect(() => {
    setResult(undefined);
    setGithubToken('');
    setEmailTemplateMode('preview');
  }, [tab]);

  const emailTemplate = record(record(draft.templates)[scene]);
  const emailPreviewQuery = useQuery({
    queryKey: ['admin', 'email', 'preview', scene, String(emailTemplate.subject ?? ''), String(emailTemplate.body ?? '')],
    queryFn: () => runAdminEmailAction('preview', { scene, template: emailTemplate }),
    enabled: tab === 'email' && emailTemplateMode === 'preview' && Boolean(emailTemplate.subject || emailTemplate.body),
    staleTime: 30000,
    retry: false,
  });
  const emailPreview = normalizeEmailPreview(emailPreviewQuery.data, emailTemplate, {
    siteName: String(draft.site_name ?? 'AI Proxy'),
    email: sessionState.profile?.email ?? 'user@example.com',
    expiresMinutes: String(draft.code_ttl_minutes ?? 10),
  });

  const save = useMutation({
    mutationFn: () => {
      if (tab === 'config') {
        const patch = configPatch(record(query.data), draft);
        if (!Object.keys(patch).length) throw new Error('配置没有变化');
        return updateAdminConfig(patch);
      }
      if (tab === 'email') return updateAdminEmailSettings(normalizedEmail(draft));
      if (!githubToken.trim()) throw new Error('请输入新的 GitHub 令牌');
      return updateAdminGithubSettings({ token: githubToken.trim() });
    },
    onSuccess: (value) => {
      setResultTitle('保存结果');
      setResult(value);
      setGithubToken('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'config', tab] });
    },
    onError: (error) => Alert.alert('保存失败', error.message),
  });
  const validate = useMutation({
    mutationFn: () => validateAdminConfig(configPatch(record(query.data), draft)),
    onSuccess: (value) => { setResultTitle('校验结果'); setResult(value); },
    onError: (error) => Alert.alert('校验失败', error.message),
  });
  const emailAction = useMutation({
    mutationFn: () => runAdminEmailAction('test', { to: testTo.trim() }),
    onSuccess: (value) => { setResultTitle('测试结果'); setResult(value); },
    onError: (error) => Alert.alert('操作失败', error.message),
  });
  const defaults = useMutation({
    mutationFn: () => getAdminEmailTemplateDefaults(),
    onSuccess: (value) => setDraft((current) => ({ ...current, templates: value })),
    onError: (error) => Alert.alert('读取失败', error.message),
  });
  const clearGithub = useMutation({
    mutationFn: () => updateAdminGithubSettings({ clear_token: true }),
    onSuccess: () => { setGithubToken(''); void query.refetch(); Alert.alert('已清除', 'GitHub 令牌已清除。'); },
    onError: (error) => Alert.alert('清除失败', error.message),
  });

  const github = record(query.data);
  const busy = save.isPending || validate.isPending || emailAction.isPending || defaults.isPending || clearGithub.isPending;
  return <Page title="配置中心" subtitle="系统、邮件与 GitHub 集成" icon={Settings2} safeTop={false} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 13, backgroundColor: colors.mutedCard }}>
      {tabs.map(([key, label, Icon]) => <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: tab === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Icon color={tab === key ? colors.primary : colors.subtext} size={16} /><Text style={{ color: tab === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </View>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {query.isFetching && !query.data ? <ActivityIndicator color={colors.primary} /> : null}

    {tab === 'config' && query.data ? <SystemConfigForm draft={draft} onChange={setDraft} /> : null}
    {tab === 'email' && query.data ? <>
      <EmailForm
        draft={draft}
        onChange={setDraft}
        scene={scene}
        onSceneChange={setScene}
        mode={emailTemplateMode}
        onModeChange={setEmailTemplateMode}
        preview={emailPreview}
        previewLoading={emailPreviewQuery.isFetching}
        previewError={emailPreviewQuery.error?.message}
        onPreviewRetry={() => void emailPreviewQuery.refetch()}
        onRestoreDefaults={() => defaults.mutate()}
      />
      <Panel>
        <SectionHeader icon={TestTube} title="测试发送" />
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>发送至</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <TextInput value={testTo} onChangeText={setTestTo} placeholder={sessionState.profile?.email ?? 'name@example.com'} placeholderTextColor={colors.placeholder} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 11, fontSize: 11 }} />
          <Pressable disabled={busy || !testTo.trim()} onPress={() => emailAction.mutate()} style={{ minWidth: 102, height: 42, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.border, opacity: busy || !testTo.trim() ? 0.5 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{emailAction.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Send color={colors.primary} size={14} />}<Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>发送测试</Text></Pressable>
        </View>
      </Panel>
    </> : null}
    {tab === 'github' && query.data ? <Panel>
      <SectionHeader icon={Github} title="GitHub 集成" meta={github.token_set ? '已设置' : '未设置'} />
      <ConfigField label="访问令牌" value={githubToken} onChangeText={setGithubToken} placeholder={github.token_set ? '输入新令牌以替换' : 'ghp_...'} secure />
      {github.token_set ? <Pressable disabled={busy} onPress={() => Alert.alert('清除 GitHub 令牌', '确定清除当前令牌吗？', [{ text: '取消', style: 'cancel' }, { text: '清除', style: 'destructive', onPress: () => clearGithub.mutate() }])} style={{ minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 color={colors.danger} size={14} /><Text style={{ color: colors.danger, fontSize: 11, fontWeight: '800' }}>清除令牌</Text></Pressable> : null}
    </Panel> : null}

    {query.data ? <View style={{ flexDirection: 'row', gap: 8 }}>
      {tab === 'config' ? <Pressable disabled={busy} onPress={() => validate.mutate()} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ShieldCheck color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>校验</Text></Pressable> : null}
      <Pressable disabled={busy || (tab === 'github' && !githubToken.trim())} onPress={() => save.mutate()} style={{ flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: busy || (tab === 'github' && !githubToken.trim()) ? colors.disabled : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{save.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Save color="#fff" size={15} />}<Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>保存</Text></Pressable>
    </View> : null}

    <Modal visible={result !== undefined} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setResult(undefined)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ maxHeight: '72%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{resultTitle}</Text><Pressable accessibilityLabel="关闭" onPress={() => setResult(undefined)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable></View>
          <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" style={{ flexGrow: 0 }}><StructuredDataView value={result} /></ScrollView>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
