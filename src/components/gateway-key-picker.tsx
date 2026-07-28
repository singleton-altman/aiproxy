import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Eye, EyeOff, KeyRound, RefreshCw, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, SheetHandle } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { extractKeySecret, getApiKeys } from '@/src/services/account';
import { sessionState } from '@/src/store/session';
import type { ApiKeyItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

function prefixOf(item: ApiKeyItem) {
  return String(item.prefix ?? item.key_prefix ?? item.preview ?? '').trim().replace(/\.+$/, '');
}

function maskedPrefix(value: string) {
  const key = value.trim();
  if (!key) return '';
  return `${key.slice(0, Math.min(12, key.length))}...`;
}

function usableSecret(item: ApiKeyItem, currentValue: string) {
  const direct = extractKeySecret(item).trim();
  if (direct) return direct;
  const prefix = prefixOf(item);
  return prefix && currentValue.trim().startsWith(prefix) ? currentValue.trim() : '';
}

export function GatewayKeyPicker({ value, onChange, connected = false }: { value: string; onChange: (value: string) => void; connected?: boolean }) {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);
  const keys = useQuery({ queryKey: ['keys'], queryFn: ({ signal }) => getApiKeys(signal), enabled: session.mode === 'session', retry: 0 });
  const items = keys.data ?? [];
  const selected = useMemo(() => value.trim() ? items.find((item) => usableSecret(item, value) === value.trim()) : undefined, [items, value]);
  const hasListedCurrent = items.some((item) => Boolean(usableSecret(item, value)));
  const sheetHeight = Math.min(600, Math.round(height * 0.7));

  function openPicker() {
    setDraft(value);
    setVisible(false);
    setOpen(true);
  }

  function selectSecret(secret: string) {
    onChange(secret.trim());
    setOpen(false);
  }

  async function paste() {
    const next = (await Clipboard.getStringAsync()).trim();
    if (next) setDraft(next);
  }

  const title = selected ? String(selected.name ?? '已有 Key') : value.trim() ? '本机已保存 Key' : '选择 API Key';
  const detail = selected ? (prefixOf(selected) ? `${prefixOf(selected)}...` : maskedPrefix(value)) : maskedPrefix(value);

  return <>
    <Pressable onPress={openPicker} style={({ pressed }) => ({ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: connected ? colors.success : colors.border, backgroundColor: colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.68 : 1 })}>
      <IconTile icon={KeyRound} color={connected ? colors.success : colors.primary} background={connected ? colors.successBg : colors.primarySoft} size={32} iconSize={16} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: value.trim() ? colors.text : colors.placeholder, fontSize: 12, fontWeight: '700' }}>{title}</Text>{detail ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>{detail}</Text> : null}</View>
      {keys.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <ChevronDown color={colors.subtext} size={16} />}
    </Pressable>

    <Modal visible={open} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setOpen(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ height: sheetHeight, width: '100%', maxWidth: 720, alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 16, gap: 10 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>选择 API Key</Text><Pressable accessibilityLabel="刷新 Key" disabled={keys.isFetching || session.mode !== 'session'} onPress={() => keys.refetch()} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>{keys.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}</Pressable><Pressable accessibilityLabel="关闭" onPress={() => setOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>

          {keys.error ? <ErrorState message={keys.error.message} retry={() => keys.refetch()} /> : null}
          <FlatList
            data={items}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            keyExtractor={(item, index) => String(item.id ?? item.prefix ?? index)}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 7, flexGrow: items.length || (value.trim() && !hasListedCurrent) ? 0 : 1 }}
            ListHeaderComponent={value.trim() && !hasListedCurrent ? <Pressable onPress={() => selectSecret(value)} style={{ minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 12, justifyContent: 'center', gap: 3 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>本机已保存 Key</Text><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 10, fontFamily: 'monospace' }}>{maskedPrefix(value)}</Text></Pressable> : null}
            ListEmptyComponent={!keys.isFetching && !(value.trim() && !hasListedCurrent) ? <EmptyState embedded icon={KeyRound} message="没有可选择的 Key" /> : null}
            renderItem={({ item }) => {
              const secret = usableSecret(item, value);
              const disabled = item.disabled === true;
              const usable = Boolean(secret) && !disabled;
              return <Pressable onPress={() => usable ? selectSecret(secret) : Alert.alert(disabled ? 'Key 已停用' : '无法使用此 Key', disabled ? '请先在密钥页面启用后再选择。' : '服务器只返回了展示前缀，完整 Key 无法恢复。请在下方重新粘贴，或创建新 Key。')} style={({ pressed }) => ({ minHeight: 60, borderRadius: 14, borderWidth: 1, borderColor: usable && secret === value.trim() ? colors.primary : colors.border, backgroundColor: usable && secret === value.trim() ? colors.primarySoft : colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.68 : usable ? 1 : 0.55 })}><IconTile icon={KeyRound} color={usable ? colors.primary : colors.disabled} background={usable ? colors.primarySoft : colors.mutedCard} size={34} iconSize={16} /><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{String(item.name ?? '未命名 Key')}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9, fontFamily: 'monospace' }}>{prefixOf(item) ? `${prefixOf(item)}...` : '未返回前缀'} · {disabled ? '已停用' : usable ? '可使用' : '需重新粘贴完整值'}</Text></View></Pressable>;
            }}
          />

          <View style={{ gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>手动使用 Key</Text><View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }}><TextInput value={draft} onChangeText={setDraft} placeholder="粘贴完整 aps_ Key" placeholderTextColor={colors.placeholder} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minHeight: 44, color: colors.text, paddingHorizontal: 12, fontSize: 12, fontFamily: 'monospace' }} /><Pressable accessibilityLabel={visible ? '隐藏 Key' : '显示 Key'} onPress={() => setVisible((current) => !current)} style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}>{visible ? <EyeOff color={colors.subtext} size={16} /> : <Eye color={colors.subtext} size={16} />}</Pressable><Pressable accessibilityLabel="从剪贴板粘贴" onPress={() => void paste()} style={{ minWidth: 46, height: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>粘贴</Text></Pressable></View></View>
          <Pressable disabled={!draft.trim()} onPress={() => selectSecret(draft)} style={{ height: 44, borderRadius: 12, backgroundColor: draft.trim() ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>使用此 Key</Text></Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </>;
}
