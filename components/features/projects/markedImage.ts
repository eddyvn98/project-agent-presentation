import type { LineShape } from "@/components/features/chat/image-preferences/brush-mask-editor";

/** Flattens the brush strokes (orange, in image pixels) onto the image so the agent can see exactly which area to change. */
export async function composeMarkedImage(imageUrl: string, lines: LineShape[], name: string): Promise<File> {
	const response = await fetch(imageUrl);
	if (!response.ok) throw new Error("Could not read the image");
	const bitmap = await createImageBitmap(await response.blob());
	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Could not draw on the image");
	context.drawImage(bitmap, 0, 0);
	context.globalAlpha = 0.55;
	context.strokeStyle = "#f97316";
	context.fillStyle = "#f97316";
	context.lineCap = "round";
	context.lineJoin = "round";
	for (const line of lines) {
		context.lineWidth = line.strokeWidth;
		context.beginPath();
		context.moveTo(line.points[0], line.points[1]);
		for (let index = 2; index < line.points.length; index += 2) context.lineTo(line.points[index], line.points[index + 1]);
		if (line.points.length <= 2) context.arc(line.points[0], line.points[1], line.strokeWidth / 2, 0, Math.PI * 2);
		context.stroke();
	}
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
	if (!blob) throw new Error("Could not export the marked image");
	return new File([blob], `marked-${name.replace(/\.[^.]+$/, "")}.png`, { type: "image/png" });
}
