export type TileShape = "square" | "wide" | "large";

/**
 * 団体IDだけからタイルの大きさを決める。
 * c001 の連番を3つに振り分けるため、再読込や絞り込みで大きさが変わらない。
 */
export function tileShapeForId(id: string): TileShape {
  const serial = /^c(\d+)$/.exec(id)?.[1];
  if (serial) {
    const remainder = Number(serial) % 3;
    if (remainder === 0) return "large";
    if (remainder === 2) return "wide";
    return "square";
  }

  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (["square", "wide", "large"] as const)[hash % 3];
}

/**
 * 一覧の並び順。運営が団体を序列化しないよう、シートの行順ではなくランダムに並べる。
 * 読み込みのたびに引き直し、絞り込みや詳細からの戻りでは同じ順を保つ。
 */
export function shuffledIds(ids: string[], random: () => number = Math.random): string[] {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
