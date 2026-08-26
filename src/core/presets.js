import { smoothPath } from "./track-editor.js";

function ellipsePoints({ centerX, centerY, radiusX, radiusY, count = 44 }) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
      elevation: Math.max(0, Math.sin(angle * 2)) * 8,
    };
  });
}

export const TRACK_PRESETS = Object.freeze([
  {
    id: "oval",
    name: "Простой овал",
    kind: "example",
    width: 92,
    closed: true,
    points: ellipsePoints({
      centerX: 460,
      centerY: 310,
      radiusX: 310,
      radiusY: 190,
    }),
  },
  {
    id: "ridge-ring",
    name: "Кольцо с подъёмом",
    kind: "example",
    width: 78,
    closed: true,
    points: Array.from({ length: 52 }, (_, index) => {
      const angle = (index / 52) * Math.PI * 2;
      const ripple = 1 + Math.sin(angle * 3) * 0.13;
      return {
        x: 460 + Math.cos(angle) * 292 * ripple,
        y: 310 + Math.sin(angle) * 182 * ripple,
        elevation: 10 + Math.sin(angle - 0.7) * 10,
      };
    }),
  },
  {
    id: "technical-loop",
    name: "Техническая трасса",
    kind: "example",
    width: 76,
    closed: true,
    points: smoothPath(
      [
        { x: 170, y: 150, elevation: 0 },
        { x: 430, y: 110, elevation: 4 },
        { x: 700, y: 160, elevation: 8 },
        { x: 590, y: 270, elevation: 12 },
        { x: 720, y: 390, elevation: 10 },
        { x: 530, y: 520, elevation: 4 },
        { x: 330, y: 410, elevation: 0 },
        { x: 170, y: 520, elevation: 2 },
        { x: 110, y: 330, elevation: 0 },
      ],
      { closed: true, passes: 3 },
    ),
  },
]);
