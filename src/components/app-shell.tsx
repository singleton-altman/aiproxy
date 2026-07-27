import Constants from 'expo-constants';
import { usePathname, useRouter } from 'expo-router';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CloudCog,
  FileKey2,
  Gauge,
  Gift,
  KeyRound,
  LayoutGrid,
  Network,
  Package,
  ScrollText,
  ServerCog,
  TerminalSquare,
  UserRound,
  UsersRound,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';
import { isAdmin, sessionState } from '@/src/store/session';

const { useSnapshot } = require('valtio/react');

type ViewMode = 'admin' | 'user';
type MenuItem = { label: string; icon: LucideIcon; href: string };

const userMenu: MenuItem[] = [
  { label: '概览', icon: Gauge, href: '/overview?scope=user' },
  { label: '个人资料', icon: UserRound, href: '/profile' },
  { label: 'API 密钥', icon: KeyRound, href: '/keys' },
  { label: '我的套餐', icon: Package, href: '/plans' },
  { label: '模型', icon: Boxes, href: '/modules/models' },
  { label: 'Claude Code', icon: TerminalSquare, href: '/chat' },
  { label: '用量', icon: BarChart3, href: '/modules/usage' },
  { label: '请求', icon: ScrollText, href: '/requests' },
];

const adminMenu: MenuItem[] = [
  { label: '概览', icon: LayoutGrid, href: '/overview?scope=admin' },
  { label: '用户', icon: UsersRound, href: '/admin-users' },
  { label: '邀请码', icon: Gift, href: '/admin-invites' },
  { label: '套餐', icon: Package, href: '/admin-plans' },
  { label: '上游提供商', icon: CloudCog, href: '/admin-providers' },
  { label: '账号', icon: UsersRound, href: '/admin-accounts' },
  { label: '配额', icon: CircleDollarSign, href: '/admin-quota' },
  { label: '网络与出口', icon: Network, href: '/admin-proxies' },
  { label: '统计', icon: BarChart3, href: '/admin-stats' },
  { label: '模型', icon: Boxes, href: '/admin-models' },
  { label: '凭证', icon: FileKey2, href: '/admin-tokens' },
  { label: '系统', icon: ServerCog, href: '/admin-system' },
];

function cleanPath(href: string) {
  return href.split('?')[0];
}

function Sidebar({ admin }: { admin: boolean }) {
  const colors = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<ViewMode>(admin && (pathname === '/overview' || pathname.startsWith('/admin')) ? 'admin' : 'user');
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const menu = mode === 'admin' && admin ? adminMenu : userMenu;

  useEffect(() => {
    if (!admin) setMode('user');
    else if (pathname.startsWith('/admin')) setMode('admin');
  }, [admin, pathname]);

  function changeMode(next: ViewMode) {
    setMode(next);
    router.replace((next === 'admin' ? '/overview?scope=admin' : '/overview?scope=user') as never);
  }

  return <SafeAreaView edges={['top', 'bottom', 'left']} style={{ width: collapsed ? 72 : 218, backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.border }}>
    <View style={{ minHeight: 58, paddingHorizontal: collapsed ? 12 : 14, borderBottomWidth: 1, borderBottomColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Image source={require('../../assets/ai-proxy-mark.png')} resizeMode="contain" style={{ width: 28, height: 28 }} />
      {!collapsed ? <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>AI Proxy</Text><View style={{ alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.warningBg }}><Text style={{ color: colors.warning, fontSize: 9, fontWeight: '700' }}>v{version}</Text></View></View> : null}
      <Pressable accessibilityLabel={collapsed ? '展开导航' : '收起导航'} onPress={() => setCollapsed((value) => !value)} style={{ width: 30, height: 30, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}>{collapsed ? <ChevronRight color={colors.subtext} size={15} /> : <ChevronLeft color={colors.subtext} size={15} />}</Pressable>
    </View>

    {admin && !collapsed ? <View style={{ margin: 12, padding: 3, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 3 }}>
      {([['admin', '管理视图', ServerCog], ['user', '用户视图', UserRound]] as const).map(([key, label, Icon]) => {
        const selected = mode === key;
        return <Pressable key={key} onPress={() => changeMode(key)} style={{ flex: 1, minHeight: 32, borderRadius: 7, backgroundColor: selected ? colors.card : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon color={selected ? colors.primary : colors.subtext} size={13} /><Text style={{ color: selected ? colors.text : colors.subtext, fontSize: 10, fontWeight: selected ? '700' : '600' }}>{label}</Text></Pressable>;
      })}
    </View> : null}

    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: collapsed ? 10 : 12, paddingTop: admin && !collapsed ? 0 : 12, paddingBottom: 18, gap: 3 }}>
      {menu.map(({ label, icon: Icon, href }) => {
        const selected = pathname === cleanPath(href);
        return <Pressable key={`${mode}-${label}`} accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => router.push(href as never)} style={({ pressed }) => ({ minHeight: 38, borderRadius: 12, paddingHorizontal: collapsed ? 0 : 11, backgroundColor: selected ? colors.mutedCard : pressed ? colors.mutedCard : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, opacity: pressed ? 0.68 : 1 })}>
          <Icon color={selected ? colors.text : colors.subtext} size={15} strokeWidth={selected ? 2.3 : 2} />
          {!collapsed ? <Text numberOfLines={1} style={{ color: selected ? colors.text : colors.subtext, fontSize: 12, fontWeight: selected ? '700' : '600' }}>{label}</Text> : null}
        </Pressable>;
      })}
    </ScrollView>
  </SafeAreaView>;
}

export function AppShell({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  useSnapshot(sessionState);
  if (!enabled || width < 900) return children;
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.page }}>
    <Sidebar admin={isAdmin()} />
    <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
  </View>;
}
