import { useQuery } from '@tanstack/react-query';
import { Bot, ChevronDown, Eraser, MessageCircle, Send, Square, UserRound } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, FullScreenSafeArea, PageHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { getModels } from '@/src/services/account';
import { getGatewayModels, runChat, type GatewayProtocol } from '@/src/services/gateway';
import { sessionState } from '@/src/store/session';
import type { ChatMessage } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

type ChatEntry = ChatMessage & { id: number; pending?: boolean; error?: string };

function guessProtocol(modelId: string): GatewayProtocol {
  return /claude|anthropic/i.test(modelId) ? 'anthropic' : 'openai';
}

export default function ChatScreen() {
  const colors = useAppTheme();
  const session = useSnapshot(sessionState);
  const [apiKey, setApiKey] = useState(sessionState.apiKey);
  const [model, setModel] = useState('');
  const [protocol, setProtocol] = useState<GatewayProtocol | 'auto'>('auto');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const nextIdRef = useRef(0);
  const controllerRef = useRef<AbortController>(undefined);
  const listRef = useRef<FlatList<ChatEntry>>(null);

  const sessionModels = useQuery({
    queryKey: ['models'],
    queryFn: ({ signal }) => getModels(signal),
    enabled: session.mode === 'session',
  });
  const gatewayModels = useQuery({
    queryKey: ['gateway-models', apiKey],
    queryFn: ({ signal }) => getGatewayModels(apiKey, signal),
    enabled: session.mode !== 'session' && Boolean(apiKey.trim()),
    retry: 0,
  });
  const modelOptions = (session.mode === 'session' ? sessionModels.data : gatewayModels.data) ?? [];

  const effectiveKey = apiKey.trim();
  const effectiveProtocol: GatewayProtocol = protocol === 'auto' ? guessProtocol(model) : protocol;
  const canSend = Boolean(effectiveKey && model && input.trim() && !streaming);

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

  async function send() {
    if (!canSend) return;
    setError('');
    const userText = input.trim();
    setInput('');
    appendEntry({ role: 'user', content: userText });
    const history: ChatMessage[] = [...entries.filter((entry) => !entry.error).map(({ role, content }) => ({ role, content })), { role: 'user', content: userText }];
    const assistantId = appendEntry({ role: 'assistant', content: '', pending: true });
    const controller = new AbortController();
    controllerRef.current = controller;
    setStreaming(true);
    try {
      const result = await runChat(effectiveKey, effectiveProtocol, model, history, {
        signal: controller.signal,
        onDelta: (delta) => {
          patchEntry(assistantId, (entry) => ({ content: entry.content + delta }));
          listRef.current?.scrollToEnd({ animated: false });
        },
      });
      patchEntry(assistantId, { pending: false, content: result.text || '（空响应）' });
    } catch (caught) {
      const message = caught instanceof Error
        ? (caught.name === 'AbortError' ? '已停止生成' : caught.message)
        : '请求失败';
      patchEntry(assistantId, (entry) => ({ pending: false, error: message, content: entry.content }));
      if (!(caught instanceof Error && caught.name === 'AbortError')) setError(message);
    } finally {
      setStreaming(false);
      if (controllerRef.current === controller) controllerRef.current = undefined;
    }
  }

  function stop() {
    controllerRef.current?.abort();
  }

  function clearChat() {
    stop();
    setEntries([]);
    setError('');
  }

  const inputBoxStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 } as const;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={['top']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ width: '100%', maxWidth: 820, alignSelf: 'center', flex: 1, paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
        <PageHeader title="聊天测试" subtitle="调用 /v1 网关接口" icon={MessageCircle} />

        <View style={{ gap: 8 }}>
          {session.mode !== 'apikey' || !sessionState.apiKey ? <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="网关 API Key（aps_...）"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={inputBoxStyle}
          /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setModelPickerOpen(true)} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: model ? colors.text : colors.placeholder, fontSize: 13, fontFamily: 'monospace' }}>{model || '选择模型'}</Text>
              <ChevronDown color={colors.subtext} size={16} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
              {([['auto', '自动'], ['openai', 'OpenAI'], ['anthropic', 'Claude']] as const).map(([key, label]) => <Pressable key={key} onPress={() => setProtocol(key)} style={{ paddingHorizontal: 10, borderRadius: 9, backgroundColor: protocol === key ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: protocol === key ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{label}</Text>
              </Pressable>)}
            </View>
          </View>
        </View>

        {error ? <ErrorState message={error} /> : null}

        <FlatList
          ref={listRef}
          data={entries}
          keyExtractor={(entry) => String(entry.id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 12, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Bot color={colors.disabled} size={34} />
            <Text style={{ color: colors.subtext, fontSize: 12 }}>选择模型并发送消息，测试网关连通性</Text>
          </View>}
          renderItem={({ item }) => {
            const mine = item.role === 'user';
            return <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8 }}>
              {!mine ? <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Bot color={colors.primary} size={15} /></View> : null}
              <View style={{ maxWidth: '82%', borderRadius: 16, padding: 12, backgroundColor: mine ? colors.primary : colors.card, borderWidth: mine ? 0 : 1, borderColor: colors.border, gap: 6 }}>
                {item.content ? <Text selectable style={{ color: mine ? '#fff' : colors.text, fontSize: 14, lineHeight: 21 }}>{item.content}</Text> : null}
                {item.pending && !item.content ? <ActivityIndicator color={mine ? '#fff' : colors.primary} /> : null}
                {item.error ? <Text style={{ color: mine ? '#fff' : colors.danger, fontSize: 11 }}>{item.error}</Text> : null}
              </View>
              {mine ? <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><UserRound color={colors.subtext} size={15} /></View> : null}
            </View>;
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 10 }}>
          <Pressable accessibilityLabel="清空对话" onPress={clearChat} style={{ width: 42, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Eraser color={colors.subtext} size={17} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="输入消息…"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[inputBoxStyle, { flex: 1, maxHeight: 120 }]}
          />
          <Pressable
            accessibilityLabel={streaming ? '停止生成' : '发送'}
            disabled={!streaming && !canSend}
            onPress={streaming ? stop : () => void send()}
            style={{ width: 46, height: 44, borderRadius: 12, backgroundColor: streaming ? colors.danger : canSend ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}
          >
            {streaming ? <Square color="#fff" size={16} /> : <Send color="#fff" size={17} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>

    <Modal visible={modelPickerOpen} transparent animationType="slide" onRequestClose={() => setModelPickerOpen(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ maxHeight: '70%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 18, gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>选择模型</Text>
          {(sessionModels.isFetching || gatewayModels.isFetching) ? <ActivityIndicator color={colors.primary} /> : null}
          {gatewayModels.error && session.mode !== 'session' ? <Text style={{ color: colors.danger, fontSize: 12 }}>{gatewayModels.error.message}</Text> : null}
          <FlatList
            data={modelOptions}
            keyExtractor={(item, index) => String(item.id ?? index)}
            contentContainerStyle={{ gap: 6, paddingBottom: 20 }}
            ListEmptyComponent={<Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>暂无模型，可直接在下方输入模型 ID</Text>}
            renderItem={({ item }) => {
              const id = String(item.id ?? '');
              const selected = id === model;
              return <Pressable onPress={() => { setModel(id); setModelPickerOpen(false); }} style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.card, paddingHorizontal: 12, justifyContent: 'center' }}>
                <Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.text, fontSize: 13, fontFamily: 'monospace', fontWeight: '600' }}>{id}</Text>
              </Pressable>;
            }}
          />
          <TextInput
            value={model}
            onChangeText={setModel}
            placeholder="或手动输入模型 ID"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputBoxStyle}
          />
          <Pressable onPress={() => setModelPickerOpen(false)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>确定</Text>
          </Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </SafeAreaView>;
}
