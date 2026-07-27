import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eraser,
  ImagePlus,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Square,
  UserRound,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, PageHeader, SearchField, SheetHandle } from '@/src/components/ui';
import { GatewayKeyPicker } from '@/src/components/gateway-key-picker';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { createApiKey, extractKeySecret, getModels } from '@/src/services/account';
import { getGatewayModels, runChat, type GatewayProtocol } from '@/src/services/gateway';
import { saveGatewayApiKey, sessionState } from '@/src/store/session';
import type { ApiRecord, ChatMessage, ModelItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

type ChatEntry = ChatMessage & { id: number; pending?: boolean; error?: string; usage?: ApiRecord };

function modelId(item: ModelItem) {
  return String(item.id ?? item.name ?? '');
}

function guessProtocol(model: ModelItem | undefined, id: string): GatewayProtocol {
  const family = String(model?.family ?? model?.provider ?? model?.owned_by ?? '');
  return /claude|anthropic/i.test(`${id} ${family}`) ? 'anthropic' : 'openai';
}

function usageLabel(usage: ApiRecord | undefined) {
  if (!usage) return '';
  const input = Number(usage.prompt_tokens ?? usage.input_tokens) || 0;
  const output = Number(usage.completion_tokens ?? usage.output_tokens) || 0;
  const total = Number(usage.total_tokens) || input + output;
  return total ? `${total.toLocaleString()} Token · 输入 ${input.toLocaleString()} · 输出 ${output.toLocaleString()}` : '';
}

function historyFrom(entries: ChatEntry[], systemPrompt: string): ChatMessage[] {
  const history = entries
    .filter((entry) => !entry.error && !entry.pending && entry.content.trim())
    .map(({ role, content }) => ({ role, content }));
  return systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }, ...history] : history;
}

export default function ChatScreen() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width < 620;
  const bottomClearance = Math.max(10, insets.bottom);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [apiKey, setApiKey] = useState(sessionState.apiKey);
  const [model, setModel] = useState('');
  const [protocol, setProtocol] = useState<GatewayProtocol | 'auto'>('auto');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState('2048');
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const nextIdRef = useRef(0);
  const controllerRef = useRef<AbortController>(undefined);
  const listRef = useRef<FlatList<ChatEntry>>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!apiKey && session.apiKey) setApiKey(String(session.apiKey));
  }, [apiKey, session.apiKey]);

  const effectiveKey = apiKey.trim();
  const sessionModels = useQuery({
    queryKey: ['models'],
    queryFn: ({ signal }) => getModels(signal),
    enabled: session.mode === 'session',
  });
  const gatewayModels = useQuery({
    queryKey: ['gateway-models', effectiveKey],
    queryFn: ({ signal }) => getGatewayModels(effectiveKey, signal),
    enabled: Boolean(effectiveKey),
    retry: 0,
  });

  const modelOptions = useMemo(() => {
    const source = gatewayModels.data?.length ? gatewayModels.data : sessionModels.data ?? [];
    const unique = new Map<string, ModelItem>();
    for (const item of source) {
      const id = modelId(item);
      if (id && item.hidden !== true) unique.set(id, item);
    }
    return Array.from(unique.values()).sort((left, right) => modelId(left).localeCompare(modelId(right)));
  }, [gatewayModels.data, sessionModels.data]);

  useEffect(() => {
    if (!model && modelOptions[0]) setModel(modelId(modelOptions[0]));
  }, [model, modelOptions]);

  const selectedModel = modelOptions.find((item) => modelId(item) === model);
  const effectiveProtocol: GatewayProtocol = protocol === 'auto' ? guessProtocol(selectedModel, model) : protocol;
  const parsedMaxTokens = Math.max(1, Math.min(128_000, Number(maxTokens) || 2048));
  const canSend = Boolean(effectiveKey && model.trim() && input.trim() && !streaming);
  const filteredModels = useMemo(() => {
    const keyword = modelSearch.trim().toLowerCase();
    return modelOptions.filter((item) => !keyword || `${modelId(item)} ${item.provider ?? ''} ${item.family ?? ''}`.toLowerCase().includes(keyword));
  }, [modelOptions, modelSearch]);

  const createKey = useMutation({
    mutationFn: () => createApiKey({ name: '聊天测试' }),
    onSuccess: async (payload) => {
      const secret = extractKeySecret(payload);
      if (!secret) {
        Alert.alert('Key 已创建', '服务器没有返回完整 Key，请在密钥页面重新创建并立即复制。');
        return;
      }
      setApiKey(secret);
      await saveGatewayApiKey(secret);
      Alert.alert('已连接', '聊天测试 Key 已创建并安全保存。');
    },
    onError: (caught) => Alert.alert('创建失败', caught.message),
  });

  function appendEntry(entry: Omit<ChatEntry, 'id'>) {
    const id = ++nextIdRef.current;
    setEntries((current) => [...current, { ...entry, id }]);
    return id;
  }

  function patchEntry(id: number, patch: Partial<ChatEntry> | ((entry: ChatEntry) => Partial<ChatEntry>)) {
    setEntries((current) => current.map((entry) => entry.id === id
      ? { ...entry, ...(typeof patch === 'function' ? patch(entry) : patch) }
      : entry));
  }

  async function request(history: ChatMessage[]) {
    const assistantId = appendEntry({ role: 'assistant', content: '', pending: true });
    const controller = new AbortController();
    controllerRef.current = controller;
    setStreaming(true);
    try {
      const result = await runChat(effectiveKey, effectiveProtocol, model.trim(), history, {
        signal: controller.signal,
        stream: streamEnabled,
        temperature,
        maxTokens: parsedMaxTokens,
        onDelta: (delta) => {
          patchEntry(assistantId, (entry) => ({ content: entry.content + delta }));
          listRef.current?.scrollToEnd({ animated: false });
        },
      });
      if (!result.text.trim()) throw new Error('模型返回了空内容，请检查模型协议或请求参数');
      patchEntry(assistantId, { pending: false, content: result.text, usage: result.usage });
    } catch (caught) {
      const message = caught instanceof Error
        ? (caught.name === 'AbortError' ? '已停止生成' : caught.message)
        : '请求失败';
      patchEntry(assistantId, (entry) => ({ pending: false, error: message, content: entry.content }));
    } finally {
      setStreaming(false);
      void queryClient.invalidateQueries({ queryKey: ['keys'] });
      if (controllerRef.current === controller) controllerRef.current = undefined;
    }
  }

  async function send() {
    if (!canSend) return;
    const userText = input.trim();
    const userEntry: ChatEntry = { id: ++nextIdRef.current, role: 'user', content: userText };
    const nextEntries = [...entries, userEntry];
    setEntries(nextEntries);
    setInput('');
    await request(historyFrom(nextEntries, systemPrompt));
  }

  async function regenerate() {
    if (streaming) return;
    const lastAssistant = entries.findLastIndex((entry) => entry.role === 'assistant');
    if (lastAssistant < 0) return;
    const base = entries.slice(0, lastAssistant);
    setEntries(base);
    await request(historyFrom(base, systemPrompt));
  }

  function stop() {
    controllerRef.current?.abort();
  }

  function clearChat() {
    stop();
    setEntries([]);
  }

  async function copyMessage(content: string) {
    await Clipboard.setStringAsync(content);
  }

  function refreshModels() {
    if (effectiveKey) void gatewayModels.refetch();
    else void sessionModels.refetch();
  }

  const inputBoxStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 } as const;
  const keyConnected = Boolean(effectiveKey && gatewayModels.data?.length && !gatewayModels.error);
  const composerBottomClearance = keyboardVisible ? 8 : bottomClearance;
  const settingsSheetHeight = Math.min(520, Math.round(height * 0.56));

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={['top']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} style={{ flex: 1 }}>
      <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', flex: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><PageHeader title="聊天测试" subtitle="调用 /v1 网关接口" icon={MessageCircle} /></View>
          <Pressable accessibilityLabel="聊天设置" onPress={() => setSettingsOpen(true)} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.62 : 1 })}><Settings2 color={colors.primary} size={18} /></Pressable>
          <Pressable accessibilityLabel="图像生成" onPress={() => router.push('/images' as never)} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.62 : 1 })}><ImagePlus color={colors.primary} size={19} /></Pressable>
        </View>

        <View style={{ gap: 7 }}>
          <GatewayKeyPicker value={apiKey} connected={keyConnected} onChange={(value) => { setApiKey(value); void saveGatewayApiKey(value); }} />

          <View style={{ flexDirection: compact ? 'column' : 'row', gap: 7 }}>
            <Pressable onPress={() => setModelPickerOpen(true)} style={{ flex: compact ? undefined : 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: model ? colors.text : colors.placeholder, fontSize: 12, fontFamily: 'monospace' }}>{model || '选择模型'}</Text>
              {(sessionModels.isFetching || gatewayModels.isFetching) ? <ActivityIndicator color={colors.primary} size="small" /> : <ChevronDown color={colors.subtext} size={16} />}
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
              {([['auto', '自动'], ['openai', 'OpenAI'], ['anthropic', 'Claude']] as const).map(([key, label]) => <Pressable key={key} onPress={() => setProtocol(key)} style={{ flex: compact ? 1 : undefined, minWidth: compact ? 0 : 70, minHeight: 36, paddingHorizontal: 8, borderRadius: 9, backgroundColor: protocol === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: protocol === key ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text></Pressable>)}
            </View>
          </View>

          <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {keyConnected ? <><CheckCircle2 color={colors.success} size={13} /><Text style={{ flex: 1, color: colors.success, fontSize: 9 }}>Key 已连接 · {gatewayModels.data?.length ?? 0} 个模型 · {effectiveProtocol === 'anthropic' ? 'Claude' : 'OpenAI'} 协议</Text></> : effectiveKey && gatewayModels.isFetching ? <><ActivityIndicator color={colors.primary} size="small" /><Text style={{ flex: 1, color: colors.subtext, fontSize: 9 }}>正在验证 Key...</Text></> : <Text style={{ flex: 1, color: colors.subtext, fontSize: 9 }}>{session.mode === 'session' ? '填写已有 Key，或创建聊天测试 Key' : '等待有效网关 Key'}</Text>}
            {session.mode === 'session' && !effectiveKey ? <Pressable disabled={createKey.isPending} onPress={() => createKey.mutate()} style={{ minHeight: 28, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 5 }}>{createKey.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Plus color={colors.primary} size={12} />}<Text style={{ color: colors.primary, fontSize: 9, fontWeight: '800' }}>创建 Key</Text></Pressable> : null}
          </View>
        </View>

        {gatewayModels.error && effectiveKey ? <ErrorState message={`Key 或模型接口不可用：${gatewayModels.error.message}`} retry={() => gatewayModels.refetch()} /> : null}

        <FlatList
          ref={listRef}
          data={entries}
          keyExtractor={(entry) => String(entry.id)}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={{ gap: 10, paddingVertical: 4, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 28 }}><Bot color={colors.disabled} size={34} /><Text style={{ color: colors.subtext, fontSize: 11, textAlign: 'center' }}>{!effectiveKey ? '配置网关 Key' : !model ? '选择可用模型' : '发送消息开始测试'}</Text></View>}
          renderItem={({ item, index }) => {
            const mine = item.role === 'user';
            const lastAssistant = item.role === 'assistant' && index === entries.findLastIndex((entry) => entry.role === 'assistant');
            const usage = usageLabel(item.usage);
            return <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 7 }}>
              {!mine ? <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Bot color={colors.primary} size={14} /></View> : null}
              <View style={{ maxWidth: '84%', gap: 4 }}>
                <View style={{ borderRadius: 16, padding: 12, backgroundColor: mine ? colors.primary : colors.card, borderWidth: mine ? 0 : 1, borderColor: colors.border, gap: 6 }}>
                  {item.content ? <Text selectable style={{ color: mine ? '#fff' : colors.text, fontSize: 13, lineHeight: 20 }}>{item.content}</Text> : null}
                  {item.pending && !item.content ? <ActivityIndicator color={colors.primary} /> : null}
                  {item.error ? <Text style={{ color: mine ? '#fff' : colors.danger, fontSize: 10 }}>{item.error}</Text> : null}
                </View>
                {!mine && (item.content || usage || item.error) ? <View style={{ minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {usage ? <Text numberOfLines={1} style={{ flex: 1, color: colors.subtext, fontSize: 8 }}>{usage}</Text> : <View style={{ flex: 1 }} />}
                  {item.content ? <Pressable accessibilityLabel="复制回复" onPress={() => void copyMessage(item.content)} style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}><Copy color={colors.subtext} size={12} /></Pressable> : null}
                  {lastAssistant && !streaming ? <Pressable accessibilityLabel="重新生成" onPress={() => void regenerate()} style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}><RotateCcw color={colors.subtext} size={12} /></Pressable> : null}
                </View> : null}
              </View>
              {mine ? <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><UserRound color={colors.subtext} size={14} /></View> : null}
            </View>;
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingBottom: composerBottomClearance }}>
          <Pressable accessibilityLabel="清空对话" disabled={!entries.length} onPress={clearChat} style={{ width: 40, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: entries.length ? 1 : 0.45 }}><Eraser color={colors.subtext} size={16} /></Pressable>
          <TextInput value={input} onChangeText={setInput} placeholder={!effectiveKey ? '请先配置网关 Key' : !model ? '请先选择模型' : '输入消息...'} placeholderTextColor={colors.placeholder} editable={!streaming} multiline textAlignVertical="top" style={[inputBoxStyle, { flex: 1, maxHeight: 120 }]} />
          <Pressable accessibilityLabel={streaming ? '停止生成' : '发送'} disabled={!streaming && !canSend} onPress={streaming ? stop : () => void send()} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 12, backgroundColor: streaming ? colors.danger : canSend ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>{streaming ? <Square color="#fff" size={15} /> : <Send color="#fff" size={16} />}</Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>

    <Modal visible={modelPickerOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setModelPickerOpen(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ maxHeight: '82%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 18, gap: 10 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>选择模型</Text><Pressable accessibilityLabel="刷新模型" onPress={refreshModels} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><RefreshCw color={colors.primary} size={16} /></Pressable><Pressable accessibilityLabel="关闭" onPress={() => setModelPickerOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <SearchField value={modelSearch} onChangeText={setModelSearch} placeholder="搜索模型或供应商" />
          {(sessionModels.isFetching || gatewayModels.isFetching) ? <ActivityIndicator color={colors.primary} /> : null}
          <FlatList data={filteredModels} keyExtractor={(item, index) => modelId(item) || String(index)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingBottom: 8 }} ListEmptyComponent={<EmptyState embedded icon={Bot} message="没有匹配的模型，可在下方手动输入" />} renderItem={({ item }) => {
            const id = modelId(item);
            const selected = id === model;
            return <Pressable onPress={() => { setModel(id); setModelPickerOpen(false); }} style={({ pressed }) => ({ minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.65 : 1 })}><IconTile icon={Bot} color={selected ? colors.primary : colors.subtext} background={selected ? colors.card : colors.mutedCard} size={34} iconSize={16} /><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.text, fontSize: 12, fontFamily: 'monospace', fontWeight: '700' }}>{id}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9 }}>{String(item.provider ?? item.owned_by ?? '')}{item.family ? ` · ${String(item.family)}` : ''}</Text></View></Pressable>;
          }} />
          <View style={{ flexDirection: 'row', gap: 7 }}><TextInput value={model} onChangeText={setModel} placeholder="手动输入模型 ID" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={[inputBoxStyle, { flex: 1, fontFamily: 'monospace' }]} /><Pressable disabled={!model.trim()} onPress={() => setModelPickerOpen(false)} style={{ minWidth: 74, minHeight: 44, borderRadius: 12, backgroundColor: model.trim() ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>确定</Text></Pressable></View>
        </View>
      </FullScreenSafeArea>
    </Modal>

    <Modal visible={settingsOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ height: settingsSheetHeight, width: '100%', maxWidth: 720, alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 16, gap: 10 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>聊天设置</Text><Pressable accessibilityLabel="关闭" onPress={() => setSettingsOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
            <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>系统提示词</Text><TextInput value={systemPrompt} onChangeText={setSystemPrompt} placeholder="可选" placeholderTextColor={colors.placeholder} multiline textAlignVertical="top" style={[inputBoxStyle, { minHeight: 72, maxHeight: 96 }]} /></View>
            <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>温度</Text><View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>{[0, 0.3, 0.7, 1].map((value) => <Pressable key={value} onPress={() => setTemperature(value)} style={{ flex: 1, minHeight: 36, borderRadius: 9, backgroundColor: temperature === value ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: temperature === value ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{value}</Text></Pressable>)}</View></View>
            <View style={{ gap: 6 }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>最大输出 Token</Text><TextInput value={maxTokens} onChangeText={setMaxTokens} keyboardType="number-pad" placeholder="2048" placeholderTextColor={colors.placeholder} style={inputBoxStyle} /></View>
            <View style={{ minHeight: 48, borderTopWidth: 1, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>流式响应</Text><Text style={{ color: colors.subtext, fontSize: 9 }}>关闭后使用普通 JSON 响应</Text></View><Switch value={streamEnabled} onValueChange={setStreamEnabled} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>
          </ScrollView>
          <Pressable onPress={() => setSettingsOpen(false)} style={{ height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>完成</Text></Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </SafeAreaView>;
}
