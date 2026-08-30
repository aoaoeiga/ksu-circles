// 一覧のカードを押すと、その写真が拡大して全画面になる（要件定義 §6-2 / docs/ui/02-ui-spec.md §5-1）。
//
// design/ksu-circles-v3.dc.html の openDetail() の移植。
// 押した写真を body 直下に複製して、900ms かけて画面いっぱいまで育て、
// 着地したところで団体ページへ移動する。移植元と同じ時間・同じイージング。
//
// 移植元は画面をstateで切り替えていたが、こちらは実際のルート遷移になる。
// 複製した要素は React の管理外なので、遷移をまたいでも消えずに残る。

import type { useRouter } from "next/navigation";

type Router = ReturnType<typeof useRouter>;

const DURATION = 900;

function clearGhosts() {
  document.querySelectorAll("body > [data-ghost]").forEach((n) => n.remove());
}

export function openDetailZoom(
  card: HTMLElement | null,
  href: string,
  router: Router,
  reduced: boolean
) {
  clearGhosts();

  // prefers-reduced-motion では演出しない（要件定義 §7）
  const src = card ? (card.querySelector("[data-photo]") as HTMLElement | null) : null;
  if (reduced || !src) {
    router.push(href);
    return;
  }

  const r = src.getBoundingClientRect();
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
    filter: "brightness(1)",
    opacity: "1",
  });
  document.body.appendChild(ghost);

  const host = card ? card.closest("[data-screen]") : null;
  if (host instanceof HTMLElement) {
    host.style.transition = "opacity 120ms ease-out";
    host.style.opacity = "0";
  }

  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const t0 = Date.now();
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);

  const tween = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / DURATION);
    const k = ease(p);
    ghost.style.left = r.left * (1 - k) + "px";
    ghost.style.top = r.top * (1 - k) + "px";
    ghost.style.width = r.width + (vw - r.width) * k + "px";
    ghost.style.height = r.height + (vh - r.height) * k + "px";
    ghost.style.borderRadius = 16 * (1 - k) + "px";
    if (p >= 1) clearInterval(tween);
  }, 16);

  // 後片付けはタイマーだけで進める。移植元と同じ組み立て
  setTimeout(() => {
    router.push(href);
    if (host instanceof HTMLElement) {
      host.style.opacity = "";
      host.style.transition = "";
    }
    clearInterval(tween);
    const f0 = Date.now();
    const fade = setInterval(() => {
      const q = Math.min(1, (Date.now() - f0) / 160);
      ghost.style.opacity = String(1 - q);
      if (q >= 1) clearInterval(fade);
    }, 16);
    setTimeout(() => {
      clearInterval(fade);
      clearGhosts();
    }, 220);
  }, DURATION);

  setTimeout(clearGhosts, 2600);
}
