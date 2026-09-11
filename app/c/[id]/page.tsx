import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Hero from "@/components/Hero";
import { allCircleIds, getCircle } from "@/lib/circles";
import { daysLabel, feeLabel, genderRatio, numLabel } from "@/lib/gender";
import { surveyedText } from "@/lib/labels";

export const dynamicParams = false;

export function generateStaticParams() {
  return allCircleIds().map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const circle = getCircle(id);
  if (!circle) return {};

  const ogFile = circle.photos[0] ?? circle.icon ?? null;
  const usesPhoto = circle.photos.length > 0;
  return {
    title: `${circle.short_name} | 京産大サークル名鑑`,
    description: circle.one_liner,
    openGraph: ogFile
      ? {
          images: [
            {
              url: `/photos/${ogFile}`,
              width: usesPhoto ? 1200 : 400,
              height: usesPhoto ? 800 : 400,
              alt: circle.short_name,
            },
          ],
        }
      : undefined,
  };
}

export default async function CirclePage(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const circle = getCircle(id);
  if (!circle) notFound();

  const facts = [
    ["区分", `${circle.division}・${circle.category}`],
    ["活動日", daysLabel(circle.active_days) ?? "未確認"],
    ["活動頻度", circle.frequency ?? "未確認"],
    ["活動場所", circle.place ?? "未確認"],
    ["掛け持ちの状況", circle.multi_club ?? "未確認"],
    ["参加の緩さ", circle.ease ?? "未確認"],
    ["先輩の呼び方", circle.senior_call ?? "未確認"],
    ["年会費", circle.annual_fee === null ? "未確認" : `${feeLabel(circle.annual_fee)}/年`],
    ["所属人数", circle.member_count === null ? "未確認" : `${numLabel(circle.member_count)}人`],
    [
      "初心者から始めた人数",
      circle.beginner_count === null ? "未確認" : `${numLabel(circle.beginner_count)}人`,
    ],
    ["男女比", genderRatio(circle.male_ratio) ?? "未確認"],
    ["いま入れるか", circle.recruiting ?? "未確認"],
  ];

  const contacts = [
    ["Instagram", circle.sns.instagram],
    ["X", circle.sns.x],
    ["公式サイト", circle.sns.website],
  ];

  return (
    <article className="detail-page">
      <Link className="back-link" href="/">
        ← 一覧に戻る
      </Link>

      <Hero circle={circle} />

      <header className="detail-heading">
        <p className="detail-genre">{circle.genre}</p>
        <h1 className="detail-title">{circle.short_name}</h1>
        {circle.name !== circle.short_name && <p className="detail-formal-name">{circle.name}</p>}
        <p className="detail-copy">{circle.one_liner || "キャッチコピー 未確認"}</p>
      </header>

      <section className="detail-section" aria-labelledby="facts-title">
        <h2 className="section-title" id="facts-title">
          事実サマリー
        </h2>
        <dl className="fact-list">
          {facts.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="detail-section" aria-labelledby="interview-title">
        <h2 className="section-title" id="interview-title">
          取材でわかったこと
        </h2>
        <p className="interview-copy">{circle.description || "紹介文 未確認"}</p>
      </section>

      <section className="detail-section" aria-labelledby="voice-title">
        <h2 className="section-title" id="voice-title">
          代表からの一言
        </h2>
        <blockquote className="leader-quote">
          <p>{circle.leader_comment?.text ?? "未確認"}</p>
          {circle.leader_comment && <footer>{circle.leader_comment.role}</footer>}
        </blockquote>
      </section>

      <section className="detail-section" aria-labelledby="contact-title">
        <h2 className="section-title" id="contact-title">
          連絡先・SNS
        </h2>
        <div className="contact-list">
          {contacts.map(([label, href]) =>
            href ? (
              <a
                className="contact-link"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                key={label}
              >
                {label}
              </a>
            ) : (
              <span className="contact-disabled" key={label}>
                {label} 未確認
              </span>
            )
          )}
        </div>
      </section>

      <p className="surveyed-at">{surveyedText(circle.surveyed_at)}</p>
    </article>
  );
}
