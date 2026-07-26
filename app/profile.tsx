import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pencil, Trash2, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { ErrorState, FullScreenSafeArea, Page, Panel, SectionHeader } from '@/src/components/ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { deleteProfile, getProfile, updateProfile } from '@/src/services/account';
import { endSession, setSessionProfile } from '@/src/store/session';
import type { ApiRecord } from '@/src/types/api';

export default function ProfileScreen() {
  const colors = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ApiRecord>({});

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: async ({ signal }) => {
      const value = await getProfile(signal);
      setSessionProfile(value);
      return value;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateProfile(draft),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('已保存', '资料更新成功');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProfile(),
    onSuccess: async () => {
      await endSession();
      queryClient.clear();
      router.replace('/login');
    },
    onError: (error) => Alert.alert('注销失败', error.message),
  });

  function confirmDelete() {
    Alert.alert('注销账号', '将永久删除当前账号及其数据，且无法恢复。确定继续吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '继续',
        style: 'destructive',
        onPress: () => Alert.alert('最后确认', '真的要注销账号吗？此操作不可撤销。', [
          { text: '取消', style: 'cancel' },
          { text: '永久注销', style: 'destructive', onPress: () => deleteMutation.mutate() },
        ]),
      },
    ]);
  }

  return <Page title="个人资料" icon={UserRound} safeTop={false} refreshing={profile.isFetching} onRefresh={() => profile.refetch()}>
    {profile.error ? <ErrorState message={profile.error.message} retry={() => profile.refetch()} /> : null}
    {profile.data ? <Panel>
      <SectionHeader icon={UserRound} title="账号信息" />
      <StructuredDataView value={profile.data} />
      <Pressable onPress={() => { setDraft({ name: profile.data?.name ?? '', email: profile.data?.email ?? '' }); setEditing(true); saveMutation.reset(); }} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Pencil color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '800' }}>编辑资料</Text>
      </Pressable>
    </Panel> : null}

    <Panel>
      <SectionHeader icon={Trash2} title="危险操作" />
      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>注销账号会永久删除该账号，API Key 和用量记录随之失效。</Text>
      <Pressable disabled={deleteMutation.isPending} onPress={confirmDelete} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Trash2 color={colors.danger} size={16} /><Text style={{ color: colors.danger, fontWeight: '800' }}>{deleteMutation.isPending ? '注销中…' : '注销账号'}</Text>
      </Pressable>
    </Panel>

    <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
      <FullScreenSafeArea style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ maxHeight: '84%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.page, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' }}>编辑资料</Text>
            <Pressable accessibilityLabel="关闭" onPress={() => setEditing(false)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={16} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
            <StructuredForm value={draft} onChange={setDraft} />
          </ScrollView>
          {saveMutation.error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{saveMutation.error.message}</Text> : null}
          <Pressable disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()} style={{ minHeight: 48, borderRadius: 13, backgroundColor: saveMutation.isPending ? colors.disabled : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{saveMutation.isPending ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>
  </Page>;
}
