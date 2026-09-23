import type { SVGProps } from "react";
import { Drum, Guitar, MicVocal, Piano } from "lucide-react";
import { groupInfo } from "./types";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// Lucide has no wind or bowed instruments; these follow its 24px stroke grid.
function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}
function Trumpet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 10.5v3" />
      <path d="M2.5 12H15" />
      <path d="M15 10.5 21 7v10l-6-3.5" />
      <path d="M6 12v2.5A1.5 1.5 0 0 0 7.5 16h5a1.5 1.5 0 0 0 1.5-1.5V12" />
      <path d="M8 12V8.5M10.5 12V8.5M13 12V8.5" />
    </Svg>
  );
}
function DoubleBass(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v14" />
      <circle cx="12" cy="2" r="1" />
      <path d="M12 8.5c-3.3 0-4.5 1.5-4.5 3.2s1.7 2.2 1.7 3.3-2.7 1.8-2.7 4c0 2 2.5 3 5.5 3s5.5-1 5.5-3c0-2.2-2.7-2.9-2.7-4s1.7-1.6 1.7-3.3-1.2-3.2-4.5-3.2z" />
      <path d="M10.3 18.4h3.4" />
      <path d="M12 22v1.5" />
    </Svg>
  );
}
// A violin with its bow; the bow is what sets it apart from the bass.
function Violin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 3v12.5" />
      <circle cx="9.5" cy="2.2" r="1" />
      <path d="M9.5 8C6.6 8 5.6 9.4 5.6 10.9s1.7 2 1.7 3.1-2.7 1.8-2.7 4.6c0 2.7 2.4 3.9 4.9 3.9s4.9-1.2 4.9-3.9c0-2.8-2.7-3.5-2.7-4.6s1.7-1.6 1.7-3.1S12.4 8 9.5 8z" />
      <path d="M8 18.4h3" />
      <path d="M19 2.5v19" />
      <path d="M19 2.5l1.8 1.4" />
      <path d="M19 19.5h1.6" />
    </Svg>
  );
}

const icons: Record<string, (props: IconProps) => React.ReactNode> = {
  Piano: (props) => <Piano {...props} />,
  Winds: Trumpet,
  Guitar: (props) => <Guitar {...props} />,
  Bass: DoubleBass,
  Drums: (props) => <Drum {...props} />,
  Vocals: (props) => <MicVocal {...props} />,
  Strings: Violin,
};

export default function InstrumentIcon({
  group,
  size = 16,
  className,
}: {
  group: string;
  size?: number;
  className?: string;
}) {
  const info = groupInfo(group);
  const Icon = icons[info.id];
  return (
    <span
      className={`instrument-icon ${className ?? ""}`}
      style={{ color: info.color }}
      aria-hidden="true"
    >
      {Icon ? (
        <Icon size={size} />
      ) : (
        <i
          className="color-dot"
          style={{ background: info.color, width: size / 2, height: size / 2 }}
        />
      )}
    </span>
  );
}
