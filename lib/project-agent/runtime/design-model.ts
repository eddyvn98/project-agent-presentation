/** Deterministic, bounded concept-design input. Coordinates are millimetres, origin at the southwest corner. */
export interface DesignRoom { width: number; depth: number; height: number; wallThickness: number }
export interface DesignOpening { wall: "north" | "south" | "east" | "west"; offset: number; width: number; height: number; kind: "door" | "window"; sill: number }
export interface DesignFurniture { kind: "table" | "chair" | "sofa" | "cabinet" | "bed" | "desk" | "partition"; x: number; y: number; width: number; depth: number; height: number; rotation: 0 | 90 | 180 | 270; label: string }
export interface DesignSpec { title: string; units: "mm"; room: DesignRoom; openings: DesignOpening[]; furniture: DesignFurniture[] }
export type DesignParse = { spec: DesignSpec } | { error: string };

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const title = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 80).replace(/[\x00-\x1f]/g, " ") : fallback;

/** No user-supplied paths, scripts, geometry arrays, URLs or arbitrary materials are accepted. */
export function parseDesignSpec(raw: unknown): DesignParse {
  const data = object(raw);
  const roomRaw = object(data?.room);
  if (!data || !roomRaw || (data.units !== undefined && data.units !== "mm"))
    return { error: "design.model requires room and units=mm" };
  const width = number(roomRaw.width, 2400, 30000);
  const depth = number(roomRaw.depth, 2400, 30000);
  const height = number(roomRaw.height, 2100, 6500);
  const wallThickness = number(roomRaw.wallThickness ?? 150, 70, 400);
  if (width === null || depth === null || height === null || wallThickness === null)
    return { error: "Room width/depth must be 2400-30000 mm, height 2100-6500 mm, walls 70-400 mm" };
  const room: DesignRoom = { width, depth, height, wallThickness };
  const openingsRaw = data.openings ?? [];
  if (!Array.isArray(openingsRaw) || openingsRaw.length > 12)
    return { error: "A room may have at most 12 openings" };
  const openings: DesignOpening[] = [];
  for (const entry of openingsRaw) {
    const item = object(entry);
    const wall = item?.wall;
    const kind = item?.kind;
    if (!["north", "south", "east", "west"].includes(String(wall)) || !["door", "window"].includes(String(kind)))
      return { error: "Each opening needs wall=north|south|east|west and kind=door|window" };
    const limit = wall === "north" || wall === "south" ? width : depth;
    const offset = number(item?.offset, 0, limit);
    const span = number(item?.width, 500, 4000);
    const oh = number(item?.height, 500, height);
    const sill = number(item?.sill ?? (kind === "door" ? 0 : 900), 0, height);
    if (offset === null || span === null || oh === null || sill === null ||
      offset + span > limit || sill + oh > height || (kind === "door" && sill !== 0))
      return { error: "Opening does not fit its wall or has invalid dimensions" };
    if (openings.some(o => o.wall === wall && offset < o.offset + o.width && o.offset < offset + span))
      return { error: "Openings on the same wall must not overlap" };
    openings.push({ wall: wall as DesignOpening["wall"], kind: kind as DesignOpening["kind"], offset, width: span, height: oh, sill });
  }
  const itemsRaw = data.furniture ?? [];
  if (!Array.isArray(itemsRaw) || itemsRaw.length > 64)
    return { error: "A room may have at most 64 furniture elements" };
  const furniture: DesignFurniture[] = [];
  for (const entry of itemsRaw) {
    const item = object(entry);
    if (!item || !["table", "chair", "sofa", "cabinet", "bed", "desk", "partition"].includes(String(item.kind)))
      return { error: "Unknown furniture kind" };
    const x = number(item.x, 0, width), y = number(item.y, 0, depth);
    const fw = number(item.width, 100, 6500), fd = number(item.depth, 100, 6500);
    const fh = number(item.height, 100, height);
    const rotation = item.rotation ?? 0;
    if (x === null || y === null || fw === null || fd === null || fh === null ||
      ![0, 90, 180, 270].includes(Number(rotation)) || typeof rotation !== "number")
      return { error: "Furniture needs finite dimensions and rotation 0|90|180|270" };
    const bw = rotation === 90 || rotation === 270 ? fd : fw;
    const bd = rotation === 90 || rotation === 270 ? fw : fd;
    if (x - bw / 2 < wallThickness || x + bw / 2 > width - wallThickness ||
      y - bd / 2 < wallThickness || y + bd / 2 > depth - wallThickness)
      return { error: "Furniture must fit inside the room's inner wall faces" };
    furniture.push({ kind: item.kind as DesignFurniture["kind"], x, y, width: fw, depth: fd,
      height: fh, rotation: rotation as DesignFurniture["rotation"], label: title(item.label, String(item.kind)) });
  }
  return { spec: { title: title(data.title, "Interior concept"), units: "mm", room, openings, furniture } };
}
