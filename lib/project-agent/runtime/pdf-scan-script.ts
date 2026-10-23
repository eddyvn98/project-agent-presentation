import { PDF_SCAN_OCR_PY } from "./pdf-scan-ocr";
import { PDF_SCAN_STRUCTURE_PY } from "./pdf-scan-structure";
import { PDF_SCAN_FIX_PY } from "./pdf-scan-fix";

/** Installed into each agent sandbox as /work/.tools/pdf_scan_to_md.py: scanned PDF in, structured Markdown and a check report out. */
export const PDF_SCAN_TO_MD_SCRIPT = PDF_SCAN_OCR_PY + PDF_SCAN_STRUCTURE_PY + PDF_SCAN_FIX_PY;
