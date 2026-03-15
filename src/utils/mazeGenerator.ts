/**
 * Backtracking maze generation algorithm.
 * Ported from https://github.com/professor-l/mazes (backtracking.js)
 *
 * Grid convention:
 *   0 = open path
 *   1 = wall
 *
 * Navigable cells sit at odd (row, col) indices.
 * Passage cells connect adjacent navigable cells at the midpoint (even index).
 * All boundary cells are walls except the opened entry and exit.
 *
 * Entry: maze[0][1]           (hole in top wall, col 1)
 * Exit:  maze[height-1][width-2]  (hole in bottom wall, second-to-last col)
 */

function neighbors(
  maze: number[][],
  row: number,
  col: number,
  height: number,
  width: number,
): [number, number][] {
  const result: [number, number][] = [];
  const dirs: [number, number][] = [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ];
  for (const [dr, dc] of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr > 0 && nr < height - 1 && nc > 0 && nc < width - 1 && maze[nr][nc] === 1) {
      result.push([nr, nc]);
    }
  }
  return result;
}

export function generateMaze(width: number, height: number): number[][] {
  // Adjust to odd dimensions (algorithm requirement)
  width -= width % 2;
  width++;
  height -= height % 2;
  height++;

  // Fill grid with walls
  const maze: number[][] = Array.from({ length: height }, () => Array(width).fill(1));

  // Iterative DFS from (row=1, col=1) — the first navigable cell
  maze[1][1] = 0;
  const stack: [number, number][] = [[1, 1]];

  while (stack.length > 0) {
    const [cr, cc] = stack[stack.length - 1];
    const ns = neighbors(maze, cr, cc, height, width);
    if (ns.length > 0) {
      const [nr, nc] = ns[Math.floor(Math.random() * ns.length)];
      // Carve the passage cell between current and chosen neighbor
      maze[(cr + nr) >> 1][(cc + nc) >> 1] = 0;
      // Carve the neighbor cell
      maze[nr][nc] = 0;
      stack.push([nr, nc]);
    } else {
      stack.pop();
    }
  }

  // Open entry (top wall, col 1) and exit (bottom wall, second-to-last col)
  maze[0][1] = 0;
  maze[height - 1][width - 2] = 0;

  return maze;
}
