import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allCircleIds, getCircle } from "@/lib/circles";
import { feeLabel, genderRatio, numLabel } from "@/lib/gender";
import { recruitingLabel, surveyedText } from "@/lib/labels";
import Hero from "@/components/Hero";
import DayCard, { DayCardStatic } from "@/components/DayCard";
import ReviewNotice from "@/components/ReviewNotice";

export const dynamicParams = false;

export function generateStaticParams() {
  return allCircleIds().map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const circle = getCircle(id);
  if (!circle) return {};
  return {
    title: `${circle.short_name} | 京産大サークル名鑑`,
    description: circle.one_liner,
    ...(circle.listed
      ? {}
      : { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } }),
    ...(circle.og_image
      ? {
          openGraph: {
            images: [{
              url: circle.og_image.src,
              width: circle.og_image.width,
              height: circle.og_image.height,
              alt: circle.short_name,
            }],
          },
        }
      : {}),
  };
}

export default async function CirclePage(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const circle = getCircle(id);
  if (!circle) notFound();

  const gender = genderRatio(circle.male_ratio) ?? "—";
  const numbers = [
    { label: "年会費", value: feeLabel(circle.annual_fee) },
    { label: "所属人数", value: numLabel(circle.member_count) },
    { label: "初心者から始めた人", value: numLabel(circle.beginner_count) },
    { label: "男 : 女", value: gender },
  ];
  const recruiting = recruitingLabel(circle);
  const sns: { label: string; href: string | null }[] = [
    { label: "Instagram", href: circle.sns.instagram },
    { label: "X", href: circle.sns.x },
    { label: "公式サイト", href: circle.sns.website },
  ];

  return (
    <main className="detail-page">
      {!circle.listed && <ReviewNotice />}
      <Hero circle={circle} />

      <article className="detail-content">
        <div className="detail-intro">
          <p className="detail-intro__label">ひとことで言うと</p>
          <p className="detail-intro__lead">{circle.one_liner}</p>
        </div>

        <DetailSection title="この団体について">
          <p className="detail-prose">{circle.description.replace(/\n+/g, "")}</p>
        </DetailSection>

        <DetailSection title="活動について">
          <Suspense fallback={<DayCardStatic circle={circle} />}>
            <DayCard circle={circle} />
          </Suspense>
        </DetailSection>

        <DetailSection title="数字で見る">
          <div className="number-grid">
            {numbers.map((item) => (
              <div className="number-card" key={item.label}>
                <div className={`number-card__value ${item.value === "—" ? "is-empty" : ""}`}>{item.value}</div>
                <div className="number-card__label">{item.label}</div>
              </div>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="代表からの一言">
          <figure className="voice-card">
            <blockquote>{circle.leader_comment?.text ?? "代表からの一言 未確認"}</blockquote>
            {circle.leader_comment && <figcaption>{circle.leader_comment.role}</figcaption>}
          </figure>
        </DetailSection>

        <DetailSection title="参加・問い合わせ">
          <div className="join-card">
            <div>
              <span>いま入れるか</span>
              <strong>{recruiting}</strong>
            </div>
            <p>最新の活動予定や参加方法は、各団体の公式SNS・サイトで確認してください。</p>
            <div className="sns-links">
              {sns.map((item) =>
                item.href ? (
                  <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}<span aria-hidden="true"> ↗</span>
                  </a>
                ) : (
                  <span key={item.label} aria-label={`${item.label} 未登録`}>{item.label}<small>未登録</small></span>
                )
              )}
            </div>
          </div>
        </DetailSection>
      </article>

      <footer className="detail-footer">
        <p>掲載内容は運営が団体に聞き取って作成し、公開前に団体へ確認しています。</p>
        <p>{surveyedText(circle.surveyed_at)}</p>
        <p>京産大サークル名鑑 2026</p>
      </footer>
    </main>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
