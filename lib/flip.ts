// 一覧のタイルと詳細のヒーロー写真をつなぐ共有要素アニメーション。
//
// **ビューポート座標で自前に計算する。Framer Motion の layoutId は使わない。**
// 理由はどちらもルート遷移に固有のもので、layoutRoot の付け方では直らない。
//
//   1. Framer の layout projection は要素の箱を「ページ座標」で測る
//      （motion-dom の measurePageBox＝ビューポート座標＋文書のスクロール量）。
//      一覧と詳細では文書のスクロール量が違う。一覧は復元された位置（例 440）、
//      詳細は先頭（0）。共有要素の開始位置はその差ぶんだけずれる。
//      実測では前進で +440px 下、戻りで -440px 上から始まっていた。
//      詳細のヒーローは position:sticky で常にビューポートの上端にいるので、
//      **ページ座標そのものが二つの画面で意味を持たない。**揃うのはビューポート座標だけ。
//   2. `.circle-tile` は overflow:hidden。タイル側の要素をいくら大きくしても
//      セルの外は描かれない。戻りは body 直下の要素で演じるほかない。
//
// 前進と戻りでやり方が違うのは、動かす相手が残っているかどうかが違うため。
//
//   前進  遷移先のヒーローが実体として残る。**本物のヒーローをタイルの位置から広げる。**
//         影武者を作らないので継ぎ目が生まれない。
//   戻り  詳細のDOMは即座に消える。消える前に**影武者（body直下の素のDOM）**を立てて、
//         一覧が描けたらタイルの位置まで縮める。
//
// どちらも幅と高さを動かす。transform の拡大では写真が伸びるが、
// 箱を動かして object-fit:cover に切り取らせれば歪まない。

/** 拡大・縮小にかける時間。詳細の中身が出る間（lib/motion.ts）はこれに合わせてある */
const DURATION = 380;
/** タイルの角丸。app/globals.css の .circle-tile と揃える */
const TILE_RADIUS = 16;
/** 控えたタイルの位置がこれより古ければ使わない（遷移が流れたとみなす） */
const STALE = 1200;
/** 戻りで一覧のタイルが現れるのを待つ上限 */
const WAIT_TILE = 700;
/** 影武者を消すときのフェード */
const FADE = 120;

type Rect = { left: number; top: number; width: number; height: number };

const rect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// cubic-bezier(0.16,1,0.3,1)。lib/design.ts の EASE と同じ曲線
const C1 = 0.16;
const C2 = 0.3;
function ease(t: number): number {
  // x(u) から u を二分法で求めて y(u) を返す。回数は固定で十分な精度が出る
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 18; i++) {
    u = (lo + hi) / 2;
    const x = 3 * (1 - u) * (1 - u) * u * C1 + 3 * (1 - u) * u * u * C2 + u * u * u;
    if (x < t) lo = u;
    else hi = u;
  }
  return 3 * (1 - u) * (1 - u) * u * 1 + 3 * (1 - u) * u * u * 1 + u * u * u;
}

/** 進行中の演出。遷移が重なったら前のものは畳む */
let running: (() => void) | null = null;

function stop() {
  const end = running;
  running = null;
  end?.();
  // 畳みきれなかった影武者が残っていたら、ここで必ず外す
  document.querySelectorAll("[data-flip-ghost]").forEach((n) => n.remove());
}

function tween(step: (p: number) => void, done: () => void): () => void {
  const t0 = performance.now();
  let id = requestAnimationFrame(function frame(now) {
    const p = Math.min(1, (now - t0) / DURATION);
    step(ease(p));
    if (p < 1) id = requestAnimationFrame(frame);
    else done();
  });
  return () => cancelAnimationFrame(id);
}

// --- 一覧側：押したタイルの位置を控える -----------------------------------

let remembered: { id: string; rect: Rect; at: number } | null = null;

/** 一覧でタイルを押したときに呼ぶ。写真の枠の位置をビューポート座標で控える */
export function rememberTile(id: string, cell: HTMLElement | null) {
  const media = cell?.querySelector<HTMLElement>("[data-shared-image]");
  remembered = media ? { id, rect: rect(media), at: performance.now() } : null;
}

function takeTile(id: string): Rect | null {
  const kept = remembered;
  remembered = null;
  if (!kept || kept.id !== id) return null;
  return performance.now() - kept.at > STALE ? null : kept.rect;
}

// --- 前進：本物のヒーローをタイルの位置から広げる -------------------------

/**
 * 詳細ページのヒーローが描かれた直後に呼ぶ（useLayoutEffect。**描く前に**位置を当てる）。
 * 一覧でタイルを押していなければ何もしない＝直リンクで開いたときは全画面のまま。
 *
 * @param photo ヒーローの写真の枠（position:absolute; inset:0）
 * @param stage 写真の枠を収めている 100dvh の器。ここを基準に座標を直す
 */
export function playHeroEnter(
  photo: HTMLElement | null,
  stage: HTMLElement | null,
  id: string,
  reduced: boolean
) {
  const from = takeTile(id);
  if (!photo || !stage || !from || reduced) return;

  stop();

  // タイルの位置はビューポート座標。器は中央カラムの中にあるので、器の左上へ直す
  const box = rect(stage);
  const x = from.left - box.left;
  const y = from.top - box.top;

  const paint = (p: number) => {
    photo.style.left = lerp(x, 0, p) + "px";
    photo.style.top = lerp(y, 0, p) + "px";
    photo.style.width = lerp(from.width, box.width, p) + "px";
    photo.style.height = lerp(from.height, box.height, p) + "px";
    photo.style.borderRadius = lerp(TILE_RADIUS, 0, p) + "px";
  };

  // inset:0 と競合しないよう right/bottom を降ろしてから始める
  photo.style.right = "auto";
  photo.style.bottom = "auto";
  paint(0);

  // React が書いた inset:0 を消してしまわないよう、空にせず 0 に戻す。
  // 素のDOM操作は React の差分の外なので、戻すのはこちらの責任
  const clear = () => {
    photo.style.inset = "0px";
    photo.style.width = "";
    photo.style.height = "";
    photo.style.borderRadius = "0px";
  };

  const cancel = tween(paint, () => {
    running = null;
    clear();
  });

  running = () => {
    cancel();
    clear();
  };
}

// --- 戻り：影武者を立ててタイルの位置まで縮める ---------------------------

/**
 * 詳細から一覧へ戻るときに、**遷移を始める前に**呼ぶ。
 * 画面に出ているヒーローをそのまま複製して body 直下に置き、
 * 一覧のタイルが現れたらそこまで縮めて消える。
 *
 * 一覧側のタイルは毎フレーム測り直す。スクロール位置の復元が
 * 1〜2フレーム遅れて効いても、着地点がずれない。
 *
 * @param stage ヒーローの器（写真・暗幕・団体名ごと複製する）
 */
export function playHeroExit(stage: HTMLElement | null, id: string, reduced: boolean) {
  if (!stage || reduced) return;

  stop();

  const from = rect(stage);
  const ghost = stage.cloneNode(true) as HTMLElement;
  ghost.setAttribute("data-flip-ghost", id);
  ghost.removeAttribute("data-hero-stage");
  // 見た目だけの複製。読み上げにもキー操作にも出さない
  ghost.setAttribute("aria-hidden", "true");
  ghost.querySelectorAll("[tabindex]").forEach((n) => n.removeAttribute("tabindex"));

  // CSSアニメーション（heroZoomIn など）は複製すると頭から流れ直して写真が跳ねる。
  // いま出ている見た目をそのまま止めて写す
  const origin = stage.querySelectorAll<HTMLElement>("*");
  const copy = ghost.querySelectorAll<HTMLElement>("*");
  origin.forEach((node, i) => {
    const clone = copy[i];
    if (!clone) return;
    const style = getComputedStyle(node);
    if (style.animationName !== "none") {
      clone.style.animation = "none";
      clone.style.transform = style.transform === "none" ? "" : style.transform;
    }
  });

  Object.assign(ghost.style, {
    position: "fixed",
    left: from.left + "px",
    top: from.top + "px",
    width: from.width + "px",
    height: from.height + "px",
    margin: "0",
    overflow: "hidden",
    borderRadius: "0px",
    zIndex: "999",
    pointerEvents: "none",
    transition: "none",
  });

  // 暗幕・団体名・戻る矢印は縮みながら消える。写真だけがタイルに着地する
  ghost.querySelectorAll<HTMLElement>("[data-hero-chrome]").forEach((node) => {
    node.style.transition = "opacity 140ms linear";
    node.style.opacity = "0";
  });

  document.body.appendChild(ghost);

  let cancelTween: (() => void) | null = null;
  let media: HTMLElement | null = null;
  const started = performance.now();

  const finish = () => {
    running = null;
    cancelTween?.();
    if (media) media.style.opacity = "";
    ghost.style.transition = `opacity ${FADE}ms ease-out`;
    ghost.style.opacity = "0";
    setTimeout(() => ghost.remove(), FADE + 60);
  };

  // 一覧が描かれるまで待つ。影武者が全画面を塞いでいるので待っている間も欠けない
  let waitId = requestAnimationFrame(function wait() {
    media = document.querySelector<HTMLElement>(
      `[data-org="${id}"] [data-shared-image]`
    );
    if (!media) {
      if (performance.now() - started > WAIT_TILE) finish();
      else waitId = requestAnimationFrame(wait);
      return;
    }

    // 本物は着地まで伏せておく。二重に見えないように
    media.style.opacity = "0";
    const target = media;

    cancelTween = tween(
      (p) => {
        const to = rect(target);
        ghost.style.left = lerp(from.left, to.left, p) + "px";
        ghost.style.top = lerp(from.top, to.top, p) + "px";
        ghost.style.width = lerp(from.width, to.width, p) + "px";
        ghost.style.height = lerp(from.height, to.height, p) + "px";
        ghost.style.borderRadius = lerp(0, TILE_RADIUS, p) + "px";
      },
      () => finish()
    );
  });

  running = () => {
    cancelAnimationFrame(waitId);
    finish();
  };
}
