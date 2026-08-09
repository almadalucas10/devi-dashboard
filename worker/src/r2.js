// ============================================================================
// R2 helpers — leitura/escrita de JSON no bucket
// ============================================================================

export async function readJson(env, key) {
  try {
    const obj = await env.CACHE_BUCKET.get(key);
    if (!obj) return null;
    return await obj.json();
  } catch (e) {
    console.error(`R2 read ${key}: ${e.message}`);
    return null;
  }
}

export async function writeJson(env, key, data) {
  try {
    await env.CACHE_BUCKET.put(key, JSON.stringify(data), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  } catch (e) {
    console.error(`R2 write ${key}: ${e.message}`);
    throw e;
  }
}

export async function readSyncMeta(env) {
  const meta = await readJson(env, "sync-meta.json");
  return meta || { omie: 0, dashboard: 0 };
}

export async function writeSyncMeta(env, partial) {
  const meta = await readSyncMeta(env);
  Object.assign(meta, partial, { updatedAt: new Date().toISOString() });
  await writeJson(env, "sync-meta.json", meta);
}
