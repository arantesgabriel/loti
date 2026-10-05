import Image from "next/image";
import type { CSSProperties } from "react";

type SceneState = "idle" | "email" | "password" | "submitting";
type OrbitItem = { asset?: string; angle: number; tone?: string; compact?: boolean };
const layers: { name: string; seconds: number; reverse?: boolean; items: OrbitItem[] }[] = [
  { name: "inner", seconds: 44, items: [
    { asset: "bookmark", angle: -145, tone: "peach", compact: true },
    { angle: -55 }, { angle: 45 }, { angle: 165 },
  ] },
  { name: "middle", seconds: 72, reverse: true, items: [
    { asset: "sneaker", angle: -110, tone: "lilac", compact: true },
    { asset: "headphones", angle: -8, tone: "sage", compact: true },
    { asset: "tshirt", angle: 52, tone: "blue" },
    { asset: "smartphone", angle: 160, tone: "blue" },
  ] },
  { name: "outer", seconds: 108, items: [
    { asset: "package", angle: -65, tone: "butter" },
    { asset: "avatar-2", angle: -28, compact: true },
    { asset: "avatar-3", angle: 68 },
    { asset: "bag", angle: 108, tone: "peach" },
    { asset: "avatar-4", angle: 143 },
    { asset: "avatar-1", angle: 198, compact: true },
  ] },
];

export function OrbitalScene({ state }: { state: SceneState }) {
  return <div className="orbital-scene" data-state={state} data-testid="orbital-scene" aria-hidden="true">
    <div className="orbital-composition">
      <div className="orbital-halo" />
      <div className="orbital-center">
        <Image src="/login-visuals/loti-box.svg" width={240} height={260} alt="" priority />
      </div>
      <div className="orbital-field">
        {layers.map(layer => <div className={`orbit-layer orbit-${layer.name}`} key={layer.name}
          style={{ "--period": `${layer.seconds}s`, "--direction": layer.reverse ? "reverse" : "normal" } as CSSProperties}>
          <div className="orbit-ring" />
          {layer.items.map((item, index) => {
            const avatar = item.asset?.startsWith("avatar");
            return <div key={item.asset ?? index} className={`orbit-track${item.compact ? " orbit-compact" : ""}`}
              style={{ "--angle": `${item.angle}deg`, "--float-period": `${6.5 + index * 1.3}s`, "--float-delay": `${-index * 1.7}s` } as CSSProperties}>
              <div className="orbit-anchor"><div className="orbit-upright">
                <div className={`orbit-object ${avatar ? "orbit-avatar" : item.asset ? "orbit-product" : "orbit-particle"} ${item.tone ? `orbit-${item.tone}` : ""}`}>
                  {item.asset && <Image src={`/login-visuals/${item.asset}.svg`} width={avatar ? 124 : 240} height={avatar ? 124 : 200} alt="" loading="eager" />}
                </div>
              </div></div>
            </div>;
          })}
        </div>)}
      </div>
    </div>
  </div>;
}
