import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Dockerfile content
    const dockerfile = `FROM denoland/deno:2.1.1

WORKDIR /app

COPY ./worker.js ./worker.js
COPY ./.env.docker .env

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "worker.js"]
`;

    // docker-compose.yml content
    const dockerCompose = `version: '3.8'

services:
  zip-worker:
    build: .
    container_name: kessey-zip-worker
    restart: always
    ports:
      - "3000:3000"
    environment:
      - WORKER_PORT=3000
      - WORKER_SECRET=\${WORKER_SECRET}
      - BASE44_APP_ID=\${BASE44_APP_ID}
      - MINIO_ENDPOINT=\${MINIO_ENDPOINT}
      - MINIO_ACCESS_KEY=\${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=\${MINIO_SECRET_KEY}
      - MINIO_BUCKET_NAME=\${MINIO_BUCKET_NAME}
    networks:
      - kessey-network

networks:
  kessey-network:
    driver: bridge
`;

    // .env.docker template
    const envDocker = `# Copy these values from your Base44 app
BASE44_APP_ID=your_app_id
MINIO_ENDPOINT=https://your-minio.com
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET_NAME=your_bucket
WORKER_SECRET=random_secret_token
WORKER_PORT=3000
`;

    // README.md
    const readme = `# ZIP Worker Docker Setup

Dedikált Docker konténer a ZIP feldolgozáshoz, HTTP timeout nélkül.

## Setup

### 1. Környezeti változók
A \`.env.docker\` fájlban:
\`\`\`env
BASE44_APP_ID=your_app_id
MINIO_ENDPOINT=https://your-minio.com
MINIO_ACCESS_KEY=your_key
MINIO_SECRET_KEY=your_secret
MINIO_BUCKET_NAME=your_bucket
WORKER_SECRET=random_token
WORKER_PORT=3000
\`\`\`

### 2. Build és futtatás
\`\`\`bash
cd docker
docker-compose up -d
\`\`\`

### 3. Ellenőrzés
\`\`\`bash
curl http://localhost:3000/health
\`\`\`

## Logs
\`\`\`bash
docker logs -f kessey-zip-worker
\`\`\`

## Leállítás
\`\`\`bash
docker-compose down
\`\`\`
`;

    // Create a simple ZIP structure response
    return Response.json({
      files: {
        'Dockerfile': dockerfile,
        'docker-compose.yml': dockerCompose,
        '.env.docker': envDocker,
        'README.md': readme
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});