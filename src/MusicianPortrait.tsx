import { useState } from "react";
import { AudioLines } from "lucide-react";
import { groupInfo } from "./types";
import type { GraphMusician } from "./types";

export default function MusicianPortrait({
  musician,
}: {
  musician: GraphMusician;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="musician-portrait">
      <div
        className="musician-avatar"
        style={{ color: groupInfo(musician.group).color }}
      >
        <span aria-hidden="true">
          {musician.name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </span>
        {!failed && (
          <img
            src={`https://bizimcaz.com/content/musicians/profile/${encodeURIComponent(musician.key)}_p.webp`}
            alt={`${musician.name} portresi`}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        )}
        {failed && <AudioLines size={18} aria-hidden="true" />}
      </div>
      <a
        className="portrait-source"
        href={`https://bizimcaz.com/musician/${encodeURIComponent(musician.key)}`}
        target="_blank"
        rel="noreferrer"
      >
        Bizim Caz{" "}
        <span className="sr-only">{musician.name} profili (yeni sekme)</span>
      </a>
    </div>
  );
}
