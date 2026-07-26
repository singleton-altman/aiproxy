import { useMutation, useQuery } from '@tanstack/react-query';
import { Github, Mail, Save, Settings2, ShieldCheck, TestTube, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
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

export default function AdminConfigScreen() {
  const colors = useAppTheme();
  const [tab, setTab] = useState<Tab>('config');
  const [draft, setDraft] = useState<ApiRecord>({});
  const [result, setResult] = useState<unknown>();
  const [operation, setOperation] = useState<'test' | 'preview' | ''>('');
  const query = useQuery({
    queryKey: ['admin', 'config', tab],
    queryFn: ({ signal }) => tab === 'config' ? getAdminConfig(signal) : tab === 'email' ? getAdminEmailSettings(signal) : getAdminGithubSettings(signal),
  });
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => tab === 'config' ? updateAdminConfig(draft) : tab === 'email' ? updateAdminEmailSettings(draft) : updateAdminGithubSettings(draft),
    onSuccess: (value) => { setResult(value); void queryClient.invalidateQueries({ queryKey: ['admin', 'config', tab] }); },
    onError: (error) => Alert.alert('保存失败', error.message),
  });
  const validate = useMutation({
    mutationFn: () => validateAdminConfig(draft),
    onSuccess: setResult,
    onError: (error) => Alert.alert('校验失败', error.message),
  });
  const emailAction = useMutation({
    mutationFn: (action: 'test' | 'preview') => runAdminEmailAction(action, {
      ...draft,
      to: draft.to ?? draft.recipient ?? sessionState.profile?.email ?? '',
    }),
    onSuccess: setResult,
    onError: (error) => Alert.alert('操作失败', error.message),
  });
  const defaults = useMutation({
    mutationFn: () => getAdminEmailTemplateDefaults(),
    onSuccess: setResult,
    onError: (error) => Alert.alert('读取失败', error.message),
  });

  const title = tabs.find(([key]) => key === tab)?.[1] ?? '配置';
  return <Page title="配置中心" subtitle="系统、邮件与 GitHub 集成" icon={Settings2} safeTop={false} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 13, backgroundColor: colors.mutedCard }}>
      {tabs.map(([key, label, Icon]) => <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: tab === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Icon color={tab === key ? colors.primary : colors.subtext} size={16} /><Text style={{ color: tab === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </View>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <Panel>
      <SectionHeader icon={tabs.find(([key]) => key === tab)?.[2] ?? Settings2} title={title} />
      <StructuredForm value={draft} onChange={setDraft} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable disabled={save.isPending} onPress={() => save.mutate()} style={{ flexGrow: 1, minHeight: 44, borderRadius: 11, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Save color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>{save.isPending ? '保存中...' : '保存'}</Text></Pressable>
        {tab === 'config' ? <Pressable disabled={validate.isPending} onPress={() => validate.mutate()} style={{ flexGrow: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ShieldCheck color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>校验配置</Text></Pressable> : null}
        {tab === 'email' ? <>
          <Pressable onPress={() => { setOperation('test'); emailAction.mutate('test'); }} style={{ flexGrow: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><TestTube color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>测试邮件</Text></Pressable>
          <Pressable onPress={() => { setOperation('preview'); emailAction.mutate('preview'); }} style={{ flexGrow: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Mail color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>预览模板</Text></Pressable>
          <Pressable onPress={() => defaults.mutate()} style={{ flexGrow: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>默认模板</Text></Pressable>
        </> : null}
      </View>
    </Panel>
    <Modal visible={result !== undefined} transparent animationType="fade" onRequestClose={() => setResult(undefined)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' }}><View style={{ maxHeight: '80%', borderRadius: 18, backgroundColor: colors.page, padding: 18, gap: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{operation === 'test' ? '测试结果' : operation === 'preview' ? '模板预览' : '服务器响应'}</Text><Pressable accessibilityLabel="关闭" onPress={() => setResult(undefined)}><X color={colors.subtext} size={20} /></Pressable></View><ScrollView><StructuredDataView value={result} /></ScrollView></View></View>
    </Modal>
  </Page>;
}
