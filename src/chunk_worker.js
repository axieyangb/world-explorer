import { setBeijingDemState } from './environment.js';
import { computeChunkWorkerPayload } from './chunk_builder.js';
import { fetchGlobalChunkData } from './global_tiles.js';

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'initDem') {
    setBeijingDemState(msg.demState);
    self.postMessage({ type: 'demReady' });
    return;
  }
  if (msg.type === 'buildChunk') {
    const { key, cx, cz, ox, oz, worldOrigin } = msg;
    try {
      const data = msg.data || (await fetchGlobalChunkData(cx, cz, worldOrigin));
      const { payload, transferList } = computeChunkWorkerPayload(cx, cz, ox, oz, data);
      self.postMessage({ type: 'chunkBuilt', key, payload }, transferList);
    } catch (err) {
      self.postMessage({ type: 'chunkError', key, error: String(err && err.message ? err.message : err) });
    }
  }
};
