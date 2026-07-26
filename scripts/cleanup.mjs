// 一键清理无用文件：旧 Lucky 源码、旧文档、旧构建产物、空目录与本地缓存。
// 运行：node scripts/cleanup.mjs
import { existsSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const files = [
  // 旧 Lucky 页面与组件
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
  // 旧文档
  'docs/Lucky_API_Endpoints.json',
  'docs/Lucky_APP_API_开发文档.md',
  // 被本脚本取代的旧清理脚本
  'scripts/cleanup-legacy.mjs',
];

const directories = [
  'artifacts',    // 旧 Lucky APK / IPA 构建产物（约 150MB）
  '_to_delete',   // 旧清理脚本的暂存目录（如果存在）
  '.expo',        // 本地开发缓存，可随时再生
];

const emptyDirCandidates = [
  'app/services', 'app/accounts', 'app/api-keys', 'app/groups',
  'app/ops', 'app/usage-records', 'app/users', 'src/hooks',
];

function sizeOf(path) {
  try {
    const stats = statSync(path);
    if (stats.isFile()) return stats.size;
    return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0);
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

let removed = 0;
let freed = 0;

for (const relative of files) {
  const path = join(root, relative);
  if (!existsSync(path)) continue;
  freed += sizeOf(path);
  rmSync(path, { force: true });
  removed += 1;
  console.log(`已删除: ${relative}`);
}

for (const relative of directories) {
  const path = join(root, relative);
  if (!existsSync(path)) continue;
  const size = sizeOf(path);
  rmSync(path, { recursive: true, force: true });
  freed += size;
  removed += 1;
  console.log(`已删除目录: ${relative}/ (${formatBytes(size)})`);
}

for (const relative of emptyDirCandidates) {
  const path = join(root, relative);
  try {
    if (existsSync(path) && readdirSync(path).length === 0) {
      rmdirSync(path);
      console.log(`已删除空目录: ${relative}/`);
    }
  } catch { /* 非空目录跳过 */ }
}

console.log(`\n完成：清理 ${removed} 项，释放约 ${formatBytes(freed)}。`);
console.log('建议随后执行: npm run verify  （校验接口清单与 TypeScript）');
