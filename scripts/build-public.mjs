import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));

// Stage 2: keep the source data in the repository, but never copy it into
// Vercel's static output. A later stage will expose it through a protected API.
const data = JSON.parse(await readFile(source, 'utf8'));
if (!Array.isArray(data.notes)) {
  throw new Error('실습용 원본 자료 형식을 확인하세요. 실제 학생 자료를 넣으면 안 됩니다.');
}
await mkdir(resolve(root, 'public'), { recursive: true });

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}

console.log('원본 data.json은 유지하고 public/data.json 정적 배포는 비활성화했습니다.');
