// 団体ページ（S-02）。design/ksu-circles-v3.dc.html の `isDetail` ブロックの移植。
//
// 完全な静的生成。generateStaticParams で公開対象の全IDを返し、
// dynamicParams = false で列挙外のIDを404にする（docs/14-nextjs-notes.md §8 / deploy-spec §2）。
//
// ヒーローと活動日カードだけが client（写真の切り替えと、URLからの曜日一致）。
// それ以外はサーバーで描いてHTMLに焼く。

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allCircleIds, getCircle } from "@/lib/circles";
import { feeLabel, genderRatio, numLabel } from "@/lib/gender";
import {
  CARD,
  DARK,
  EYEBROW,
  INK,
  INK_MID,
  RULE,
  SECTION_TITLE,
  SHADOW,
  WHITE,
  num,
  photoSrc,
} from "@/lib/design";
import { recruitingLabel, surveyedText } from "@/lib/labels";
import Hero from "@/components/Hero";
import DetailReveal from "@/components/DetailReveal";
import DayCard, { DayCardStatic } from "@/components/DayCard";

export const dynamicParams = false;

export function generateStaticParams() {
  return allCircleIds().map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const c = getCircle(id);
  if (!c) return {};
  const ogFile = c.photos[0] ?? c.icon ?? null;
  const ogUsesPhoto = c.photos.length > 0;
  return {
    title: `${c.short_name} | 京産大サークル名鑑`,
    description: c.one_liner,
    openGraph: ogFile
      ? {
          images: [
            {
              url: photoSrc(ogFile),
              width: ogUsesPhoto ? 1200 : 400,
              height: ogUsesPhoto ? 800 : 400,
              alt: c.short_name,
            },
          ],
        }
      : undefined,
  };
}

export default async function CirclePage(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const c = getCircle(id);
  if (!c) notFound();

  const gender = genderRatio(c.male_ratio) ?? "—";
  const bigNum = num(28);
  const dash = num(28, INK_MID);
  const wordNum = {
    fontFamily: "'Noto Sans JP',sans-serif",
    fontWeight: 500,
    fontSize: 16,
    color: INK,
  };
  const isWord = gender === "女子のみ" || gender === "男子のみ";

  // 数字カードは4枚・2×2のまま。中の未確認は `—`（カードごと消さない）
  const numbers = [
    {
      label: "年会費",
      value: feeLabel(c.annual_fee),
      style: c.annual_fee === null ? dash : bigNum,
    },
    {
      label: "所属人数",
      value: numLabel(c.member_count),
      style: c.member_count === null ? dash : bigNum,
    },
    {
      label: "初心者出身",
      value: numLabel(c.beginner_count),
      style: c.beginner_count === null ? dash : bigNum,
    },
    {
      label: "男 : 女",
      value: gender,
      style: isWord ? wordNum : gender === "—" ? dash : bigNum,
    },
  ];

  const recruiting = recruitingLabel(c);
  const pill = {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    height: 24,
    padding: "0 12px",
    borderRadius: 999,
    fontSize: 11,
    width: "max-content" as const,
  };
  const badgeStyle =
    recruiting === "いつでも入れる"
      ? { ...pill, background: INK, color: WHITE }
      : recruiting === "4月のみ"
        ? { ...pill, color: INK, boxShadow: "inset 0 0 0 1px " + INK }
        : { ...pill, color: INK_MID, boxShadow: "inset 0 0 0 1px " + INK_MID };

  const snsBtn = {
    flex: 1,
    height: 46,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    fontSize: 13,
    color: INK,
    background: WHITE,
    borderRadius: 999,
    boxShadow: SHADOW,
  };
  const snsOff = {
    ...snsBtn,
    color: INK_MID,
    cursor: "default" as const,
    boxShadow: "inset 0 0 0 1px " + RULE,
    background: "transparent",
  };
  const sns: { label: string; href: string | null }[] = [
    { label: "Instagram", href: c.sns.instagram },
    { label: "X", href: c.sns.x },
    { label: "公式サイト", href: c.sns.website },
  ];

  const aboutCard = { ...CARD, marginTop: 16, display: "flex", flexDirection: "column" as const, gap: 12 };

  return (
    <div style={{ position: "relative" }}>
      <Hero circle={c} />

      <DetailReveal>
        <div
        style={{
          position: "relative",
          zIndex: 5,
          background: "#EFEFEB",
          borderRadius: "16px 16px 0 0",
          padding: "0 0 40px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: RULE }} />
        </div>

        <div style={{ padding: "22px 20px 0" }}>
          <div
            style={{
              fontFamily: "'Zen Kaku Gothic New',sans-serif",
              fontWeight: 700,
              fontSize: 20,
              lineHeight: 1.6,
              letterSpacing: "-0.02em",
              color: INK,
              textWrap: "pretty",
            }}
          >
            {c.one_liner}
          </div>

          <Suspense fallback={<DayCardStatic circle={c} />}>
            <DayCard circle={c} />
          </Suspense>
        </div>

        <Section eyebrow="数字で見る" title="NUMBERS">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 16,
            }}
          >
            {numbers.map((n) => (
              <div key={n.label} style={CARD}>
                <div style={n.style}>{n.value}</div>
                <div style={{ ...EYEBROW, marginTop: 10 }}>{n.label}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="この団体について" title="ABOUT">
          <div style={aboutCard}>
            {c.description.split("\n").map((t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 15,
                  lineHeight: 1.85,
                  letterSpacing: "0.02em",
                  color: INK,
                  textWrap: "pretty",
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </Section>

        {/* 署名は leader_comment.role から読む。個人名は入れない（CLAUDE.md §7） */}
        <Section eyebrow="代表からの一言" title="VOICE">
          <div style={aboutCard}>
            <div
              style={{
                borderLeft: "2px solid " + INK,
                paddingLeft: 14,
                fontSize: 15,
                lineHeight: 1.85,
                letterSpacing: "0.02em",
                color: INK,
                textWrap: "pretty",
              }}
            >
              {c.leader_comment ? c.leader_comment.text : "代表からの一言 未確認"}
            </div>
            {c.leader_comment && (
              <div style={{ fontSize: 12, color: INK_MID, textAlign: "right" }}>
                {c.leader_comment.role}
              </div>
            )}
          </div>
        </Section>

        <Section eyebrow="いま入れるか" title="JOIN">
          <div style={{ marginTop: 16 }}>
            <div style={badgeStyle}>{recruiting}</div>
          </div>
        </Section>

        <div style={{ display: "flex", gap: 8, padding: "24px 20px 0", flexWrap: "wrap" }}>
          {sns.map((s) =>
            s.href ? (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...snsBtn, textDecoration: "none" }}
              >
                {s.label}
              </a>
            ) : (
              <div key={s.label} style={snsOff}>
                {s.label}
              </div>
            )
          )}
        </div>
        </div>

        <div
        style={{
          position: "relative",
          zIndex: 5,
          background: DARK,
          padding: "40px 20px 44px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.85,
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,.78)",
            textWrap: "pretty",
          }}
        >
          掲載内容は運営が団体に聞き取って作成し、公開前に団体へ確認しています。
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>
          {surveyedText(c.surveyed_at)}
        </div>
        <a
          href="#"
          style={{
            fontSize: 12,
            color: "#FFFFFF",
            textDecoration: "underline",
            width: "max-content",
          }}
        >
          情報の修正・取り下げはこちら
        </a>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>京産大サークル名鑑 2026</div>
        </div>
      </DetailReveal>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "40px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 9, height: 9, borderRadius: 5, border: "1px solid " + INK_MID }} />
        <div style={EYEBROW}>{eyebrow}</div>
      </div>
      <div style={SECTION_TITLE}>{title}</div>
      {children}
    </div>
  );
}
