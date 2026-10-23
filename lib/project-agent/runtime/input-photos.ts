import fs from "node:fs/promises";
import path from "node:path";
import type { DifyChatFile } from "../dify-input-files";
import { uploadRuntimeImage } from "./model";
import { execInSandbox, resolveWorkspacePath, workspaceDir } from "./sandbox";

const PHOTO_NAME = /\.(jpe?g|png|webp|gif)$/i;
export const PHOTOS_PER_SHEET = 6;
export const MAX_PHOTO_SHEETS = 3;

const SHEET_SCRIPT = `import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps
out = sys.argv[1]
items = [arg.split("||", 1) for arg in sys.argv[2:]]
cols, cell_w, cell_h = 3, 520, 700
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "#e5e7eb")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.load_default(size=26)
except TypeError:
    font = ImageFont.load_default()
for index, (label, path) in enumerate(items):
    x, y = (index % cols) * cell_w, (index // cols) * cell_h
    try:
        photo = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    except Exception:
        continue
    photo.thumbnail((cell_w - 12, cell_h - 12))
    sheet.paste(photo, (x + 6 + (cell_w - 12 - photo.width) // 2, y + 6))
    draw.rectangle((x + 6, y + 6, x + 6 + 14 * len(label) + 20, y + 42), fill="#111827")
    draw.text((x + 14, y + 10), label, fill="#ffffff", font=font)
sheet.save(out, "JPEG", quality=84)
`;

export interface PhotoSheetPlan { sheets: { label: string; name: string }[][]; skipped: string[]; }

/** Splits the staged photos into numbered contact sheets; the numbers match the order named in the note. */
export function planPhotoSheets(staged: string[]): PhotoSheetPlan {
	const photos = staged.filter((name) => PHOTO_NAME.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	const limit = PHOTOS_PER_SHEET * MAX_PHOTO_SHEETS;
	const sheets: PhotoSheetPlan["sheets"] = [];
	photos.slice(0, limit).forEach((name, index) => {
		if (index % PHOTOS_PER_SHEET === 0) sheets.push([]);
		sheets[sheets.length - 1].push({ label: `${index + 1}. ${name}`, name });
	});
	return { sheets, skipped: photos.slice(limit) };
}

export function photoSheetNote(plan: PhotoSheetPlan): string {
	const total = plan.sheets.reduce((sum, sheet) => sum + sheet.length, 0);
	const lines = plan.sheets.map((sheet, index) => `Image ${index + 1} of ${plan.sheets.length} shows: ${sheet.map((photo) => photo.label).join("; ")}`);
	const skipped = plan.skipped.length ? `\nNot on any sheet (render them yourself before answering): ${plan.skipped.join(", ")}.` : "";
	return `ATTACHED PHOTOS: the user attached ${total + plan.skipped.length} photo(s) and ${plan.sheets.length} numbered contact sheet(s) containing them are attached to this message. Look at every photo before you describe or advise on them, and never say you could not see one that is on a sheet. ${lines.join(". ")}.${skipped}\nThe sheets are small; render a photo from /work/inputs when you need detail from it.`;
}

/** Contact sheets of every staged photo, attached to the first model call so a many-photo question is answered from all of them. */
export async function inputPhotoSheets(chatId: string, user: string): Promise<{ images: DifyChatFile[]; note: string }> {
	const names = await fs.readdir(path.join(workspaceDir(chatId), "inputs")).catch(() => [] as string[]);
	const plan = planPhotoSheets(names);
	if (!plan.sheets.length) return { images: [], note: "" };
	await fs.mkdir(path.join(workspaceDir(chatId), ".tools"), { recursive: true });
	await fs.writeFile(path.join(workspaceDir(chatId), ".tools", "photo_sheet.py"), SHEET_SCRIPT);
	const images: DifyChatFile[] = [];
	for (const [index, sheet] of plan.sheets.entries()) {
		const out = `.render/photos-${index + 1}.jpg`;
		const args = sheet.map((photo) => JSON.stringify(`${photo.label}||/work/inputs/${photo.name}`)).join(" ");
		const run = await execInSandbox(chatId, `mkdir -p /work/.render && python3 /work/.tools/photo_sheet.py /work/${out} ${args}`, 60).catch(() => null);
		if (!run || run.exitCode !== 0) continue;
		const bytes = await fs.readFile(resolveWorkspacePath(chatId, out)).catch(() => null);
		if (bytes) images.push(await uploadRuntimeImage(`photos-${index + 1}`, bytes, user, "image/jpeg"));
	}
	return images.length === plan.sheets.length ? { images, note: photoSheetNote(plan) } : { images: [], note: "" };
}
