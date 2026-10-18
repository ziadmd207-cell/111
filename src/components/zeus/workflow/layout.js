export const NODE_W = 236;
export const NODE_H = 138;
export const COL_GAP = 96;
export const ROW_GAP = 26;
export const PAD = 28;
export const HEADER_H = 44;

// Lays nodes out as a left-to-right workflow: each phase is a column, nodes stack in rows.
export function buildGraph(nodes) {
  const phases = [...new Set(nodes.map((n) => n.phase || 1))].sort((a, b) => a - b);

  const positioned = [];
  phases.forEach((phase, col) => {
    nodes
      .filter((n) => (n.phase || 1) === phase)
      .forEach((node, row) => {
        positioned.push({
          ...node,
          x: PAD + col * (NODE_W + COL_GAP),
          y: PAD + HEADER_H + row * (NODE_H + ROW_GAP),
          col,
          row
        });
      });
  });

  const byId = new Map(positioned.map((n) => [n.id, n]));

  const edges = [];
  positioned.forEach((node) => {
    (node.parent_ids || []).forEach((pid) => {
      const parent = byId.get(pid);
      if (parent) edges.push({ id: `${pid}->${node.id}`, from: parent, to: node });
    });
  });

  const maxRow = phases.reduce((m, p) => Math.max(m, nodes.filter((n) => (n.phase || 1) === p).length), 0);
  const width = PAD * 2 + phases.length * NODE_W + Math.max(0, phases.length - 1) * COL_GAP;
  const height = PAD * 2 + HEADER_H + maxRow * NODE_H + Math.max(0, maxRow - 1) * ROW_GAP;

  const columns = phases.map((phase, col) => ({ phase, x: PAD + col * (NODE_W + COL_GAP) }));

  return { nodes: positioned, edges, columns, width, height };
}

export function edgePath(from, to) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}