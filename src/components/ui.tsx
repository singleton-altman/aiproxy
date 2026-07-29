import type { LucideIcon } from 'lucide-react-native';
import { Inbox, RefreshCw, Search, TriangleAlert } from 'lucide-react-native';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';

const CARD_RADIUS = 18;
const CONTROL_RADIUS = 12;

export function FullScreenSafeArea({ style, ...props }: ComponentProps<typeof View>) {
  const insets = useSafeAreaInsets();
  const modalInsets = { paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left };
  return <KeyboardAvoidingView {...props} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[style, modalInsets]} />;
}

function surfaceShadow(platform: typeof Platform.OS) {
  return {
    shadowColor: '#000000',
    shadowOpacity: platform === 'ios' || platform === 'web' ? 0.06 : 0,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: platform === 'android' ? 2 : 0,
  } as const;
}

type PageHeaderProps = { title: string; subtitle?: string; icon?: LucideIcon; refreshing?: boolean; onRefresh?: () => void };

export function PageHeader({ title, subtitle, icon: Icon, refreshing, onRefresh }: PageHeaderProps) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>{Icon ? <IconTile icon={Icon} size={42} iconSize={20} /> : null}<View style={{ flex: 1, gap: 1 }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text> : null}</View></View>
    {onRefresh ? <Pressable accessibilityLabel="刷新" onPress={onRefresh} disabled={refreshing} style={({ pressed }) => ({ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primarySoft, opacity: refreshing ? 0.55 : pressed ? 0.62 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>{refreshing ? <ActivityIndicator color={colors.primary} /> : <RefreshCw color={colors.primary} size={17} strokeWidth={2.25} />}</Pressable> : null}
  </View>;
}

export function Page({ title, subtitle, icon, children, refreshing, onRefresh, safeTop = true, contentMaxWidth = 820, scrollable = true, showHeader = true }: PageHeaderProps & { children: ReactNode; safeTop?: boolean; contentMaxWidth?: number; scrollable?: boolean; showHeader?: boolean }) {
  const colors = useAppTheme();
  const content = <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: scrollable ? 12 : 10, gap: 12, flex: scrollable ? undefined : 1 }}>
      {showHeader ? <PageHeader title={title} subtitle={subtitle} icon={icon} refreshing={refreshing} onRefresh={onRefresh} /> : null}
      {children}
    </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={safeTop ? ['top'] : []}>
    {scrollable ? <ScrollView
      style={{ flex: 1 }}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      scrollToOverflowEnabled={false}
      automaticallyAdjustContentInsets={false}
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={false}
      contentContainerStyle={{ width: '100%', flexGrow: 1 }}
    >{content}</ScrollView> : content}
  </SafeAreaView>;
}

type ResponsiveTab<Key extends string> = readonly [Key, string, LucideIcon];

export function ResponsiveTabBar<Key extends string>({ tabs, value, onChange, maxWidth = 820 }: { tabs: readonly ResponsiveTab<Key>[]; value: Key; onChange: (key: Key) => void; maxWidth?: number }) {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const singleRow = width >= tabs.length * 82 + 40;
  return <View style={{ width: '100%', maxWidth, alignSelf: 'center', padding: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
    {tabs.map(([key, label, Icon]) => {
      const selected = value === key;
      return <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onChange(key)}
        style={({ pressed }) => ({
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: singleRow ? 0 : '30%',
          minWidth: 0,
          minHeight: singleRow ? 44 : 56,
          paddingHorizontal: 6,
          paddingVertical: singleRow ? 0 : 6,
          borderRadius: 12,
          backgroundColor: selected ? colors.card : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: singleRow ? 'row' : 'column',
          gap: singleRow ? 6 : 3,
          ...(selected ? surfaceShadow(Platform.OS) : {}),
          opacity: pressed ? 0.62 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Icon color={selected ? colors.primary : colors.subtext} size={16} strokeWidth={selected ? 2.4 : 2.1} />
        <Text numberOfLines={2} style={{ maxWidth: '100%', color: selected ? colors.primary : colors.subtext, fontSize: 11, lineHeight: 14, fontWeight: selected ? '700' : '600', textAlign: 'center' }}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function Panel({ children }: { children: ReactNode }) {
  const colors = useAppTheme();
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: CARD_RADIUS, padding: 14, gap: 10, ...surfaceShadow(Platform.OS) }}>{children}</View>;
}

export function IconTile({ icon: Icon, color, background, size = 36, iconSize = 18 }: { icon: LucideIcon; color?: string; background?: string; size?: number; iconSize?: number }) {
  const colors = useAppTheme();
  return <View style={{ width: size, height: size, borderRadius: Math.max(10, Math.round(size * 0.3)), borderWidth: 1, borderColor: background ?? colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: background ?? colors.primarySoft }}><Icon color={color ?? colors.primary} size={iconSize} strokeWidth={2.25} /></View>;
}

export function AppSwitch({ value, onValueChange, disabled = false, accessibilityLabel }: { value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; accessibilityLabel?: string }) {
  const colors = useAppTheme();
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [position, value]);

  return <Pressable
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="switch"
    accessibilityState={{ checked: value, disabled }}
    accessibilityValue={{ text: value ? '开启' : '关闭' }}
    disabled={disabled}
    hitSlop={5}
    onPress={() => onValueChange(!value)}
    style={({ pressed }) => ({
      width: 44,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
      transform: [{ scale: pressed ? 0.97 : 1 }],
    })}
  >
    <View style={{ width: 38, height: 22, borderRadius: 11, borderWidth: 1, borderColor: value ? colors.primary : colors.border, backgroundColor: value ? colors.primary : colors.muted, justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', top: 1, left: 1, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2, transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }} />
    </View>
  </Pressable>;
}

export function EmptyState({ message, icon: Icon = Inbox, embedded = false }: { message: string; icon?: LucideIcon; embedded?: boolean }) {
  const colors = useAppTheme();
  const content = <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}><IconTile icon={Icon} color={colors.subtext} background={colors.mutedCard} size={42} iconSize={21} /><Text style={{ color: colors.subtext, textAlign: 'center' }}>{message}</Text></View>;
  return embedded ? content : <Panel>{content}</Panel>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ padding: 14, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: colors.dangerBg, backgroundColor: colors.dangerBg, gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={TriangleAlert} color={colors.danger} background={colors.card} size={34} iconSize={17} /><Text style={{ flex: 1, color: colors.danger, lineHeight: 19 }}>{message}</Text></View>{retry ? <Pressable onPress={retry} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 12, borderRadius: CONTROL_RADIUS, backgroundColor: colors.card, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}><RefreshCw color={colors.danger} size={14} /><Text style={{ color: colors.danger, fontWeight: '700' }}>重试</Text></Pressable> : null}</View>;
}

export function SectionHeader({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }}><IconTile icon={Icon} size={30} iconSize={15} /><Text style={{ flex: 1, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700' }}>{title}</Text>{meta ? <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '700' }}>{meta}</Text></View> : null}</View>;
}

export function SheetHandle() {
  const colors = useAppTheme();
  return <View accessibilityElementsHidden style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: colors.muted, alignSelf: 'center', marginTop: -5, marginBottom: 2 }} />;
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const colors = useAppTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 13, borderWidth: 1, borderColor: focused ? colors.primary : colors.border, paddingHorizontal: 11 }}><Search color={focused ? colors.primary : colors.subtext} size={16} strokeWidth={2.15} /><TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, paddingVertical: 9, fontSize: 13 }} /></View>;
}

export function ServiceButton({ icon: Icon, label, detail, onPress, iconColor, iconBackground }: { icon: LucideIcon; label: string; detail: string; onPress: () => void; iconColor?: string; iconBackground?: string }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 160, minHeight: 82, padding: 11, borderRadius: 16, backgroundColor: pressed ? colors.mutedCard : colors.card, borderWidth: 1, borderColor: pressed ? colors.primary : iconBackground ?? colors.border, ...surfaceShadow(Platform.OS), opacity: pressed ? 0.78 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={Icon} color={iconColor} background={iconBackground} size={36} iconSize={18} /><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: '800', fontSize: 14, lineHeight: 19 }}>{label}</Text><Text numberOfLines={2} ellipsizeMode="tail" style={{ color: iconColor ?? colors.primary, fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{detail}</Text></View></View>
  </Pressable>;
}
