import { useMutation, useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronDown, Image as ImageIcon, ImagePlus, RefreshCw, Sparkles, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { GatewayKeyPicker } from '@/src/components/gateway-key-picker';
import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, Page, Panel, SearchField, SectionHeader, SheetHandle } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { generateImages, getGatewayModels } from '@/src/services/gateway';
import { isAdmin, saveGatewayApiKey, sessionState } from '@/src/store/session';
import type { ApiRecord, ModelItem } from '@/src/types/api';

const { useSnapshot } = require('valtio/react');

const sizes = ['1024x1024', '1024x1536', '1536x1024'] as const;

function extractImages(payload: ApiRecord): string[] {
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as ApiRecord;
      if (typeof record.url === 'string' && record.url) return record.url;
      if (typeof record.b64_json === 'string' && record.b64_json) return `data:image/png;base64,${record.b64_json}`;
      return '';
    })
    .filter(Boolean);
}

function modelId(item: ModelItem) {
  return String(item.id ?? item.name ?? '').trim();
}

function isImageGenerationModel(item: ModelItem) {
  const id = modelId(item).toLowerCase();
  if (/gpt-image|dall-e|imagen|flux|stable.?diffusion|recraft|ideogram|seedream|hidream|qwen.?image|kolors|minimax.?image/.test(id)) return true;
  if (Array.isArray(item.modalities) && item.modalities.some((value) => /^image(?:[_-](?:generation|output))?$/i.test(String(value)))) return true;
  const capabilitySource = [item.modalities, item.capabilities, item.capability, item.endpoints, item.endpoint, item.type, item.task];
  const capabilities = capabilitySource.map((value) => {
    try { return typeof value === 'string' ? value : JSON.stringify(value ?? ''); } catch { return ''; }
  }).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  return /image generation|images\/generations|text to image|image output|generate images?/.test(capabilities);
}

export default function ImagesScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const session = useSnapshot(sessionState);
  const { height } = useWindowDimensions();
  const [apiKey, setApiKey] = useState(sessionState.apiKey);
  const [model, setModel] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<string>('1024x1024');
  const effectiveKey = apiKey.trim();

  useEffect(() => {
    if (!apiKey && session.apiKey) setApiKey(String(session.apiKey));
  }, [apiKey, session.apiKey]);

  const gatewayModels = useQuery({ queryKey: ['gateway-models', effectiveKey], queryFn: ({ signal }) => getGatewayModels(effectiveKey, signal), enabled: Boolean(effectiveKey), retry: 0 });
  const imageModels = useMemo(() => {
    const unique = new Map<string, ModelItem>();
    for (const item of gatewayModels.data ?? []) {
      const id = modelId(item);
      if (id && item.hidden !== true && isImageGenerationModel(item)) unique.set(id, item);
    }
    return Array.from(unique.values()).sort((left, right) => modelId(left).localeCompare(modelId(right)));
  }, [gatewayModels.data]);
  const filteredModels = useMemo(() => {
    const keyword = modelSearch.trim().toLowerCase();
    return imageModels.filter((item) => !keyword || `${modelId(item)} ${item.provider ?? ''} ${item.family ?? ''}`.toLowerCase().includes(keyword));
  }, [imageModels, modelSearch]);

  useEffect(() => {
    if (!model && imageModels[0]) setModel(modelId(imageModels[0]));
  }, [imageModels, model]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: ApiRecord = { model: model.trim(), prompt: prompt.trim(), n: 1, size };
      const payload = await generateImages(effectiveKey, body);
      const images = extractImages(payload);
      if (!images.length) throw new Error('响应中没有图片数据');
      return images;
    },
  });

  const canRun = Boolean(effectiveKey && model.trim() && prompt.trim() && !mutation.isPending);
  const inputStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 } as const;
  const keyConnected = Boolean(effectiveKey && gatewayModels.data?.length && !gatewayModels.error);
  const modelSheetHeight = Math.min(620, Math.round(height * 0.72));

  function refreshModels() {
    if (effectiveKey) void gatewayModels.refetch();
  }

  return <Page title="图像生成" subtitle="POST /v1/images/generations" icon={ImagePlus} safeTop={false} refreshing={mutation.isPending || gatewayModels.isFetching} onRefresh={refreshModels}>
    <Panel>
      <SectionHeader icon={Sparkles} title="请求参数" />
      <GatewayKeyPicker value={apiKey} connected={keyConnected} onChange={(value) => { setApiKey(value); setModel(''); void saveGatewayApiKey(value); }} />
      <Pressable onPress={() => setModelPickerOpen(true)} style={{ minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9 }}><IconTile icon={ImageIcon} color={model ? colors.primary : colors.subtext} background={model ? colors.primarySoft : colors.mutedCard} size={32} iconSize={16} /><Text numberOfLines={1} style={{ flex: 1, color: model ? colors.text : colors.placeholder, fontSize: 11, fontFamily: 'monospace' }}>{model || (effectiveKey ? '选择当前 Key 可用的图像模型' : '请先选择 API Key')}</Text>{gatewayModels.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <ChevronDown color={colors.subtext} size={16} />}</Pressable>
      {gatewayModels.error && effectiveKey ? <ErrorState message={`模型加载失败：${gatewayModels.error.message}`} retry={() => gatewayModels.refetch()} /> : null}
      <TextInput value={prompt} onChangeText={setPrompt} placeholder="描述你想生成的图片…" placeholderTextColor={colors.placeholder} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 100 }]} />
      <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        {sizes.map((item) => <Pressable key={item} onPress={() => setSize(item)} style={{ flex: 1, minHeight: 36, borderRadius: 9, backgroundColor: size === item ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: size === item ? colors.primary : colors.subtext, fontSize: 11, fontWeight: '700' }}>{item}</Text>
        </Pressable>)}
      </View>
      <Pressable disabled={!canRun} onPress={() => mutation.mutate()} style={{ minHeight: 48, borderRadius: 13, backgroundColor: canRun ? colors.primary : colors.disabled, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Sparkles color="#fff" size={17} />}
        <Text style={{ color: '#fff', fontWeight: '800' }}>{mutation.isPending ? '生成中…' : '生成图片'}</Text>
      </Pressable>
    </Panel>

    {mutation.error ? <>
      <ErrorState message={mutation.error.message} retry={() => mutation.mutate()} />
      {/上游账号均处于冷却/.test(mutation.error.message) && isAdmin() ? <Pressable onPress={() => router.push('/admin-accounts' as never)} style={{ minHeight: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>检查上游账号</Text></Pressable> : null}
    </> : null}
    {(mutation.data ?? []).map((uri, index) => <Panel key={index}>
      <ExpoImage source={{ uri }} style={{ width: '100%', aspectRatio: size === '1024x1536' ? 2 / 3 : size === '1536x1024' ? 3 / 2 : 1, borderRadius: 14, backgroundColor: colors.mutedCard }} contentFit="contain" />
    </Panel>)}

    <Modal visible={modelPickerOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setModelPickerOpen(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.sheetBackdrop }}>
        <View style={{ height: modelSheetHeight, width: '100%', maxWidth: 720, alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 16, gap: 10 }}>
          <SheetHandle />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>选择图像模型</Text><Pressable accessibilityLabel="刷新模型" onPress={refreshModels} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>{gatewayModels.isFetching ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}</Pressable><Pressable accessibilityLabel="关闭" onPress={() => setModelPickerOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={17} /></Pressable></View>
          <SearchField value={modelSearch} onChangeText={setModelSearch} placeholder="搜索图像模型或供应商" />
          <FlatList data={filteredModels} bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyExtractor={(item) => modelId(item)} style={{ flex: 1 }} contentContainerStyle={{ gap: 7, flexGrow: filteredModels.length ? 0 : 1 }} ListEmptyComponent={!gatewayModels.isFetching ? <EmptyState embedded icon={ImageIcon} message={effectiveKey ? '当前 Key 没有可用的图像生成模型' : '请先选择 API Key'} /> : null} renderItem={({ item }) => {
            const id = modelId(item);
            const selected = id === model;
            return <Pressable onPress={() => { setModel(id); setModelPickerOpen(false); }} style={({ pressed }) => ({ minHeight: 60, borderRadius: 14, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.68 : 1 })}><IconTile icon={ImageIcon} color={selected ? colors.primary : colors.subtext} background={selected ? colors.card : colors.mutedCard} size={34} iconSize={16} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.text, fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }}>{id}</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{String(item.provider ?? item.owned_by ?? '未知供应商')}{item.family ? ` · ${String(item.family)}` : ''}</Text></View></Pressable>;
          }} />
          <View style={{ gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder }}><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>手动模型 ID</Text><View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={model} onChangeText={setModel} placeholder="例如 gpt-image-1" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={[inputStyle, { flex: 1, fontFamily: 'monospace' }]} /><Pressable disabled={!model.trim()} onPress={() => setModelPickerOpen(false)} style={{ minWidth: 72, minHeight: 44, borderRadius: 12, backgroundColor: model.trim() ? colors.primary : colors.disabled, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>确定</Text></Pressable></View></View>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
