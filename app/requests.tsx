import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, SearchField } from '@/src/components/ui';
import { useAppTheme } from '@/src/lib/theme';
import { getRequests } from '@/src/services/account';
import type { RequestLogItem } from '@/src/types/api';

const PAGE_SIZE = 30;

function formatTokens(item: RequestLogItem) {
  const total = Number(item.total_tokens);
  if (!Number.isFinite(total)) return '';
  return `${total} tok`;
}

function RequestCard({ item }: { item: RequestLogItem }) {
  const colors = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const failed = Boolean(item.error) || (typeof item.status_code === 'number' && item.status_code >= 400);
  const statusText = item.status_code !== undefined ? `HTTP ${item.status_code}` : String(item.status ?? '');
  return <Pressable onPress={() => setExpanded(!expanded)} style={({ pressed }) => ({ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 6, opacity: pressed ? 0.7 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: failed ? colors.danger : colors.success }} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>{String(item.model ?? '未知模型')}</Text>
      <Text style={{ color: failed ? colors.danger : colors.subtext, fontSize: 10, fontWeight: '700' }}>{statusText}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, color: colors.subtext, fontSize: 10 }}>{String(item.created_at ?? '')}</Text>
      {typeof item.latency_ms === 'number' ? <Text style={{ color: colors.subtext, fontSize: 10, fontVariant: ['tabular-nums'] }}>{item.latency_ms} ms</Text> : null}
      <Text style={{ color: colors.subtext, fontSize: 10, fontVariant: ['tabular-nums'] }}>{formatTokens(item)}</Text>
      {typeof item.cost === 'number' ? <Text style={{ color: colors.warning, fontSize: 10, fontVariant: ['tabular-nums'] }}>{item.cost.toFixed(5)}</Text> : null}
    </View>
    {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 8, gap: 4 }}>
      {([['请求 ID', item.id], ['提供方', item.provider], ['输入 Token', item.prompt_tokens], ['输出 Token', item.completion_tokens], ['API Key', item.api_key_id]] as const)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ width: 76, color: colors.subtext, fontSize: 10 }}>{label}</Text>
          <Text selectable style={{ flex: 1, color: colors.text, fontSize: 10, fontFamily: 'monospace' }}>{String(value)}</Text>
        </View>)}
      {item.error ? <Text selectable style={{ color: colors.danger, fontSize: 11, lineHeight: 16 }}>{String(item.error)}</Text> : null}
    </View> : null}
  </Pressable>;
}

export default function RequestsScreen() {
  const colors = useAppTheme();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['requests', 'list', submittedSearch],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => getRequests({
      limit: PAGE_SIZE,
      cursor: pageParam || undefined,
      q: submittedSearch || undefined,
    }, signal),
    getNextPageParam: (lastPage) => (lastPage.nextCursor && lastPage.items.length ? lastPage.nextCursor : undefined),
  });

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.items), [query.data]);

  return <Page title="请求日志" subtitle="网关调用记录" icon={ScrollText} safeTop={false} scrollable={false} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
    <SearchField value={search} onChangeText={setSearch} placeholder="搜索模型或关键词，回车提交" />
    <Pressable onPress={() => setSubmittedSearch(search.trim())} style={{ minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Search color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>搜索</Text>
    </Pressable>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <FlatList
      data={items}
      keyExtractor={(item, index) => String(item.id ?? index)}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={Platform.OS === 'android'}
      initialNumToRender={15}
      maxToRenderPerBatch={15}
      windowSize={9}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ gap: 10, paddingBottom: 20, flexGrow: items.length ? 0 : 1 }}
      ListEmptyComponent={!query.isFetching ? <EmptyState message="暂无请求记录" icon={ScrollText} /> : null}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={query.isFetchingNextPage || query.isLoading ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 14 }} /> : null}
      renderItem={({ item }) => <RequestCard item={item} />}
    />
  </Page>;
}
