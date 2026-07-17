import {
  CONTRACT_CONSENT_TEXTS,
  CONTRACT_EVENT_LABELS,
  type ContractParty,
} from '@/lib/types/contract-doc';
import { fmtKst } from '../kst';
import {
  CONTENT_W,
  COLOR,
  MARGIN,
  type Sheet,
  type TableCell,
  drawKeyValueRows,
  drawParagraph,
  drawSectionTitle,
  drawTable,
  drawText,
  ensureRoom,
} from './layout';

/** 이 별지가 그리는 모든 정적 문자열의 단일 출처 (overview-sheet 의 L 과 같은 규약). */
const L = {
  title: '별지 2. 전자서명 및 감사추적 확인서',
  sectionDoc: '문서 정보',
  docNo: '문서번호',
  docTitle: '계약서 제목',
  baseSha: '서명 대상 문서 SHA-256',
  completedAt: '체결 완료 일시',
  sectionSigners: '서명자',
  partyBuyer: '갑 (구매사)',
  partyPg: '을 (결제대행사)',
  signerName: '이름',
  signerEmail: '이메일',
  signedAt: '서명 일시',
  signIp: 'IP 주소',
  signMethod: '서명 방식',
  methodDraw: '그리기',
  methodType: '입력',
  signature: '서명',
  consent: '동의 문구',
  consentAt: '동의 일시',
  consentVersion: '문구 버전',
  sectionTimeline: '이벤트 타임라인',
  colAt: '시각',
  colEvent: '이벤트',
  colActor: '행위자',
  colIp: 'IP 주소',
  empty: '-',
} as const;

/** 코퍼스 조각 — finalize 가 폰트 서브셋 전에 합산한다. */
export const AUDIT_STATIC_TEXT: readonly string[] = [
  ...Object.values(L),
  ...Object.values(CONTRACT_EVENT_LABELS),
  ...Object.values(CONTRACT_CONSENT_TEXTS),
];

const PARTY_LABELS: Record<ContractParty, string> = {
  buyer: L.partyBuyer,
  pg: L.partyPg,
};

/** 서명 이미지 박스 — 비율을 유지한 채 이 안에 맞춘다. */
const SIG_BOX = { w: 180, h: 72 } as const;

export type AuditSigner = {
  party: ContractParty;
  name: string;
  email: string;
  signedAt: Date;
  ip: string | null;
  method: 'draw' | 'type';
  imagePng: Buffer;
  consentAt: Date;
  consentTextVersion: string;
};

export type AuditEvent = {
  type: string;
  at: Date;
  actorName: string | null;
  ip: string | null;
};

export type AuditSheetArgs = {
  docCode: string;
  title: string;
  baseSha256: string;
  completedAt: Date;
  signers: readonly AuditSigner[];
  events: readonly AuditEvent[];
};

/**
 * 라벨 없는 이벤트 타입도 원문 그대로 남긴다.
 *
 * 타입 계약이 `string` 인 이상 라벨 맵에 없는 값이 올 수 있다(스키마가 앞서
 * 나가거나 과거 데이터가 남은 경우). 감사추적은 **증거**이므로 모르는 이벤트를
 * 숨기거나 예외로 터뜨리는 쪽이 원문 노출보다 나쁘다.
 */
function eventLabel(type: string): string {
  return CONTRACT_EVENT_LABELS[type as keyof typeof CONTRACT_EVENT_LABELS] ?? type;
}

async function drawSignerBlock(s: Sheet, signer: AuditSigner): Promise<void> {
  ensureRoom(s, 150);
  drawText(s, PARTY_LABELS[signer.party], { size: 10, bold: true });
  s.y -= 18;

  drawKeyValueRows(s, [
    { label: L.signerName, value: signer.name },
    { label: L.signerEmail, value: signer.email },
    { label: L.signedAt, value: fmtKst(signer.signedAt) },
    { label: L.signIp, value: signer.ip ?? L.empty },
    { label: L.signMethod, value: signer.method === 'draw' ? L.methodDraw : L.methodType },
  ]);
  s.y -= 6;

  // ── 서명 이미지 — 박스 안에서 비율 유지 ──
  const image = await s.doc.embedPng(signer.imagePng as unknown as Uint8Array);
  const scale = Math.min(SIG_BOX.w / image.width, SIG_BOX.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ensureRoom(s, SIG_BOX.h + 18);
  drawText(s, L.signature, { x: MARGIN, y: s.y, size: 9, color: COLOR.label });
  const boxX = MARGIN + 110;
  s.page.drawRectangle({
    x: boxX,
    y: s.y - SIG_BOX.h + 10,
    width: SIG_BOX.w,
    height: SIG_BOX.h,
    borderWidth: 0.5,
    borderColor: COLOR.line,
  });
  // 박스 중앙 정렬 — 원본 비율이 어떻든 넘치지 않는다.
  s.page.drawImage(image, {
    x: boxX + (SIG_BOX.w - w) / 2,
    y: s.y - SIG_BOX.h + 10 + (SIG_BOX.h - h) / 2,
    width: w,
    height: h,
  });
  s.y -= SIG_BOX.h + 16;

  // ── 동의 문구 전문 — "무엇에 동의했는지"의 불변 증거 ──
  drawKeyValueRows(s, [
    { label: L.consentAt, value: fmtKst(signer.consentAt) },
    { label: L.consentVersion, value: signer.consentTextVersion },
  ]);
  s.y -= 2;
  drawText(s, L.consent, { x: MARGIN, y: s.y, size: 9, color: COLOR.label });
  s.y -= 14;
  // 버전에 해당하는 문구가 없으면(문구 개정 후 과거 버전 유실) 빈 문자열 대신
  // 버전 문자열이라도 남긴 위 행이 증거를 지탱한다.
  const consentText = CONTRACT_CONSENT_TEXTS[signer.consentTextVersion] ?? '';
  if (consentText !== '') {
    drawParagraph(s, consentText, { x: MARGIN, size: 8, color: COLOR.value, maxW: CONTENT_W });
  }
  s.y -= 14;
}

/** [별지2] 전자서명 및 감사추적 확인서 — 체결의 증거면. */
export async function drawAuditSheet(s: Sheet, args: AuditSheetArgs): Promise<void> {
  const { docCode, title, baseSha256, completedAt, signers, events } = args;

  drawText(s, L.title, { size: 16, bold: true });
  s.y -= 26;

  drawSectionTitle(s, L.sectionDoc);
  drawKeyValueRows(s, [
    { label: L.docNo, value: docCode },
    { label: L.docTitle, value: title },
    { label: L.baseSha, value: baseSha256 },
    { label: L.completedAt, value: fmtKst(completedAt) },
  ]);
  s.y -= 12;

  drawSectionTitle(s, L.sectionSigners);
  for (const signer of signers) await drawSignerBlock(s, signer);

  drawSectionTitle(s, L.sectionTimeline);
  const cols = [150, 110, 130, CONTENT_W - 390];
  const rows: TableCell[][] = [
    [
      { text: L.colAt, bold: true },
      { text: L.colEvent, bold: true },
      { text: L.colActor, bold: true },
      { text: L.colIp, bold: true },
    ],
    ...events.map((e): TableCell[] => [
      { text: fmtKst(e.at) },
      { text: eventLabel(e.type) },
      { text: e.actorName ?? L.empty },
      { text: e.ip ?? L.empty },
    ]),
  ];
  drawTable(s, cols, rows, { size: 8 });
}
