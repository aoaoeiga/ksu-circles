// 一覧のカードを押すと、その写真が拡大して全画面になる（要件定義 §6-2 / docs/ui/02-ui-spec.md §5-1）。
//
// design/ksu-circles-v3.dc.html の openDetail() の移植だが、**継ぎ目の処理だけ作り直してある。**
//
// 移植元は画面をstateで切り替えていたので「拡大が終わった瞬間に詳細が描けている」ことが
// 保証されていた。こちらは実際のルート遷移なので、その保証がない。
// そのため次の3つを守る。
//
//   1. ゴーストはタイマーで消さない。遷移先のヒーローが「写真まで出た」と言ってきたら消す
//      （dismissZoomGhost）。それまで画面はゴーストで塞がったまま
//   2. 一覧を隠したら、ゴーストを消すときまで戻さない。途中で戻すと一覧が再び見える
//   3. ゴーストの終点を、遷移先ヒーローの初期状態に合わせる
//      （中央カラムの幅・100dvh・同じ明るさ・同じ暗幕）
//
// ゴーストは body 直下に置く素のDOMで、React の管理外。だから遷移をまたいでも消えない。

import type { useRouter } from "next/navigation";

type Router = ReturnType<typeof useRouter>;

/** 拡大にかける時間。移植元と同じ */
const DURATION = 900;
/** 遷移先が出てからゴーストを消すまで。中身が一致していれば見えない */
const FADE = 160;
/** 遷移先から合図が来なくても、ここまでで必ず消す（画面が塞がったままにしない） */
const SAFETY = 5000;

/** ヒーローに重なっている暗幕。Hero.tsx と同じ値 */
const VEIL =
  "linear-gradient(to top, rgba(27,26,24,.86) 0%, rgba(27,26,24,.34) 42%, rgba(27,26,24,.06) 68%, rgba(27,26,24,.22) 100%)";

let hiddenHost: HTMLElement | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | undefined;
let tween: ReturnType<typeof setInterval> | undefined;

function removeGhosts() {
  document.querySelectorAll("body > [data-ghost]").forEach((n) => n.remove());
}

function restoreHost() {
  if (!hiddenHost) return;
  hiddenHost.style.opacity = "";
  hiddenHost.style.transition = "";
  hiddenHost = null;
}

/**
 * 遷移先のヒーローから呼ぶ。**描画されて写真が出たあとにだけ呼ぶこと。**
 * ここで初めてゴーストを外す。写真が無い団体は、ジャンル色が出た時点で呼ぶ。
 */
export function dismissZoomGhost() {
  clearTimeout(safetyTimer);
  clearInterval(tween);

  const ghosts = Array.from(
    document.querySelectorAll("body > [data-ghost]")
  ) as HTMLElement[];

  if (ghosts.length === 0) {
    restoreHost();
    return;
  }

  ghosts.forEach((g) => {
    g.style.transition = `opacity ${FADE}ms ease-out`;
    g.style.opacity = "0";
  });

  setTimeout(() => {
    removeGhosts();
    restoreHost();
  }, FADE + 60);
}

export function openDetailZoom(
  card: HTMLElement | null,
  href: string,
  router: Router,
  reduced: boolean
) {
  clearTimeout(safetyTimer);
  clearInterval(tween);
  removeGhosts();
  restoreHost();

  // 押した時点で遷移先を取りに行く。拡大の900msぶんを先読みに使えるので、
  // 拡大が終わったときには描画がほぼ済んでいる。
  // （カードは Link ではなく onClick なので、Next の自動プリフェッチが効かない）
  router.prefetch(href);

  const src = card ? (card.querySelector("[data-photo]") as HTMLElement | null) : null;

  // prefers-reduced-motion では演出しない（要件定義 §7）
  if (reduced || !src) {
    router.push(href);
    return;
  }

  const r = src.getBoundingClientRect();

  // 終点は「ビューポート全体」ではなく**中央カラム**。
  // PCでは本文が max-width 960px に収まっているので、
  // ビューポート幅まで広げると遷移先のヒーローより横にはみ出す。
  const host = card ? (card.closest("[data-screen]") as HTMLElement | null) : null;
  const column = host?.parentElement ?? null;
  const colRect = column ? column.getBoundingClientRect() : null;
  const toLeft = colRect ? colRect.left : 0;
  const toWidth = colRect ? colRect.width : document.documentElement.clientWidth;
  const toHeight = window.innerHeight;

  const ghost = src.cloneNode(true) as HTMLElement;
  ghost.setAttribute("data-ghost", "1");
  ghost.removeAttribute("data-photo");
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  Object.assign(ghost.style, {
    position: "fixed",
    left: r.left + "px",
    top: r.top + "px",
    width: r.width + "px",
    height: r.height + "px",
    margin: "0",
    borderRadius: "16px",
    zIndex: "999",
    pointerEvents: "none",
    transition: "none",
    // 一覧のタイルと同じ明るさから始める（移植元は 1 に飛ばしていた）
    filter: "brightness(0.86) saturate(0.96)",
    opacity: "1",
  });

  // 遷移先の暗幕を薄く重ねておき、拡大に合わせて濃くする。
  // 着地した瞬間にヒーローの暗幕と同じ濃さになるので、切り替わりが見えない
  const veil = document.createElement("div");
  Object.assign(veil.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    background: VEIL,
    opacity: "0",
  });
  ghost.appendChild(veil);

  document.body.appendChild(ghost);

  if (host) {
    host.style.transition = "opacity 120ms ease-out";
    host.style.opacity = "0";
    hiddenHost = host;
  }

  const t0 = Date.now();
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);

  tween = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / DURATION);
    const k = ease(p);
    ghost.style.left = r.left + (toLeft - r.left) * k + "px";
    ghost.style.top = r.top * (1 - k) + "px";
    ghost.style.width = r.width + (toWidth - r.width) * k + "px";
    ghost.style.height = r.height + (toHeight - r.height) * k + "px";
    ghost.style.borderRadius = 16 * (1 - k) + "px";
    // 0.86（タイル） → 0.94（ヒーロー）
    ghost.style.filter = `brightness(${(0.86 + 0.08 * k).toFixed(3)}) saturate(${(0.96 + 0.04 * k).toFixed(3)})`;
    veil.style.opacity = String(k);
    if (p >= 1) clearInterval(tween);
  }, 16);

  // 拡大が終わったところで遷移する。**ここではゴーストを消さない。**
  // 消すのは遷移先の Hero が dismissZoomGhost() を呼んだとき
  setTimeout(() => router.push(href), DURATION);

  safetyTimer = setTimeout(dismissZoomGhost, SAFETY);
}
