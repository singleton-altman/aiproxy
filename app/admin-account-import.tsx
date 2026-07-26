import { useMutation } from '@tanstack/react-query';
import { CloudDownload, FileInput, KeyRound, Play, RefreshCw, Send, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { Page, Panel, SectionHeader } from '@/src/components/ui';
import { apiJson } from '@/src/lib/api';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type QueryRecord = Record<string, string | number | boolean | null | undefined>;
type Call = { path: string; method: 'GET' | 'POST'; body?: ApiRecord; query?: QueryRecord };

export default function AdminAccountImportScreen() {
  const colors = useAppTheme();
  const [provider, setProvider] = useState('github');
  const [draft, setDraft] = useState<ApiRecord>({ session_id: '', email: '', token: '', profile: '' });
  const [result, setResult] = useState<unknown>();
  const sessionId = draft.session_id ?? draft.state ?? draft.id;
  const call = useMutation({
    mutationFn: ({ path, method, body, query }: Call) => apiJson<ApiRecord>(path, { method, body: method === 'POST' ? JSON.stringify(body ?? draft) : undefined, query: query ?? (method === 'GET' ? { session_id: typeof sessionId === 'string' || typeof sessionId === 'number' ? sessionId : undefined } : undefined), timeoutMs: 60000 }),
    onSuccess: setResult,
    onError: (error) => Alert.alert('请求失败', error.message),
  });

  function run(path: string, method: Call['method'] = 'POST', body?: ApiRecord, query?: QueryRecord) {
    call.mutate({ path, method, body, query });
  }

  return <Page title="账号导入" subtitle="批量导入与 OAuth / Kiro 流程" icon={CloudDownload} safeTop={false} refreshing={call.isPending}>
    <Panel>
      <SectionHeader icon={KeyRound} title="OAuth 参数" />
      <StructuredForm value={{ provider, ...draft }} onChange={(value) => { const { provider: nextProvider, ...rest } = value; setProvider(String(nextProvider ?? provider)); setDraft(rest); }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable disabled={call.isPending} onPress={() => run(`/admin/accounts/oauth/${encodeURIComponent(provider)}/start`)} style={{ flexGrow: 1, minHeight: 42, borderRadius: 11, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Play color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800' }}>开始 OAuth</Text></Pressable>
        <Pressable disabled={call.isPending} onPress={() => run(`/admin/accounts/oauth/${encodeURIComponent(provider)}/poll`, 'GET')} style={{ flexGrow: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RefreshCw color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '800' }}>轮询状态</Text></Pressable>
        <Pressable disabled={call.isPending} onPress={() => run(`/admin/accounts/oauth/${encodeURIComponent(provider)}/submit`)} style={{ flexGrow: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Send color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '800' }}>提交 OAuth</Text></Pressable>
      </View>
    </Panel>

    <Panel>
      <SectionHeader icon={KeyRound} title="Kiro 流程" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable onPress={() => run('/admin/accounts/oauth/kiro/start', 'GET')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Kiro OAuth 开始</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/oauth/kiro/poll', 'GET')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Kiro OAuth 轮询</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/sso/start')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>SSO 开始</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/sso/poll', 'GET')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>SSO 轮询</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/sso/submit')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>SSO 提交</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/sso/cancel')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}><Square color={colors.danger} size={14} /><Text style={{ color: colors.danger, fontWeight: '800' }}>取消 SSO</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/sso/select-profile')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>选择 Profile</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/sso-token')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>提交 SSO Token</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/api-key')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>提交 API Key</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/iam-sso/start')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>IAM SSO 开始</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/kiro/iam-sso/complete')} style={{ flexGrow: 1, minHeight: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>IAM SSO 完成</Text></Pressable>
      </View>
    </Panel>

    <Panel>
      <SectionHeader icon={FileInput} title="批量账号" />
      <StructuredForm value={draft} onChange={setDraft} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable onPress={() => run('/admin/accounts/bulk')} style={{ flexGrow: 1, minHeight: 42, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>批量提交</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/import')} style={{ flexGrow: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>导入数据</Text></Pressable>
        <Pressable onPress={() => run('/admin/accounts/import', 'POST', draft, { dry_run: 1 })} style={{ flexGrow: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>试运行导入</Text></Pressable>
      </View>
    </Panel>

    {result !== undefined ? <Panel><SectionHeader icon={CloudDownload} title="最近响应" /><StructuredDataView value={result} /></Panel> : null}
  </Page>;
}
