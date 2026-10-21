import { createHash } from "node:crypto";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { expect, it } from "vitest";
import { renderContractPdf } from "../render-pdf";
import type { LayoutInput } from "../layout";
import { buildPlatformAgreementDocument } from "../platform-agreement";

// Synthetic one-pixel fixture; never used as a corporate seal.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=",
  "base64",
);
const party = {
  company: "주식회사 노온",
  bizNo: "6528703871",
  address: "서울시 강남구",
  representative: "이성연",
};
const input: LayoutInput = {
  kind: "platform_buyer",
  doc: buildPlatformAgreementDocument("구매회사", "선정 PG"),
  parties: { buyer: { ...party, company: "구매회사" }, platform: party },
  feeRows: [{ label: "계좌이체", value: "1.80%" }],
  seal: {
    version: "synthetic-test-only",
    sha256: createHash("sha256").update(png).digest("hex"),
  },
};

it("도장 원본이 없으면 미날인 PDF를 만들지 않는다", async () => {
  await expect(renderContractPdf(input)).rejects.toThrow(
    "PLATFORM_SEAL_REQUIRED",
  );
});

it("스냅샷과 다른 도장을 거부한다", async () => {
  await expect(
    renderContractPdf(
      { ...input, seal: { ...input.seal, sha256: "0".repeat(64) } },
      { sealBytes: png },
    ),
  ).rejects.toThrow("PLATFORM_SEAL_CHANGED");
});

it("동일한 날인 원본으로 미리보기와 발송 PDF가 같고 이미지 객체가 실제 포함된다", async () => {
  const a = await renderContractPdf(input, { sealBytes: png });
  const b = await renderContractPdf(input, { sealBytes: png });
  expect(a.bytes).toEqual(b.bytes);
  expect(a.fields).toHaveLength(1);
  const pdf = await PDFDocument.load(a.bytes);
  const images = pdf.context
    .enumerateIndirectObjects()
    .filter(
      ([, value]) =>
        "dict" in value &&
        value.dict instanceof PDFDict &&
        value.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    );
  expect(images.length).toBeGreaterThan(0);
});
