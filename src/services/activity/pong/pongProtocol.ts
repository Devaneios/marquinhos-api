import type { PongState } from 'services/activity/pong/PongEngine';

// Binary layout for the 'state' snapshot broadcast — must be kept in sync by
// hand with the decoder in marquinhos-activity-client/src/games/pong/pongProtocol.ts.
//
// offset  type     field
// 0       Uint32   snapshotSeq
// 4       Uint32   ackLeft
// 8       Uint32   ackRight
// 12      Float32  paddleLeftY
// 16      Float32  paddleRightY
// 20      Float32  ballX
// 24      Float32  ballY
// 28      Uint8    scoreLeft
// 29      Uint8    scoreRight
// 30      Uint8    winner (0=none, 1=left, 2=right)
export const STATE_SNAPSHOT_BYTES = 31;

function encodeWinner(winner: PongState['winner']): number {
  if (winner === 'left') return 1;
  if (winner === 'right') return 2;
  return 0;
}

export function encodeStateSnapshot(
  seq: number,
  ackLeft: number,
  ackRight: number,
  state: PongState,
): ArrayBuffer {
  const buffer = new ArrayBuffer(STATE_SNAPSHOT_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, seq);
  view.setUint32(4, ackLeft);
  view.setUint32(8, ackRight);
  view.setFloat32(12, state.paddles.left);
  view.setFloat32(16, state.paddles.right);
  view.setFloat32(20, state.ball.x);
  view.setFloat32(24, state.ball.y);
  view.setUint8(28, state.score.left);
  view.setUint8(29, state.score.right);
  view.setUint8(30, encodeWinner(state.winner));
  return buffer;
}
