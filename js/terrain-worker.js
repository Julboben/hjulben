// The worker that paints the game's terrain chunks around the view before
// the camera reaches them (see createChunkPainter in terrain-render.js), so
// a ride never stops to paint one.
import { chunkPainterThread } from "./terrain-render.js";

const paint = chunkPainterThread();
self.onmessage = ({ data }) => {
  const reply = paint(data);
  if (reply) self.postMessage(reply, reply.image ? [reply.image] : []);
};
