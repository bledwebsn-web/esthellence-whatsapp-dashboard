type ExtractTextParams = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

type ExtractTextResult = {
  text: string;
  status: "extracted" | "failed";
  error?: string;
};

const MAX_EXTRACTED_TEXT_LENGTH = 80_000;

function normalizeExtractedText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_LENGTH);
}

function getExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".docx")) return "docx";
  return "";
}

function isPdf(mimeType: string, extension: string) {
  return mimeType === "application/pdf" || extension === "pdf";
}

function isTxt(mimeType: string, extension: string) {
  return mimeType === "text/plain" || extension === "txt";
}

function isDocx(mimeType: string, extension: string) {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  );
}

export async function extractTextFromDocument({
  buffer,
  fileName,
  mimeType,
}: ExtractTextParams): Promise<ExtractTextResult> {
  const extension = getExtension(fileName);

  try {
    if (isTxt(mimeType, extension)) {
      return {
        text: normalizeExtractedText(buffer.toString("utf8")),
        status: "extracted",
      };
    }

    if (isPdf(mimeType, extension)) {
      const pdfModule = await import("pdf-parse");
      const pdfParse = (pdfModule as { default?: unknown }).default ?? pdfModule;
      const parsed = await (pdfParse as (input: Buffer) => Promise<{ text?: string } | { text?: string }>)(
        buffer
      );

      return {
        text: normalizeExtractedText(parsed?.text ?? ""),
        status: "extracted",
      };
    }

    if (isDocx(mimeType, extension)) {
      const mammothModule = await import("mammoth");
      const mammoth = (mammothModule as { default?: unknown }).default ?? mammothModule;
      const extracted = await (mammoth as {
        extractRawText: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
      }).extractRawText({ buffer });

      return {
        text: normalizeExtractedText(extracted?.value ?? ""),
        status: "extracted",
      };
    }

    return {
      text: "",
      status: "failed",
      error: "Format non supporté. Utilisez PDF, TXT ou DOCX.",
    };
  } catch (error) {
    console.error("Failed to extract document text:", error);
    return {
      text: "",
      status: "failed",
      error: "Impossible d’extraire le texte du document.",
    };
  }
}
