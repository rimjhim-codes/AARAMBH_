import JSZip from "jszip";
import mammoth from "mammoth";

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

async function loadOfficePackage(buffer: Buffer) {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString("binary") !== "PK\x03\x04") {
    throw new Error("Office document is not a valid ZIP package.");
  }
  return JSZip.loadAsync(buffer);
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("DOCX contains no extractable text.");
  return text;
}

export async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await loadOfficePackage(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)/i)?.[1]) - Number(right.match(/slide(\d+)/i)?.[1]));
  if (!slideNames.length) throw new Error("PPTX contains no slide XML files.");

  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("text");
    const text = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)]
      .map((match) => decodeXml(match[1]))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) slides.push(text);
  }
  const result = slides.join("\n\n").trim();
  if (!result) throw new Error("PPTX contains no extractable slide text.");
  return result;
}

export async function validateOfficePackage(buffer: Buffer, type: "docx" | "pptx") {
  const zip = await loadOfficePackage(buffer);
  const names = Object.keys(zip.files);
  const required = type === "docx" ? "word/document.xml" : "ppt/presentation.xml";
  if (!names.includes(required)) throw new Error(`File is not a valid ${type.toUpperCase()} package.`);
}
