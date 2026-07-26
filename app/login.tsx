import { router } from 'expo-router';
import { Eye, EyeOff, KeyRound, Link2, LockKeyhole, LogIn, MailCheck, UserRound, UserRoundPlus, Wand2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getProfile } from '@/src/services/account';
import { apiKeyLogin, extractProfile, getPublicConfig, getSetupStatus, login, register, resetPassword, sendCode, setupAdmin } from '@/src/services/auth';
import { normalizeBaseUrl, saveSession, sessionState } from '@/src/store/session';
import type { PublicConfig, UserProfile } from '@/src/types/api';

type FormMode = 'login' | 'register' | 'reset' | 'apikey' | 'setup';

const modeTabs: readonly [FormMode, string, LucideIcon][] = [
  ['login', '登录', LogIn],
  ['register', '注册', UserRoundPlus],
  ['reset', '重置密码', Wand2],
  ['apikey', 'API Key', KeyRound],
];

export default function LoginScreen() {
  const colors = useAppTheme();
  const viewport = useWindowDimensions();
  const [mode, setMode] = useState<FormMode>(sessionState.mode === 'apikey' ? 'apikey' : 'login');
  const [baseUrl, setBaseUrl] = useState(sessionState.baseUrl);
  const [email, setEmail] = useState(sessionState.email);
  const [password, setPassword] = useState(sessionState.password);
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [code, setCode] = useState('');
  const [apiKey, setApiKey] = useState(sessionState.apiKey);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [publicConfig, setPublicConfig] = useState<PublicConfig>();
  const [setupRequired, setSetupRequired] = useState(false);
  const configuredUrlRef = useRef('');

  const normalizedUrl = normalizeBaseUrl(baseUrl);

  useEffect(() => {
    if (!/^https?:\/\/.+/i.test(normalizedUrl) || configuredUrlRef.current === normalizedUrl) return;
    const timer = setTimeout(() => {
      configuredUrlRef.current = normalizedUrl;
      Promise.allSettled([getPublicConfig(normalizedUrl), getSetupStatus(normalizedUrl)]).then(([configResult, setupResult]) => {
        if (configResult.status === 'fulfilled') setPublicConfig(configResult.value);
        else setPublicConfig(undefined);
        if (setupResult.status === 'fulfilled') {
          const required = setupResult.value.initialized === false;
          setSetupRequired(required);
          if (required) setMode('setup');
          else setMode((current) => current === 'setup' ? 'login' : current);
        } else setSetupRequired(false);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [normalizedUrl]);

  const requiresInvite = Boolean(publicConfig?.require_invite_code);
  const emailVerification = Boolean(publicConfig?.email_verification_enabled);

  function validate(): string {
    if (!/^https?:\/\/.+/i.test(normalizedUrl)) return '请输入完整服务地址，例如 http://192.168.1.2:18083';
    if (mode === 'apikey') {
      if (!apiKey.trim()) return '请输入网关 API Key';
      return '';
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return '请输入有效邮箱';
    if (mode === 'reset') {
      if (!code.trim()) return '请输入邮箱验证码';
      if (password.length < 8) return '新密码至少 8 位';
      return '';
    }
    if (mode === 'setup' && password.length < 8) return '管理员密码至少 8 位';
    if (!password) return '请输入密码';
    if (mode === 'register') {
      if (password.length < 8) return '密码至少 8 位';
      if (requiresInvite && !inviteCode.trim()) return '当前站点注册需要邀请码';
      if (emailVerification && !code.trim()) return '请输入邮箱验证码';
    }
    return '';
  }

  async function handleSendCode(purpose: string) {
    setError('');
    setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请先输入有效邮箱再发送验证码');
      return;
    }
    setSendingCode(true);
    try {
      await sendCode({ email, purpose }, normalizedUrl);
      setNotice('验证码已发送，请查收邮箱');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  }

  async function finishSessionLogin(loginPayload?: unknown) {
    let profile: UserProfile | null = extractProfile(loginPayload);
    try {
      const loadedProfile = await getProfile(undefined, normalizedUrl);
      if (Object.keys(loadedProfile).length) profile = loadedProfile;
    } catch {
      // Profile 拉取失败不阻塞登录，后续页面可重试。
    }
    await saveSession({ baseUrl: normalizedUrl, mode: 'session', email: email.trim(), password, apiKey: '' }, profile);
    queryClient.clear();
    router.replace(profile?.role === 'admin' || profile?.role === 'super_admin' ? '/admin' : '/overview');
  }

  async function submit() {
    const message = validate();
    setError(message);
    setNotice('');
    if (message) return;
    setBusy(true);
    try {
      if (mode === 'apikey') {
        const payload = await apiKeyLogin(apiKey, normalizedUrl);
        await saveSession({ baseUrl: normalizedUrl, mode: 'apikey', email: '', password: '', apiKey: apiKey.trim() }, extractProfile(payload));
        queryClient.clear();
        router.replace('/overview');
        return;
      }
      if (mode === 'reset') {
        await resetPassword({ email, code, password }, normalizedUrl);
        setNotice('密码已重置，请使用新密码登录');
        setMode('login');
        return;
      }
      if (mode === 'setup') {
        let payload: unknown = await setupAdmin({ email, password, name }, normalizedUrl);
        try {
          payload = await login({ email, password }, normalizedUrl);
        } catch { /* 初始化接口可能已经建立会话。 */ }
        await finishSessionLogin(payload);
        return;
      }
      if (mode === 'register') {
        let payload: unknown = await register({ email, password, name, invite_code: inviteCode, code }, normalizedUrl);
        // 注册接口可能直接建立会话，也可能需要再登录一次。
        try {
          payload = await login({ email, password }, normalizedUrl);
        } catch { /* 注册已建立会话时忽略 */ }
        await finishSessionLogin(payload);
        return;
      }
      const payload = await login({ email, password }, normalizedUrl);
      await finishSessionLogin(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { minHeight: 50, backgroundColor: colors.mutedCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingLeft: 44, paddingRight: 13, paddingVertical: 12, color: colors.text, fontSize: 16 } as const;
  const submitLabel = busy
    ? '处理中'
    : mode === 'setup' ? '创建管理员并登录' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : mode === 'reset' ? '重置密码' : '使用 Key 登录';

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 22 }}>
    <View style={{ width: Math.min(460, Math.max(0, viewport.width - 44)), alignSelf: 'center', gap: 22 }}>
      <View style={{ gap: 8, alignItems: 'center' }}>
        <Image source={require('../assets/ai-proxy-mark.png')} resizeMode="contain" style={{ width: 76, height: 76 }} />
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 5 }}>{publicConfig?.site_name || 'AI Proxy'}</Text>
        <Text style={{ color: colors.subtext, fontSize: 15 }}>管理控制台</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.mutedCard }}>
        {(setupRequired ? ([['setup', '初始化管理员', Wand2]] as const) : modeTabs
          .filter(([key]) => key !== 'register' || publicConfig?.allow_open_registration !== false)
        )
          .map(([key, label, Icon]) => {
            const selected = mode === key;
            return <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setMode(key); setError(''); setNotice(''); }} style={{ flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: selected ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Icon color={selected ? colors.primary : colors.subtext} size={15} />
              <Text style={{ color: selected ? colors.primary : colors.subtext, fontSize: 10, fontWeight: '700' }}>{label}</Text>
            </Pressable>;
          })}
      </View>

      <View style={{ gap: 16, padding: 20, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: Platform.OS === 'ios' || Platform.OS === 'web' ? 0.05 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === 'android' ? 1 : 0 }}>
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>服务地址</Text>
          <View><Link2 color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} /><TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="http://192.168.1.2:18083" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" style={fieldStyle} /></View>
        </View>

        {mode === 'apikey' ? <View style={{ gap: 7 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>网关 API Key</Text>
          <View><KeyRound color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} /><TextInput value={apiKey} onChangeText={setApiKey} placeholder="aps_..." placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} secureTextEntry={!showPassword} style={[fieldStyle, { paddingRight: 50 }]} /></View>
          <Pressable accessibilityLabel={showPassword ? '隐藏 Key' : '显示 Key'} onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 5, top: 32, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>{showPassword ? <EyeOff color={colors.subtext} size={19} /> : <Eye color={colors.subtext} size={19} />}</Pressable>
        </View> : <>
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>邮箱</Text>
            <View><UserRound color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} /><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" style={fieldStyle} /></View>
          </View>

          {mode === 'register' || mode === 'setup' ? <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>名称（可选）</Text>
            <View><UserRoundPlus color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} /><TextInput value={name} onChangeText={setName} placeholder="昵称" placeholderTextColor={colors.placeholder} autoCorrect={false} style={fieldStyle} /></View>
          </View> : null}

          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{mode === 'reset' || mode === 'setup' ? '管理员密码' : '密码'}</Text>
            <View>
              <LockKeyhole color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} />
              <TextInput value={password} onChangeText={setPassword} placeholder={mode === 'reset' ? '至少 8 位新密码' : '输入密码'} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} textContentType={mode === 'login' ? 'password' : 'newPassword'} secureTextEntry={!showPassword} style={[fieldStyle, { paddingRight: 50 }]} />
              <Pressable accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 5, top: 4, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>{showPassword ? <EyeOff color={colors.subtext} size={19} /> : <Eye color={colors.subtext} size={19} />}</Pressable>
            </View>
          </View>

          {mode === 'register' && requiresInvite ? <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>邀请码</Text>
            <View><KeyRound color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} /><TextInput value={inviteCode} onChangeText={setInviteCode} placeholder="邀请码" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={fieldStyle} /></View>
          </View> : null}

          {(mode === 'reset') || (mode === 'register' && emailVerification) ? <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>邮箱验证码</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><View><MailCheck color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }} /><TextInput value={code} onChangeText={setCode} placeholder="验证码" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" style={fieldStyle} /></View></View>
              <Pressable disabled={sendingCode} onPress={() => void handleSendCode(mode === 'reset' ? 'reset-password' : 'register')} style={{ minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: sendingCode ? 0.6 : 1 }}>
                {sendingCode ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>发送验证码</Text>}
              </Pressable>
            </View>
          </View> : null}
        </>}

        {error ? <Text style={{ color: colors.danger, backgroundColor: colors.dangerBg, padding: 12, borderRadius: 12 }}>{error}</Text> : null}
        {notice ? <Text style={{ color: colors.success, backgroundColor: colors.successBg, padding: 12, borderRadius: 12 }}>{notice}</Text> : null}

        <Pressable onPress={() => void submit()} disabled={busy} style={({ pressed }) => ({ backgroundColor: busy ? colors.disabled : colors.primary, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.72 : 1 })}>
          {busy ? <ActivityIndicator color="#fff" /> : <LogIn color="#fff" size={19} />}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{submitLabel}</Text>
        </Pressable>
      </View>

      <Text style={{ color: colors.subtext, fontSize: 11, textAlign: 'center', lineHeight: 17 }}>
        管理端默认地址为 http://&lt;服务器&gt;:18083；公网访问建议配置 HTTPS。{'\n'}API Key 登录仅提供 Key 总览与聊天测试。
      </Text>
    </View>
  </ScrollView></SafeAreaView>;
}
