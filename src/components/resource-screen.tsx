import { useMutation, useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import { Pencil, Plus, Trash2, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, Page, SearchField, SheetHandle } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

export type ResourceAction = {
  key: string;
  label: string;
  danger?: boolean;
  confirm?: string;
  run: (item: ApiRecord) => Promise<unknown>;
};

type ResourceFormExtension = {
  renderForm?: (props: { value: ApiRecord; onChange: (value: ApiRecord) => void }) => ReactNode;
  validate?: (value: ApiRecord) => string | undefined;
  submitLabel?: string;
};

export type ResourceScreenProps = {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  queryKey: readonly string[];
  fetchItems: (signal?: AbortSignal) => Promise<ApiRecord[]>;
  idOf?: (item: ApiRecord) => string;
  titleOf: (item: ApiRecord) => string;
  subtitleOf?: (item: ApiRecord) => string;
  badgeOf?: (item: ApiRecord) => { text: string; tone: 'success' | 'danger' | 'warning' | 'muted' } | undefined;
  searchText?: (item: ApiRecord) => string;
  toggle?: { label: string; value: (item: ApiRecord) => boolean; run: (item: ApiRecord, next: boolean) => Promise<unknown> };
  actions?: ResourceAction[];
  create?: ResourceFormExtension & { label: string; template: ApiRecord; run: (value: ApiRecord) => Promise<unknown>; note?: string };
  edit?: ResourceFormExtension & { pick: (item: ApiRecord) => ApiRecord; run: (item: ApiRecord, value: ApiRecord) => Promise<unknown> };
  remove?: { run: (item: ApiRecord) => Promise<unknown>; confirm: (item: ApiRecord) => string };
  headerActions?: ResourceAction[];
  footer?: ReactNode;
};

function defaultId(item: ApiRecord) {
  for (const key of ['id', 'ID', 'Id', 'key', 'Key', 'code', 'name']) {
    if (item[key] !== undefined && item[key] !== null) return String(item[key]);
  }
  return '';
}

export function ResourceScreen(props: ResourceScreenProps) {
  const colors = useAppTheme();
  const idOf = props.idOf ?? defaultId;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [formVisible, setFormVisible] = useState<'create' | 'edit' | ''>('');
  const [formValue, setFormValue] = useState<ApiRecord>({});
  const [resultTitle, setResultTitle] = useState('');
  const [resultValue, setResultValue] = useState<unknown>();
  const [busyAction, setBusyAction] = useState('');

  const query = useQuery({
    queryKey: props.queryKey as string[],
    queryFn: ({ signal }) => props.fetchItems(signal),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: props.queryKey as string[] });

  const items = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const list = query.data ?? [];
    if (!keyword) return list;
    return list.filter((item) => {
      const text = props.searchText
        ? props.searchText(item)
        : `${props.titleOf(item)} ${props.subtitleOf?.(item) ?? ''}`;
      return text.toLowerCase().includes(keyword);
    });
  }, [query.data, search, props]);

  const selected = useMemo(
    () => (query.data ?? []).find((item) => idOf(item) === selectedId),
    [query.data, selectedId, idOf],
  );

  const toggleMutation = useMutation({
    mutationFn: ({ item, next }: { item: ApiRecord; next: boolean }) => props.toggle!.run(item, next),
    onError: (error) => Alert.alert('操作失败', error.message),
    onSettled: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (item: ApiRecord) => props.remove!.run(item),
    onSuccess: () => setSelectedId(''),
    onError: (error) => Alert.alert('删除失败', error.message),
    onSettled: invalidate,
  });
  const formMutation = useMutation({
    mutationFn: async () => {
      if (formVisible === 'create') {
        const validation = props.create!.validate?.(formValue);
        if (validation) throw new Error(validation);
        return props.create!.run(formValue);
      }
      if (formVisible === 'edit' && selected) {
        const validation = props.edit!.validate?.(formValue);
        if (validation) throw new Error(validation);
        return props.edit!.run(selected, formValue);
      }
      throw new Error('无效操作');
    },
    onSuccess: (payload) => {
      setFormVisible('');
      invalidate();
      if (payload && typeof payload === 'object' && Object.keys(payload as ApiRecord).length) {
        setResultTitle('服务器响应');
        setResultValue(payload);
      }
    },
  });

  async function runAction(action: ResourceAction, item: ApiRecord) {
    const execute = async () => {
      setBusyAction(action.key);
      try {
        const payload = await action.run(item);
        invalidate();
        if (payload !== undefined && payload !== null) {
          setResultTitle(action.label);
          setResultValue(payload);
        } else {
          Alert.alert('已完成', `${action.label} 执行成功`);
        }
      } catch (error) {
        Alert.alert(`${action.label} 失败`, error instanceof Error ? error.message : '请求失败');
      } finally {
        setBusyAction('');
      }
    };
    if (action.confirm) {
      Alert.alert(`确认${action.label}`, action.confirm, [
        { text: '取消', style: 'cancel' },
        { text: '确认', style: action.danger ? 'destructive' : 'default', onPress: () => void execute() },
      ]);
    } else await execute();
  }

  const badgeColors = {
    success: { bg: colors.successBg, fg: colors.success },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    warning: { bg: colors.warningBg, fg: colors.warning },
    muted: { bg: colors.mutedCard, fg: colors.subtext },
  } as const;
  const activeForm = formVisible === 'create' ? props.create : formVisible === 'edit' ? props.edit : undefined;

  return <Page title={props.title} subtitle={props.subtitle ?? (query.data ? `${query.data.length} 项` : undefined)} icon={props.icon} safeTop={false} scrollable={false} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    <SearchField value={search} onChangeText={setSearch} placeholder="搜索…" />
    {props.headerActions?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {props.headerActions.map((action) => <Pressable
        key={action.key}
        disabled={busyAction === action.key}
        onPress={() => void runAction(action, {})}
        style={{ flexGrow: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: action.danger ? colors.danger : colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
      >
        {busyAction === action.key ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: action.danger ? colors.danger : colors.primary, fontSize: 12, fontWeight: '700' }}>{action.label}</Text>}
      </Pressable>)}
    </View> : null}
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <FlatList
      data={items}
      keyExtractor={(item, index) => idOf(item) || String(index)}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={Platform.OS === 'android'}
      initialNumToRender={14}
      maxToRenderPerBatch={14}
      windowSize={9}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ gap: 10, paddingBottom: props.create || props.footer ? 86 : 20, flexGrow: items.length ? 0 : 1 }}
      ListEmptyComponent={!query.isFetching ? <EmptyState message="暂无数据" icon={props.icon} /> : null}
      renderItem={({ item }) => {
        const badge = props.badgeOf?.(item);
        const tone = badge ? badgeColors[badge.tone] : undefined;
        return <Pressable onPress={() => setSelectedId(idOf(item))} style={({ pressed }) => ({ borderRadius: 16, borderWidth: 1, borderColor: pressed ? colors.primary : colors.border, backgroundColor: pressed ? colors.mutedCard : colors.card, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, opacity: pressed ? 0.78 : 1 })}>
          <IconTile icon={props.icon} size={38} iconSize={18} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}>{props.titleOf(item)}</Text>
              {badge && tone ? <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: tone.bg }}>
                <Text style={{ color: tone.fg, fontSize: 9, fontWeight: '800' }}>{badge.text}</Text>
              </View> : null}
            </View>
            {props.subtitleOf ? <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 10, lineHeight: 15 }}>{props.subtitleOf(item)}</Text> : null}
          </View>
        </Pressable>;
      }}
    />

    {props.create ? <Pressable
      onPress={() => { setFormValue({ ...props.create!.template }); setFormVisible('create'); formMutation.reset(); }}
      style={{ position: 'absolute', left: 16, right: 16, bottom: 20, minHeight: 48, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: colors.shadow, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
    >
      <Plus color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{props.create.label}</Text>
    </Pressable> : null}

    {/* 详情弹层 */}
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelectedId('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        {selected ? <View style={{ maxHeight: '82%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 18, gap: 12 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{props.titleOf(selected)}</Text>
            {props.edit ? <Pressable accessibilityLabel="编辑" onPress={() => { setFormValue(props.edit!.pick(selected)); setFormVisible('edit'); formMutation.reset(); }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Pencil color={colors.primary} size={15} /></Pressable> : null}
            <Pressable accessibilityLabel="关闭" onPress={() => setSelectedId('')} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>

          {props.toggle ? <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }}>{props.toggle.label}</Text>
            <Switch value={props.toggle.value(selected)} disabled={toggleMutation.isPending} onValueChange={(next) => toggleMutation.mutate({ item: selected, next })} trackColor={{ false: colors.disabled, true: colors.primary }} />
          </View> : null}

          {props.actions?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {props.actions.map((action) => <Pressable
              key={action.key}
              disabled={Boolean(busyAction)}
              onPress={() => void runAction(action, selected)}
              style={{ flexGrow: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 11, backgroundColor: action.danger ? colors.dangerBg : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
            >
              {busyAction === action.key ? <ActivityIndicator color={action.danger ? colors.danger : colors.primary} /> : <Text style={{ color: action.danger ? colors.danger : colors.primary, fontSize: 12, fontWeight: '800' }}>{action.label}</Text>}
            </Pressable>)}
          </View> : null}

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <StructuredDataView value={selected} />
          </ScrollView>

          {props.remove ? <Pressable disabled={removeMutation.isPending} onPress={() => Alert.alert('确认删除', props.remove!.confirm(selected), [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: () => removeMutation.mutate(selected) },
          ])} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Trash2 color={colors.danger} size={16} /><Text style={{ color: colors.danger, fontWeight: '800' }}>{removeMutation.isPending ? '删除中…' : '删除'}</Text>
          </Pressable> : null}
        </View> : null}
      </FullScreenSafeArea>
    </Modal>

    {/* 创建 / 编辑表单弹层 */}
    <Modal visible={Boolean(formVisible)} transparent animationType="slide" onRequestClose={() => setFormVisible('')}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 18, gap: 12 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{formVisible === 'create' ? props.create?.label ?? '创建' : '编辑'}</Text>
            <Pressable accessibilityLabel="关闭" onPress={() => setFormVisible('')} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>
          {formVisible === 'create' && props.create?.note ? <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 16 }}>{props.create.note}</Text> : null}
          <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {activeForm?.renderForm
              ? activeForm.renderForm({ value: formValue, onChange: (value) => { setFormValue(value); if (formMutation.isError) formMutation.reset(); } })
              : <StructuredForm value={formValue} onChange={(value) => { setFormValue(value); if (formMutation.isError) formMutation.reset(); }} />}
          </ScrollView>
          {formMutation.error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{formMutation.error.message}</Text> : null}
          <Pressable disabled={formMutation.isPending} onPress={() => formMutation.mutate()} style={{ minHeight: 48, borderRadius: 13, backgroundColor: formMutation.isPending ? colors.disabled : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{formMutation.isPending ? '提交中…' : activeForm?.submitLabel ?? '提交'}</Text>
          </Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>

    {/* 操作结果弹层 */}
    <Modal visible={resultValue !== undefined} transparent animationType="fade" onRequestClose={() => setResultValue(undefined)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>
        <View style={{ maxHeight: '78%', borderRadius: 20, backgroundColor: colors.page, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>{resultTitle || '结果'}</Text>
            <Pressable accessibilityLabel="关闭" onPress={() => setResultValue(undefined)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <StructuredDataView value={resultValue} />
          </ScrollView>
        </View>
      </FullScreenSafeArea>
    </Modal>

    {props.footer}
  </Page>;
}
