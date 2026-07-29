import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { accountProvider } from '@/src/lib/account-display';
import { useAppTheme } from '@/src/lib/theme';
import type { ApiRecord } from '@/src/types/api';

type ProviderLogo = { light: number; dark: number };

const providerLogos: Record<string, ProviderLogo> = {
  codex: { light: require('../../assets/providers/codex-light.png'), dark: require('../../assets/providers/codex-dark.png') },
  openai: { light: require('../../assets/providers/openai-light.png'), dark: require('../../assets/providers/openai-dark.png') },
  anthropic: { light: require('../../assets/providers/claude-light.png'), dark: require('../../assets/providers/claude-dark.png') },
  xai: { light: require('../../assets/providers/grok-light.png'), dark: require('../../assets/providers/grok-dark.png') },
  kiro: { light: require('../../assets/providers/kiro-light.png'), dark: require('../../assets/providers/kiro-dark.png') },
  deepseek: { light: require('../../assets/providers/deepseek-light.png'), dark: require('../../assets/providers/deepseek-dark.png') },
  zhipu: { light: require('../../assets/providers/zhipu-light.png'), dark: require('../../assets/providers/zhipu-dark.png') },
  minimax: { light: require('../../assets/providers/minimax-light.png'), dark: require('../../assets/providers/minimax-dark.png') },
  kimi: { light: require('../../assets/providers/kimi-light.png'), dark: require('../../assets/providers/kimi-dark.png') },
  mimo: { light: require('../../assets/providers/mimo-light.png'), dark: require('../../assets/providers/mimo-dark.png') },
  opencode: { light: require('../../assets/providers/opencode-light.png'), dark: require('../../assets/providers/opencode-dark.png') },
  cursor: { light: require('../../assets/providers/cursor-light.png'), dark: require('../../assets/providers/cursor-dark.png') },
  qoder: { light: require('../../assets/providers/qoder-light.png'), dark: require('../../assets/providers/qoder-dark.png') },
  qwen: { light: require('../../assets/providers/qwen-light.png'), dark: require('../../assets/providers/qwen-dark.png') },
  doubao: { light: require('../../assets/providers/doubao-light.png'), dark: require('../../assets/providers/doubao-dark.png') },
  gemini: { light: require('../../assets/providers/gemini-light.png'), dark: require('../../assets/providers/gemini-dark.png') },
  antigravity: { light: require('../../assets/providers/antigravity-light.png'), dark: require('../../assets/providers/antigravity-dark.png') },
};

const providerAliases: Record<string, string> = {
  claude: 'anthropic',
  grok: 'xai',
  glm: 'zhipu',
  chatglm: 'zhipu',
  moonshot: 'kimi',
  qianwen: 'qwen',
  ark: 'doubao',
  'google-ai-studio': 'gemini',
  aistudio: 'gemini',
};

export function ProviderIcon({ provider, size = 36 }: { provider: ApiRecord | string; size?: number }) {
  const colors = useAppTheme();
  const definition = accountProvider(provider);
  const logo = providerLogos[providerAliases[definition.key] ?? definition.key];
  const borderRadius = Math.max(9, Math.round(size * 0.3));

  if (!logo) {
    return <View style={{ width: size, height: size, borderRadius, backgroundColor: definition.color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: Math.max(11, Math.round(size * 0.4)), fontWeight: '900' }}>{definition.mark}</Text>
    </View>;
  }

  const imageSize = Math.round(size * 0.68);
  return <View style={{ width: size, height: size, borderRadius, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <Image accessibilityLabel={`${definition.label} 图标`} source={colors.mode === 'dark' ? logo.dark : logo.light} contentFit="contain" style={{ width: imageSize, height: imageSize }} />
  </View>;
}
