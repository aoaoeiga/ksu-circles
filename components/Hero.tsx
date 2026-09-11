"use client";

import { useRef, useState } from "react";
import CircleAvatar from "@/components/CircleAvatar";
import type { Circle } from "@/types/circle";

export default function Hero({ circle }: { circle: Circle }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<string, true>>({});
  const photos = circle.photos.slice(0, 3);
  const files = photos.length > 0 ? photos : circle.icon ? [circle.icon] : [];
  const isIconOnly = photos.length === 0 && files.length === 1;

  const updateActive = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth });
    setActive(index);
  };

  return (
    <div className="hero-gallery" aria-label={`${circle.short_name}の写真`}>
      <div className="hero-track" ref={trackRef} onScroll={updateActive}>
        {files.length > 0 ? (
          files.map((file, index) => (
            <div className="hero-slide" key={file}>
              {!broken[file] ? (
                // public/photosの変換済みWebP。失敗時は同じ領域で頭文字へ戻す。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={`hero-image${isIconOnly ? " hero-image--icon" : ""}`}
                  src={`/photos/${file}`}
                  alt={`${circle.short_name}の写真 ${index + 1}`}
                  width={isIconOnly ? 400 : 1200}
                  height={isIconOnly ? 400 : 800}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : undefined}
                  onError={() => setBroken((current) => ({ ...current, [file]: true }))}
                />
              ) : (
                <CircleAvatar circle={circle} size={96} />
              )}
            </div>
          ))
        ) : (
          <div className="hero-slide">
            <CircleAvatar circle={circle} size={96} />
          </div>
        )}
      </div>

      {files.length > 1 && (
        <div className="hero-dots" aria-label="写真を選ぶ">
          {files.map((file, index) => (
            <button
              className="dot-button"
              type="button"
              aria-label={`${index + 1}枚目を表示`}
              aria-current={active === index}
              onClick={() => goTo(index)}
              key={file}
            />
          ))}
        </div>
      )}
    </div>
  );
}
