import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ChevronRight,
  FileText,
  History,
  Info,
  Power,
  RefreshCw,
  Save,
  ScrollText,
  ServerCog,
  Settings2,
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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  EmptyState,
  ErrorState,
  FullScreenSafeArea,
  Page,
  Panel,
  ResponsiveTabBar,
  SearchField,
  SectionHeader,
} from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import {
  checkAdminUpdates,
  getAdminAppLogs,
  getAdminSystemInfo,
  getAdminUpdateSettings,
  runAdminSystemAction,
  updateAdminUpdateSettings,
} from '@/src/services/admin';
import type { ApiRecord } from '@/src/types/api';

type SystemTab = 'overview' | 'settings' | 'logs';
type SystemAction = 'update' | 'restart' | 'rollback';

const tabs = [
  ['overview', '概览', Info],
  ['settings', '更新设置', Settings2],
  ['logs', '运行日志', ScrollText],
] as const;

const actionLabels: Record<SystemAction, string> = {
  update: '执行更新',
  restart: '重启服务',
  rollback: '回滚版本',
};

const settingLabels: Record<string, string> = {
  allow_self_update: '允许自更新',
  auto_check: '自动检查更新',
  auto_update: '自动安装更新',
  enabled: '启用更新功能',
  check_interval: '检查间隔',
  channel: '更新通道',
  github_proxy: 'GitHub 代理',
  proxy_url: '代理地址',
};

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unwrapRecord(value: unknown): ApiRecord {
  if (!isRecord(value)) return {};
  return isRecord(value.data) ? value.data : value;
}

function firstValue(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '--';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function updateDetails(value: unknown) {
  const update = unwrapRecord(value);
  const release = isRecord(update.release_info)
    ? update.release_info
    : isRecord(update.release)
      ? update.release
      : {};
  const notes = firstValue(release, ['body', 'notes', 'description', 'changelog'])
    ?? firstValue(update, ['release_notes', 'changelog', 'notes']);

  return { update, release, notes: typeof notes === 'string' ? notes : '' };
}

function FieldGrid({ fields }: { fields: Array<[string, unknown]> }) {
  const colors = useAppTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {fields.map(([label, value]) => <View key={label} style={{ flexGrow: 1, flexBasis: '46%', minWidth: 0, minHeight: 54, borderRadius: 12, backgroundColor: colors.mutedCard, paddingHorizontal: 10, paddingVertical: 8, gap: 3 }}>
      <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: '600' }}>{label}</Text>
      <Text selectable numberOfLines={2} style={{ color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>{displayValue(value)}</Text>
    </View>)}
  </View>;
}

function ActionButton({ action, icon: Icon, color, busy, pending, onPress }: { action: SystemAction; icon: typeof Power; color: string; busy: boolean; pending: boolean; onPress: () => void }) {
  return <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 140, minHeight: 42, paddingHorizontal: 10, borderRadius: 12, backgroundColor: color, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.55 : pressed ? 0.72 : 1 })}>
    {pending ? <ActivityIndicator color="#fff" size="small" /> : <Icon color="#fff" size={15} />}
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{actionLabels[action]}</Text>
  </Pressable>;
}

function OverviewTab({ active }: { active: boolean }) {
  const colors = useAppTheme();
  const [notesVisible, setNotesVisible] = useState(false);

  const infoQuery = useQuery({
    queryKey: ['admin', 'system', 'info'],
    queryFn: ({ signal }) => getAdminSystemInfo(signal),
    enabled: active,
  });
  const updateQuery = useQuery({
    queryKey: ['admin', 'system', 'updates'],
    queryFn: ({ signal }) => checkAdminUpdates(false, signal),
    enabled: active,
    retry: 0,
  });
  const actionMutation = useMutation({
    mutationFn: (action: SystemAction) => runAdminSystemAction(action),
    onSuccess: (_, action) => Alert.alert('已提交', `${actionLabels[action]}请求已发送，服务可能短暂不可用。`),
    onError: (error) => Alert.alert('操作失败', error.message),
  });

  const info = unwrapRecord(infoQuery.data);
  const { update, release, notes } = updateDetails(updateQuery.data);
  const currentVersion = firstValue(update, ['current_version', 'version']) ?? firstValue(info, ['version', 'current_version']);
  const latestVersion = firstValue(update, ['latest_version', 'new_version']) ?? firstValue(release, ['tag_name', 'version', 'name']);
  const hasUpdate = firstValue(update, ['has_update', 'update_available', 'available']);

  function confirmAction(action: SystemAction) {
    Alert.alert(`确认${actionLabels[action]}`, '该操作会影响线上服务，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确认执行', style: 'destructive', onPress: () => actionMutation.mutate(action) },
    ]);
  }

  if (!active) return null;
  return <>
    {infoQuery.error ? <ErrorState message={infoQuery.error.message} retry={() => infoQuery.refetch()} /> : null}
    <Panel>
      <SectionHeader icon={ServerCog} title="系统信息" />
      {infoQuery.isFetching && !infoQuery.data ? <ActivityIndicator color={colors.primary} /> : <FieldGrid fields={[
        ['当前版本', firstValue(info, ['version', 'current_version'])],
        ['镜像版本', firstValue(info, ['image_version', 'docker_image_version'])],
        ['构建时间', firstValue(info, ['build_date', 'build_time'])],
        ['构建类型', firstValue(info, ['build_type', 'edition'])],
        ['提交版本', firstValue(info, ['commit', 'commit_hash', 'git_commit'])],
        ['部署模式', firstValue(info, ['deploy_mode', 'deployment_mode'])],
        ['Go 版本', firstValue(info, ['go_version', 'runtime_version'])],
        ['系统架构', firstValue(info, ['os_arch', 'arch', 'platform'])],
      ]} />}
    </Panel>

    <Panel>
      <SectionHeader icon={ArrowDownToLine} title="版本更新" meta={hasUpdate === true ? '有新版本' : hasUpdate === false ? '已是最新' : undefined} />
      {updateQuery.error ? <Text style={{ color: colors.danger, fontSize: 12 }}>更新检查暂不可用：{updateQuery.error.message}</Text> : null}
      {updateQuery.isFetching && !updateQuery.data ? <ActivityIndicator color={colors.primary} /> : <FieldGrid fields={[
        ['当前版本', currentVersion],
        ['最新版本', latestVersion],
      ]} />}

      {notes ? <Pressable onPress={() => setNotesVisible(true)} style={({ pressed }) => ({ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.65 : 1 })}>
        <FileText color={colors.primary} size={15} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>查看更新说明</Text>
        <ChevronRight color={colors.subtext} size={15} />
      </Pressable> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable disabled={updateQuery.isFetching} onPress={() => void updateQuery.refetch()} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 140, minHeight: 42, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: updateQuery.isFetching ? 0.55 : pressed ? 0.65 : 1 })}>
          {updateQuery.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={15} />}
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>重新检查</Text>
        </Pressable>
        <ActionButton action="update" icon={ArrowDownToLine} color={colors.primary} busy={actionMutation.isPending} pending={actionMutation.isPending && actionMutation.variables === 'update'} onPress={() => confirmAction('update')} />
        <ActionButton action="restart" icon={Power} color={colors.warning} busy={actionMutation.isPending} pending={actionMutation.isPending && actionMutation.variables === 'restart'} onPress={() => confirmAction('restart')} />
        <ActionButton action="rollback" icon={History} color={colors.danger} busy={actionMutation.isPending} pending={actionMutation.isPending && actionMutation.variables === 'rollback'} onPress={() => confirmAction('rollback')} />
      </View>
    </Panel>

    <Modal visible={notesVisible} transparent animationType="fade" onRequestClose={() => setNotesVisible(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.48)' }}>
        <View style={{ width: '100%', maxWidth: 720, maxHeight: '82%', alignSelf: 'center', borderRadius: 18, backgroundColor: colors.page, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <FileText color={colors.primary} size={18} />
            <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>更新说明</Text>
            <Pressable accessibilityLabel="关闭" onPress={() => setNotesVisible(false)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable>
          </View>
          <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: 8 }}><Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 20 }}>{notes}</Text></ScrollView>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </>;
}

function SettingsTab({ active }: { active: boolean }) {
  const colors = useAppTheme();
  const [draft, setDraft] = useState<ApiRecord>({});
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const query = useQuery({
    queryKey: ['admin', 'system', 'update-settings'],
    queryFn: ({ signal }) => getAdminUpdateSettings(signal),
    enabled: active,
    retry: 0,
  });
  const saveMutation = useMutation({
    mutationFn: () => updateAdminUpdateSettings(draft),
    onSuccess: () => {
      void query.refetch();
      Alert.alert('已保存', '更新设置已保存。');
    },
    onError: (error) => Alert.alert('保存失败', error.message),
  });

  useEffect(() => {
    if (query.data) setDraft(unwrapRecord(query.data));
  }, [query.data]);

  const entries = Object.entries(draft);
  const booleanEntries = entries.filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean');
  const primitiveEntries = entries.filter((entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number');
  const advancedEntries = entries.filter(([, value]) => isRecord(value) || Array.isArray(value) || value === null);
  const advancedData = Object.fromEntries(advancedEntries);

  function updatePrimitive(key: string, previous: string | number, value: string) {
    const next = typeof previous === 'number' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
    setDraft((current) => ({ ...current, [key]: next }));
  }

  if (!active) return null;
  return <>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <Panel>
      <SectionHeader icon={Settings2} title="更新设置" meta={`${entries.length} 项`} />
      {query.isFetching && !query.data ? <ActivityIndicator color={colors.primary} /> : null}
      {booleanEntries.map(([key, value]) => <View key={key} style={{ minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{settingLabels[key] ?? key}</Text>
          {settingLabels[key] ? <Text style={{ color: colors.subtext, fontSize: 10 }}>{key}</Text> : null}
        </View>
        <Switch value={value} onValueChange={(next) => setDraft((current) => ({ ...current, [key]: next }))} trackColor={{ false: colors.disabled, true: colors.primary }} />
      </View>)}

      {primitiveEntries.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {primitiveEntries.map(([key, value]) => <View key={key} style={{ flexGrow: 1, flexBasis: '46%', minWidth: 180, gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{settingLabels[key] ?? key}</Text>
          <TextInput
            value={String(value)}
            onChangeText={(next) => updatePrimitive(key, value, next)}
            keyboardType={typeof value === 'number' ? 'numeric' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.placeholder}
            style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 11, color: colors.text, fontSize: 12 }}
          />
        </View>)}
      </View> : null}

      {advancedEntries.length ? <Pressable onPress={() => setAdvancedVisible(true)} style={({ pressed }) => ({ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.65 : 1 })}>
        <Settings2 color={colors.subtext} size={15} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>高级配置</Text>
        <Text style={{ color: colors.subtext, fontSize: 10 }}>{advancedEntries.length} 项</Text>
        <ChevronRight color={colors.subtext} size={15} />
      </Pressable> : null}

      {!query.isFetching && !query.error && !entries.length ? <EmptyState embedded icon={Settings2} message="暂无更新设置" /> : null}
      <Pressable disabled={saveMutation.isPending || !entries.length} onPress={() => saveMutation.mutate()} style={({ pressed }) => ({ minHeight: 44, borderRadius: 12, backgroundColor: entries.length ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: saveMutation.isPending ? 0.55 : pressed ? 0.72 : 1 })}>
        {saveMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Save color="#fff" size={15} />}
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{saveMutation.isPending ? '保存中...' : '保存更新设置'}</Text>
      </Pressable>
    </Panel>

    <Modal visible={advancedVisible} transparent animationType="fade" onRequestClose={() => setAdvancedVisible(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.48)' }}>
        <View style={{ width: '100%', maxWidth: 720, maxHeight: '82%', alignSelf: 'center', borderRadius: 18, backgroundColor: colors.page, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>高级配置</Text><Pressable accessibilityLabel="关闭" onPress={() => setAdvancedVisible(false)} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable></View>
          <ScrollView bounces={false} alwaysBounceVertical={false} overScrollMode="never"><Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18 }}>{JSON.stringify(advancedData, null, 2)}</Text></ScrollView>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </>;
}

function LogsTab({ active }: { active: boolean }) {
  const colors = useAppTheme();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'logs', 'app'],
    queryFn: ({ signal }) => getAdminAppLogs({ limit: 300 }, signal),
    enabled: active,
    retry: 0,
  });
  const lines = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (query.data ?? []).slice().reverse().filter((line) => !keyword || line.toLowerCase().includes(keyword));
  }, [query.data, search]);

  if (!active) return null;
  return <View style={{ flex: 1, gap: 10 }}>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><SearchField value={search} onChangeText={setSearch} placeholder="搜索日志" /></View>
      <Pressable accessibilityLabel="刷新日志" disabled={query.isFetching} onPress={() => void query.refetch()} style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: query.isFetching ? 0.55 : pressed ? 0.65 : 1 })}>
        {query.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={17} />}
      </Pressable>
    </View>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
      <View style={{ minHeight: 38, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center' }}>
        <ScrollText color={colors.subtext} size={14} />
        <Text style={{ flex: 1, marginLeft: 7, color: colors.text, fontSize: 12, fontWeight: '700' }}>应用日志</Text>
        <Text style={{ color: colors.subtext, fontSize: 10 }}>{lines.length} / {query.data?.length ?? 0}</Text>
      </View>
      <FlatList
        data={lines}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyExtractor={(_, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={30}
        maxToRenderPerBatch={30}
        windowSize={9}
        contentContainerStyle={{ flexGrow: lines.length ? 0 : 1 }}
        ListEmptyComponent={!query.isFetching && !query.error ? <EmptyState embedded icon={ScrollText} message={search ? '没有匹配的日志' : '暂无日志'} /> : null}
        renderItem={({ item, index }) => <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', gap: 9 }}>
          <Text style={{ width: 30, color: colors.placeholder, fontFamily: 'monospace', fontSize: 9, lineHeight: 16, textAlign: 'right' }}>{index + 1}</Text>
          <Text selectable style={{ flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 10, lineHeight: 16 }}>{item}</Text>
        </View>}
      />
    </View>
  </View>;
}

export default function AdminSystemScreen() {
  const [tab, setTab] = useState<SystemTab>('overview');

  return <Page
    title="系统管理"
    subtitle="版本、更新与运行日志"
    icon={ServerCog}
    safeTop={false}
    contentMaxWidth={980}
    scrollable={tab !== 'logs'}
  >
    <ResponsiveTabBar tabs={tabs} value={tab} onChange={setTab} maxWidth={980} />
    <OverviewTab active={tab === 'overview'} />
    <SettingsTab active={tab === 'settings'} />
    <LogsTab active={tab === 'logs'} />
  </Page>;
}
