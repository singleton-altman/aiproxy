import { useMutation } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { ImagePlus, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ErrorState, Page, Panel, SectionHeader } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { generateImages } from '@/src/services/gateway';
import { sessionState } from '@/src/store/session';
import type { ApiRecord } from '@/src/types/api';

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

export default function ImagesScreen() {
  const colors = useAppTheme();
  const [apiKey, setApiKey] = useState(sessionState.apiKey);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<string>('1024x1024');

  const mutation = useMutation({
    mutationFn: async () => {
      const body: ApiRecord = { model: model.trim(), prompt: prompt.trim(), n: 1, size };
      const payload = await generateImages(apiKey.trim(), body);
      const images = extractImages(payload);
      if (!images.length) throw new Error('响应中没有图片数据');
      return images;
    },
  });

  const canRun = Boolean(apiKey.trim() && model.trim() && prompt.trim() && !mutation.isPending);
  const inputStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 } as const;

  return <Page title="图像生成" subtitle="POST /v1/images/generations" icon={ImagePlus} safeTop={false}>
    <Panel>
      <SectionHeader icon={Sparkles} title="请求参数" />
      <TextInput value={apiKey} onChangeText={setApiKey} placeholder="网关 API Key（aps_...）" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} secureTextEntry style={inputStyle} />
      <TextInput value={model} onChangeText={setModel} placeholder="图像模型 ID，例如 gpt-image-1" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={[inputStyle, { fontFamily: 'monospace' }]} />
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

    {mutation.error ? <ErrorState message={mutation.error.message} /> : null}
    {(mutation.data ?? []).map((uri, index) => <Panel key={index}>
      <ExpoImage source={{ uri }} style={{ width: '100%', aspectRatio: size === '1024x1536' ? 2 / 3 : size === '1536x1024' ? 3 / 2 : 1, borderRadius: 14 }} contentFit="cover" />
    </Panel>)}
  </Page>;
}
