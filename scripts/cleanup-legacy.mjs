// 一次性清理脚本：把旧的 Lucky 版本文件移动到 _to_delete/，确认无误后可整体删除该目录。
// 运行：node scripts/cleanup-legacy.mjs
import { existsSync, mkdirSync, renameSync, rmdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const trash = join(root, '_to_delete');

const legacyFiles = [
  'app/docker.tsx',
  'app/webservice.tsx',
  'app/services/[kind].tsx',
  'app/(tabs)/monitor.tsx',
  'app/(tabs)/manage.tsx',
  'app/(tabs)/users.tsx',
  'src/components/docker-overview.tsx',
  'src/components/lucky-ui.tsx',
  'src/hooks/use-lucky-status.ts',
  'src/lib/lucky-fetch.ts',
  'src/services/ddns.ts',
  'src/services/docker.ts',
  'src/services/iconlib.ts',
  'src/services/lucky-endpoints.ts',
  'src/services/lucky.ts',
  'src/services/ssl.ts',
  'src/services/webservice.ts',
  'src/store/lucky-session.ts',
  'src/types/lucky.ts',
  'src/api/lucky-endpoints.generated.ts',
  'docs/Lucky_API_Endpoints.json',
  'docs/Lucky_APP_API_开发文档.md',
];

const emptyDirCandidates = ['app/services', 'src/hooks'];

let moved = 0;
for (const relative of legacyFiles) {
  const source = join(root, relative);
  if (!existsSync(source)) continue;
  const target = join(trash, relative);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(source, target);
  moved += 1;
  console.log(`moved: ${relative}`);
}

for (const relative of emptyDirCandidates) {
  const directory = join(root, relative);
  try {
    if (existsSync(directory) && readdirSync(directory).length === 0) {
      rmdirSync(directory);
      console.log(`removed empty dir: ${relative}`);
    }
  } catch { /* keep non-empty dirs */ }
}

console.log(moved
  ? `完成：${moved} 个旧文件已移动到 _to_delete/，确认无误后可删除该目录。`
  : '没有需要清理的旧文件。');
