import fs from 'node:fs/promises';
import path from 'node:path';
import { getDeploymentIdentity } from './deployment-identity.mjs';

async function buildPublic() {
  // 1. aleph.config.json 읽기
  const configRaw = await fs.readFile('./aleph.config.json', 'utf-8');
  const config = JSON.parse(configRaw);

  // 2. deployment identity 읽기
  const identity = await getDeploymentIdentity();

  // 3. aleph.json 내용 구성 (비밀값 제외)
  const alephData = {
    ...config,
    identity,
    buildTime: new Date().toISOString()
  };

  // 4. public 디렉터리가 없으면 생성 후 public/aleph.json 쓰기
  await fs.mkdir('./public', { recursive: true });
  await fs.writeFile(
    path.join('./public', 'aleph.json'),
    JSON.stringify(alephData, null, 2),
    'utf-8'
  );
}

buildPublic().catch((err) => {
  console.error('Failed to build public assets:', err);
  process.exit(1);
});