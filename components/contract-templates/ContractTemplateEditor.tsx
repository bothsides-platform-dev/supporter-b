'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import * as pdfjsLib from 'pdfjs-dist';
import { Check } from 'lucide-react';

import { FileSignatureIcon, XIcon } from '@/components/icons';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Note } from '@/components/primitives/Note';
import { Select } from '@/components/primitives/Select';
import { PageHeader } from '@/components/shell/PageHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { createSigningTemplateUploadSessionAction } from '@/lib/server/actions/signing/createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '@/lib/server/actions/signing/createSigningTemplateAction';
import { updateSigningTemplateAction } from '@/lib/server/actions/signing/updateSigningTemplateAction';
import {
  addField,
  clampToPage,
  moveField,
  newFieldId,
  removeField,
  resizeField,
  type ContractTemplateEditorInitial,
  type PageSize,
} from './template-editor-state';
import { validateTemplateFields } from '@/lib/signing/template-fields';
import { SIGNING_DEADLINE_DAYS } from '@/lib/signing/deadline';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import {
  SIGNING_TEMPLATE_NAME_MAX,
  SIGNING_TEMPLATE_PDF_MAX_BYTES,
} from '@/lib/signing/template-limits';
import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

// pdf.js 워커 — Next.js는 워커 파일을 정적 자산으로 서빙해야 한다. 번들러가 처리하도록
// import.meta.url 기반 워커를 쓴다(pdfjs-dist v4+ 표준 패턴, v6.2.108에서도 유지됨 —
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs 실재 확인).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// 필드 타입·소속의 한국어 표기 — 툴바 버튼과 배치된 칩·삭제 버튼 이름이 같은 어휘를
// 쓴다(칩만 영어 원값을 노출하면 '구매사 signature' 같은 한영 혼용이 된다).
const FIELD_TYPE_LABELS: Record<SigningTemplateFieldType, string> = {
  signature: '서명',
  name: '이름',
  date: '날짜',
  text: '텍스트',
};
const PARTY_LABELS: Record<SigningTemplateFieldParty, string> = {
  buyer: '구매사',
  pg: 'PG사',
};
const fieldLabel = (party: SigningTemplateFieldParty, type: SigningTemplateFieldType) =>
  `${PARTY_LABELS[party]} ${FIELD_TYPE_LABELS[type]}`;

// 툴바는 당사자별 그룹으로 묶는다 — 시각 라벨은 짧게(서명·이름·날짜·텍스트), 접근성
// 이름은 온전히(구매사 서명). 시각 라벨이 접근성 이름에 포함되므로(label-in-name)
// 음성 사용자와 화면 사용자가 같은 이름으로 같은 버튼을 부를 수 있다.
// 배열은 라벨 Record 에서 파생한다 — 손으로 나열하면 새 타입이 추가될 때 컴파일러가
// 라벨 누락은 잡아도 배열 누락은 못 잡아, 버튼이 조용히 빠진다.
const FIELD_TOOL_PARTIES = Object.keys(PARTY_LABELS) as SigningTemplateFieldParty[];
const FIELD_TOOL_TYPES = Object.keys(FIELD_TYPE_LABELS) as SigningTemplateFieldType[];

// 서명 가능한 타입 — validateTemplateFields 의 판정과 같은 기준(signature/name).
// 힌트 표시용으로만 쓰고, 실제 저장 게이트는 여전히 validateTemplateFields 가 소유한다.
const isSignable = (t: SigningTemplateFieldType) => t === 'signature' || t === 'name';

// 스노우싸인 `/v1/uploads` 는 **S3 presigned POST** 를 준다 — R2 첨부
// (lib/attachments/upload-client.ts)의 presigned PUT 과 다르다. 그 패턴을
// 그대로 가져와 fields 를 버리고 PUT 을 쏘면 S3 가 403 을 돌려주고, PG 는
// 계약서 템플릿을 한 건도 등록할 수 없다(실측 2026-08-03: PUT 403 / POST 204,
// scripts/signing/snowsign-smoke.ts --template T2).
//
// 규칙 두 가지: ① 서명에 포함된 fields 를 하나도 빠뜨리지 않는다, ② `file` 은
// 반드시 마지막에 붙인다(S3 는 file 뒤의 필드를 무시한다). Content-Type 은
// fields 안에 이미 들어 있으므로 요청 헤더로는 절대 넣지 않는다 — 헤더로 박으면
// 브라우저가 multipart boundary 를 못 붙여 본문이 통째로 깨진다.
// 생성(파일 즉시 업로드)과 수정(저장 시점 업로드)이 같은 계약을 공유한다.
// XMLHttpRequest 인 이유: fetch 는 업로드 진행(onprogress)을 관측할 수 없다 —
// 50MB 캡의 POST 가 정적 문구 한 줄이면 진행 중인지 죽었는지 구분이 안 된다.
// onerror(네트워크 단절)는 **reject** 다 — resolve(false)(서버가 거부한 2xx 밖
// 응답)와 갈라야 호출자가 네트워크 원인을 따로 말할 수 있다.
function postPresignedUpload(
  uploadUrl: string,
  fields: Record<string, string>,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file);
  return new Promise<boolean>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    // Content-Type 헤더는 절대 세팅하지 않는다(위 presigned POST 계약 주석).
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => reject(new Error('UPLOAD_NETWORK'));
    xhr.onabort = () => reject(new Error('UPLOAD_ABORTED'));
    xhr.ontimeout = () => reject(new Error('UPLOAD_TIMEOUT'));
    xhr.send(form);
  });
}

const UPLOAD_NETWORK_MESSAGE = 'PDF를 올리지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.';

type Props = {
  onSaved: (templateId: string) => void;
  onCancel: () => void;
  /**
   * 수정 모드 진입 데이터(마운트 계약 — 이후 불변). 있으면 에디터가 기존 PDF·서명칸·
   * 이름으로 시작하고, 저장은 재생성-후-교체(updateSigningTemplateAction)로 나간다.
   */
  initial?: ContractTemplateEditorInitial;
};

export function ContractTemplateEditor({ onSaved, onCancel, initial }: Props) {
  // 모드는 마운트에 고정된다 — 목록은 수정 대상이 바뀔 때 에디터를 새로 마운트한다.
  const mode: 'create' | 'edit' = initial ? 'edit' : 'create';
  const initialRef = useRef(initial);
  const [name, setName] = useState(initial?.name ?? '');
  // 원시 uploadId 가 아니라 서버가 워크스페이스에 서명 바인딩한 토큰을 들고 있는다 —
  // 저장할 때 그대로 돌려주면 서버가 소유를 대조한다(조직 공유 업로드 세션 방어).
  const [uploadToken, setUploadToken] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<SigningTemplateFieldInput[]>([]);
  // 방금 추가(또는 클릭)한 필드만 강조한다 — 모든 박스가 같은 보더면 방금 추가한
  // 칸이 문서 어디에 떨어졌는지 찾기 어렵다.
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 업로드 POST 의 바이트 진행률(0~100) — null 이면 업로드 구간이 아니다(세션 발급·
  // 파싱·update 등). 생성 경로는 상태 라인에, 수정 저장은 버튼 라벨에 실린다.
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  // 드롭존 위 드래그 중 — dragleave 는 자식 경계에서도 발화하지만 dragover 가
  // 연속 발화해 즉시 복구되므로 플리커가 실사용 문제로 남지 않는다.
  const [dragOver, setDragOver] = useState(false);
  // 다른 문서로의 교체 확인 대기 파일 — 배치한 서명칸이 있으면 교체가 배치를 지우므로
  // (applyParsedDocument), 지우기 전에 묻는다. 드롭 타깃이 화면 전체라 미스드롭
  // 한 번이 몇 분치 작업을 날리는 사고의 방어선이다.
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);
  // 작업물(업로드한 PDF·배치 필드)이 있을 때의 취소 확인 — 취소는 전부 버리는
  // 행동이라 확인 없이 지나가면 몇 분치 배치 작업이 즉사한다.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  // 수정 모드의 dirty 기준선 — 진입 시 주입한 이름·필드 배열(레퍼런스 비교).
  // 필드 배열은 모든 변경이 새 배열을 만들므로 레퍼런스가 곧 "손댔는가"다.
  const [editBaseline, setEditBaseline] = useState<{
    name: string;
    fields: SigningTemplateFieldInput[];
  } | null>(null);
  // 수정 모드의 원본 PDF 바이트 — 저장 시 재업로드용. pdf.js 에는 항상 복사본을
  // 넘긴다(getDocument 가 버퍼를 워커로 transfer 해 detach 시킨다 — 원본을 주면
  // 저장 시 0바이트 업로드가 나간다).
  const pdfBytesRef = useRef<ArrayBuffer | null>(initial?.pdfBytes ?? null);
  // 수정 저장 재시도용 업로드 세션 캐시 — 같은 바이트로 저장을 다시 누르면 이미
  // 올린 업로드를 재사용하고 update 액션만 다시 민다. 매 클릭이 새 세션을 만들면
  // 실패 3번에 조직 공유 3슬롯(10분 TTL·해제 API 없음)이 고갈돼 모든 PG 의
  // 업로드가 막힌다. 서버측 만료(UPLOAD_SESSION_EXPIRED 계열)에만 캐시를 버린다.
  const uploadSessionCacheRef = useRef<{ bytes: ArrayBuffer; token: string } | null>(null);

  // 파싱된 pdf.js 핸들 — 페이지 canvas 렌더링(아래 useEffect)이 doc 을, 해제가 task 를
  // 쓴다(v6 에서 destroy 는 문서가 아니라 로딩 태스크에 있다 — 워커까지 함께 반환).
  // state 가 아니라 ref 인 이유: 핸들 교체가 리렌더를 일으킬 필요가 없고, 렌더 트리거는
  // `pages` 하나로 충분하다.
  const pdfRef = useRef<{
    task: ReturnType<typeof pdfjsLib.getDocument>;
    doc: pdfjsLib.PDFDocumentProxy;
  } | null>(null);
  // 직전 문서의 이름·페이지 기하 — 같은 PDF 재업로드(업로드 세션 만료 복구)와
  // 다른 문서로의 교체를 가른다. state 가 아니라 ref 인 이유: handleUpload 의
  // 빈 deps 를 유지하기 위해서다(closure 로 읽으면 스테일).
  const docMetaRef = useRef<{ name: string; byteSize: number; sizes: PageSize[] } | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  // 네이티브 파일 인풋은 숨기고(sr-only) 드롭존·교체 버튼이 대신 연다 — 브라우저
  // 기본 문구("Choose File No file chosen")를 노출하지 않기 위해서다.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 언마운트 후 완료된 업로드가 새 pdf.js 태스크를 ref 에 넣으면 아무도 해제하지
  // 못한다(언마운트 정리는 이미 지나갔다) — 살아있음 플래그로 늦게 도착한 태스크를
  // 그 자리에서 해제한다.
  const aliveRef = useRef(true);

  const page = pages[currentPage - 1];
  // 수정 모드에는 진입 시 문서가 이미 있고 업로드는 저장 시점이라 uploadToken 이
  // 존재하지 않는다 — 문서 유무(pages)가 같은 자리를 대신한다.
  const hasDocumentReady = mode === 'edit' ? pages.length > 0 : !!uploadToken;
  const canSave = useMemo(
    () => hasDocumentReady && !!name.trim() && validateTemplateFields(fields).ok,
    [hasDocumentReady, name, fields],
  );

  // 저장이 비활성인 이유 — 버튼만 조용히 죽어 있으면 사용자가 막다른 길에 갇힌다.
  // 실제 게이트(canSave)와 같은 조건에서 파생하되, 사라지는 한 줄 힌트가 아니라
  // 충족 여부가 계속 보이는 체크리스트로 편다(완료가 눈에 보여야 "다 됐다"를 안다).
  const checklist = useMemo(
    () => [
      { label: '계약서 PDF 올리기', done: hasDocumentReady },
      { label: '템플릿 이름 입력하기', done: !!name.trim() },
      {
        label: '구매사 서명 필드 배치하기',
        done: fields.some((f) => f.party === 'buyer' && isSignable(f.type)),
      },
      {
        label: 'PG사 서명 필드 배치하기',
        done: fields.some((f) => f.party === 'pg' && isSignable(f.type)),
      },
    ],
    [hasDocumentReady, name, fields],
  );

  // PDF 파싱 + pdf.js 핸들 교체. 성공 시 페이지 기하를 돌려주고, 살아있지 않으면
  // (언마운트 뒤 늦은 완료) null — 호출자는 조용히 접는다. 파싱 실패한 태스크는
  // 여기서 해제한다(깨진 PDF 를 재시도할 때마다 워커가 쌓이면 탭이 죽는다).
  const loadPdfDocument = useCallback(async (buf: ArrayBuffer): Promise<PageSize[] | null> => {
    const task = pdfjsLib.getDocument({ data: buf });
    try {
      const doc = await task.promise;
      const sizes: PageSize[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const p = await doc.getPage(i);
        const vp = p.getViewport({ scale: 1 });
        sizes.push({ width: vp.width, height: vp.height });
      }
      // 화면을 떠났다면 이 태스크는 ref 에 넣어도 아무도 해제하지 못한다 — 그
      // 자리에서 반환하고 끝낸다.
      if (!aliveRef.current) {
        void task.destroy?.();
        return null;
      }
      // 이전 문서가 있으면 해제하고 새 핸들로 교체 — 렌더 effect 가 pages 변경을
      // 보고 새 canvas 에 다시 그린다.
      void pdfRef.current?.task.destroy?.();
      pdfRef.current = { task, doc };
      return sizes;
    } catch (e) {
      void task.destroy?.();
      throw e;
    }
  }, []);

  // 파싱 결과를 화면 상태에 반영한다. 배치한 필드는 **다른 문서로 바뀔 때만**
  // 초기화한다 — 좌표는 문서에 종속이라 남겨두면 새 문서에 없는 페이지의 필드까지
  // 저장 페이로드에 실려 나간다. 단, 같은 PDF 재업로드(이름·크기·페이지 기하 일치 —
  // 업로드 세션 만료 복구, TODOS.md '업로드 토큰 TTL' 항목)는 좌표가 그대로
  // 유효하므로 배치를 보존한다. 파일 크기도 함께 본다 — 이름과 쪽수·쪽 크기만으로는
  // "같은 PDF"를 오판할 수 있다(같은 이름의 개정판은 쪽수·크기가 그대로인 경우가 흔하다).
  const applyParsedDocument = useCallback(
    (docName: string, byteSize: number, sizes: PageSize[]) => {
      const prev = docMetaRef.current;
      const samePdf =
        !!prev &&
        prev.name === docName &&
        prev.byteSize === byteSize &&
        prev.sizes.length === sizes.length &&
        prev.sizes.every((s, i) => s.width === sizes[i]!.width && s.height === sizes[i]!.height);
      docMetaRef.current = { name: docName, byteSize, sizes };
      setFileName(docName);
      setPages(sizes);
      setCurrentPage(1);
      if (!samePdf) {
        setFields([]);
        setSelectedFieldId(null);
      }
    },
    [],
  );

  // 가드 통과 후의 실제 업로드/파싱 본체 — 교체 확인창의 '바꿀게요'가 이 지점으로
  // 재진입한다(확인은 업로드·파싱보다 먼저여야 한다 — 파싱부터 하면 기존 pdf.js
  // 핸들이 이미 교체돼 '닫기'로 되돌릴 수 없다).
  const doUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      // 수정 모드: 교체도 **로컬 파싱뿐**이다 — 업로드는 저장 시점(handleSave)에 한
      // 번만 나간다. 여기서 세션을 만들면 TTL 10분이 배치 작업 시간을 제한하고(생성
      // 플로의 알려진 문제), 조직 공유 3슬롯을 배치 내내 점유한다.
      if (mode === 'edit') {
        try {
          const buf = await file.arrayBuffer();
          // 원본은 저장용으로 남기고 파서에는 복사본 — pdf.js 가 버퍼를 detach 한다.
          const sizes = await loadPdfDocument(buf.slice(0));
          if (!sizes) return;
          pdfBytesRef.current = buf;
          applyParsedDocument(file.name, file.size, sizes);
        } catch {
          toast('PDF를 처리하지 못했어요', { type: 'error' });
        }
        return;
      }

      const session = await createSigningTemplateUploadSessionAction({
        filename: file.name,
        contentType: 'application/pdf',
        sizeBytes: file.size,
      });
      if (!session.ok) {
        // 서버가 구분해 준 코드(쿼터 등)를 살린다 — 저장 실패와 같은 SSOT.
        toast(signingErrorMessage(session.error, '업로드 세션을 만들지 못했어요'), {
          type: 'error',
        });
        return;
      }

      // 업로드/PDF 파싱은 전부 이 try 안에서 진행한다 — onChange가 `void handleUpload(file)`로
      // 호출되므로(반환 프로미스를 아무도 기다리지 않는다) 여기서 던지는 예외는 감싸지
      // 않으면 조용한 unhandled rejection이 되고, 파일 input은 여전히 파일이 선택된
      // 것처럼 보여 사용자가 실패를 알거나 재시도할 방법이 없다. 업로드 토큰은 업로드가 실제로
      // 성공한 뒤에만 설정한다(그 전에 설정해두면 업로드가 실패해도 "업로드된 것처럼" 상태가
      // 남는다) — 성공 판정 하나로 묶이므로 이 경로엔 토큰이 설정됐는데 실제로는
      // 아무것도 저장되지 않은 창이 존재하지 않는다.
      // 업로드(네트워크)와 파싱(파일)은 실패 원인이 다르다 — 같은 문구로 뭉개면
      // 네트워크 단절에 사용자가 멀쩡한 파일을 의심한다. try 를 갈라 따로 말한다.
      let uploaded: boolean;
      try {
        uploaded = await postPresignedUpload(session.uploadUrl, session.fields, file, (pct) => {
          if (aliveRef.current) setUploadPct(pct);
        });
      } catch {
        toast(UPLOAD_NETWORK_MESSAGE, { type: 'error' });
        return;
      } finally {
        setUploadPct(null);
      }
      if (!uploaded) {
        toast('PDF 업로드에 실패했어요', { type: 'error' });
        return;
      }

      try {
        const buf = await file.arrayBuffer();
        const sizes = await loadPdfDocument(buf);
        if (!sizes) return;
        applyParsedDocument(file.name, file.size, sizes);
        setUploadToken(session.uploadToken);
      } catch {
        toast('PDF를 처리하지 못했어요', { type: 'error' });
      }
    } catch {
      // 세션 요청 자체의 reject(네트워크 단절) — 잡지 않으면 조용한 unhandled
      // rejection 이 되고, 파일 인풋은 선택된 것처럼 보여 재시도 방법이 없다.
      toast('업로드 세션을 만들지 못했어요', { type: 'error' });
    } finally {
      setUploading(false);
    }
  }, [mode, loadPdfDocument, applyParsedDocument]);

  const handleUpload = useCallback(
    async (file: File) => {
      // 세션 생성 전에 거른다 — 비-PDF·초과 파일이 업로드 세션과 제공자 스토리지를
      // 소모한 뒤에야 실패하면 사용자는 원인 모를 처리 실패만 본다. 드롭 경로는
      // accept 필터를 아예 거치지 않으므로 이 가드가 유일한 방어다. 크기 상한은
      // 서버 스키마와 같은 단일 출처(template-limits)를 본다.
      if (file.type !== 'application/pdf') {
        toast('PDF 파일만 올릴 수 있어요', { type: 'error' });
        return;
      }
      if (file.size > SIGNING_TEMPLATE_PDF_MAX_BYTES) {
        toast(`PDF는 ${SIGNING_TEMPLATE_PDF_MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요`, {
          type: 'error',
        });
        return;
      }
      // 배치가 있는 채 **다른 문서**로 바꾸면 확인을 거친다 — 판정은 samePdf
      // (applyParsedDocument)의 저렴한 프리픽스(이름·크기)만 쓴다. 파싱 전이라
      // 페이지 기하는 아직 모르기 때문. 잔여 엣지: 같은 이름·같은 크기의 개정판은
      // 확인 없이 지나가 applyParsedDocument 의 기하 대조에서 배치가 지워진다 —
      // 드물고, 막으려면 문서 핸들 수명 구조를 재설계해야 해 받아들인다.
      const meta = docMetaRef.current;
      if (fields.length > 0 && meta && (meta.name !== file.name || meta.byteSize !== file.size)) {
        setPendingReplaceFile(file);
        return;
      }
      await doUpload(file);
    },
    [fields.length, doUpload],
  );

  // 페이지 본문을 canvas 에 실제로 그린다. 크기만 잡고 본문을 안 그리면 사용자는 빈
  // 사각형 위에 서명칸을 놓게 된다(계약서의 어디가 서명란인지 볼 수 없다). 렌더 좌표계는
  // 필드 배치와 같은 scale 1 viewport 라 배치 픽셀과 문서 픽셀이 1:1 로 맞는다.
  useEffect(() => {
    const doc = pdfRef.current?.doc;
    const root = pagesContainerRef.current;
    if (!doc || !root || pages.length === 0) return;
    let cancelled = false;
    // 진행 중 RenderTask 핸들 — 문서 교체(pages 변경)로 effect 가 갈리면 cleanup 이
    // 취소한다. 취소 없이 새 문서 렌더가 같은 페이지번호 canvas 를 잡으면 pdf.js 가
    // "Cannot use the same canvas during multiple render() operations" 를 던진다.
    let currentTask: { cancel: () => void } | null = null;
    void (async () => {
      for (let i = 1; i <= pages.length; i += 1) {
        if (cancelled) return;
        const canvas = root.querySelector<HTMLCanvasElement>(`canvas[data-page-canvas="${i}"]`);
        if (!canvas) continue;
        try {
          const p = await doc.getPage(i);
          const viewport = p.getViewport({ scale: 1 });
          // v6 API — canvas 를 직접 넘기면 컨텍스트는 pdf.js 가 얻는다.
          const task = p.render({ canvas, viewport });
          currentTask = task;
          await task.promise;
          currentTask = null;
        } catch {
          // 취소로 인한 reject(cleanup 이 cancelled 를 먼저 올린다)는 오류가 아니다.
          if (!cancelled) toast('PDF 미리보기를 그리지 못했어요', { type: 'error' });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
      currentTask?.cancel();
    };
  }, [pages]);

  // 언마운트 시 pdf.js 로딩 태스크 해제(문서 + 워커 메모리 반환) + 진행 중인
  // 업로드가 늦게 만들 태스크를 위해 살아있음 플래그를 내린다.
  // effect 본문이 플래그를 되올리는 것이 필수다 — StrictMode(next dev)는
  // mount→cleanup→mount 로 두 번 돌므로, 본문이 안 올리면 cleanup 이 내린 false 가
  // ref 에 남아 dev 에서 모든 업로드가 조용한 no-op 이 된다.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      void pdfRef.current?.task.destroy?.();
    };
  }, []);

  // 최신 onCancel 을 ref 로 — 아래 마운트 1회 effect 가 콜백 아이덴티티에 묶여
  // 재실행(재파싱)되지 않게 한다.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // 수정 모드 진입 — 목록이 프리페치한 PDF 바이트·서명칸으로 에디터를 채운다.
  // initial 은 마운트 계약(불변)이라 1회만 돈다(위 alive effect 뒤에 정의돼
  // StrictMode 재마운트에서도 aliveRef 가 올라간 뒤 실행된다).
  useEffect(() => {
    const init = initialRef.current;
    if (!init) return;
    setUploading(true);
    void (async () => {
      try {
        // 원본은 pdfBytesRef(저장용)에 있고 파서에는 복사본 — pdf.js 가 detach 한다.
        const sizes = await loadPdfDocument(init.pdfBytes.slice(0));
        if (!sizes) return;
        // 재선택(같은 파일 다시 고르기) 시 필드가 보존되도록 기준 메타를 심는다 —
        // fileName 은 프록시가 실어 준 provider 원본 파일명(= 처음 올린 파일명)이라
        // 실제로 대조가 성립한다. 헤더가 없으면 목록이 지어낸 이름이 폴백이고,
        // 그 경우 재선택은 보존 없이 교체로 처리된다(안전한 쪽으로 접힘).
        docMetaRef.current = { name: init.fileName, byteSize: init.pdfBytes.byteLength, sizes };
        // 문서에 없는 페이지의 필드는 싣지 않고, 페이지 안으로 클램프한다 — provider
        // 좌표는 실측상 그대로 왕복하지만(T5) 경계 밖 데이터가 화면·저장 페이로드에
        // 스며들면 안 된다.
        const seeded = init.fields
          .filter((f) => f.pageNumber >= 1 && f.pageNumber <= sizes.length)
          .map((f) => ({ ...f, ...clampToPage(f, sizes[f.pageNumber - 1]!) }));
        setEditBaseline({ name: init.name, fields: seeded });
        setFileName(init.fileName);
        setPages(sizes);
        setCurrentPage(1);
        setFields(seeded);
      } catch {
        if (!aliveRef.current) return;
        // fail-closed — 문서 없는 반쪽 에디터를 열어두면 저장이 영영 불가능한
        // 막다른 길이다. 목록으로 돌려보낸다.
        toast('계약서 PDF를 불러오지 못했어요', { type: 'error' });
        onCancelRef.current();
      } finally {
        setUploading(false);
      }
    })();
  }, [loadPdfDocument]);

  // 에디터가 떠 있는 동안 창 어디에 놓쳐도 브라우저가 PDF 를 열러 떠나지 않게
  // 막는다 — 드롭존을 몇 픽셀 빗나간 드롭이 작업물 전체를 날리는 사고 방지.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const handleAddField = useCallback(
    (type: SigningTemplateFieldType, party: SigningTemplateFieldParty) => {
      if (!page) return;
      // id 를 여기서 만들어 넘긴다 — 함수형 업데이트를 유지하면서(스테일 클로저 없음)
      // "마지막 원소 = 새 필드" 정렬 계약에 기대지 않고 새 필드를 선택할 수 있다.
      const id = newFieldId();
      setFields((prev) => addField(prev, { id, type, party, pageNumber: currentPage }, page));
      setSelectedFieldId(id);
    },
    [page, currentPage],
  );

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // 수정 모드: 업로드는 지금 이 순간 처음 나간다(deferred) — 세션 발급 →
      // presigned POST → update 액션. 각 단계 실패는 상태를 그대로 두고 반환해
      // 재시도(다시 저장)가 가능하다. 재시도는 새 세션으로 전체 시퀀스를 다시 탄다.
      if (mode === 'edit') {
        const init = initialRef.current!;
        const bytes = pdfBytesRef.current;
        if (!bytes) return; // canSave(pages>0)가 게이트하므로 실제로는 도달하지 않는다

        // 같은 바이트로의 재시도는 이미 올린 업로드를 재사용한다(위 캐시 주석).
        let uploadToken: string;
        const cached = uploadSessionCacheRef.current;
        if (cached && cached.bytes === bytes) {
          uploadToken = cached.token;
        } else {
          const uploadName = fileName ?? init.fileName;
          const session = await createSigningTemplateUploadSessionAction({
            filename: uploadName,
            contentType: 'application/pdf',
            sizeBytes: bytes.byteLength,
          });
          if (!session.ok) {
            toast(signingErrorMessage(session.error, '템플릿을 저장하지 못했어요'), { type: 'error' });
            return;
          }
          // 업로드 네트워크 단절은 일반 '저장하지 못했어요'와 갈라 말한다 — 캐시·
          // 배치 상태는 그대로라 다시 저장이 곧 재시도다.
          let uploaded: boolean;
          try {
            uploaded = await postPresignedUpload(
              session.uploadUrl,
              session.fields,
              new File([bytes], uploadName, { type: 'application/pdf' }),
              (pct) => {
                if (aliveRef.current) setUploadPct(pct);
              },
            );
          } catch {
            toast(UPLOAD_NETWORK_MESSAGE, { type: 'error' });
            return;
          } finally {
            setUploadPct(null);
          }
          if (!uploaded) {
            toast('PDF 업로드에 실패했어요', { type: 'error' });
            return;
          }
          uploadSessionCacheRef.current = { bytes, token: session.uploadToken };
          uploadToken = session.uploadToken;
        }

        const result = await updateSigningTemplateAction({
          templateId: init.templateId,
          name: name.trim(),
          uploadToken,
          fields,
        });
        if (!result.ok) {
          // 서버가 세션 만료를 알려주면 캐시를 버린다 — 다음 클릭이 새 세션으로
          // 전체 시퀀스를 다시 탄다. 그 외 실패는 캐시를 유지해 재사용한다.
          if (result.error === 'UPLOAD_SESSION_EXPIRED' || result.error === 'SNOWSIGN_UPLOAD_EXPIRED') {
            uploadSessionCacheRef.current = null;
          }
          toast(signingErrorMessage(result.error, '템플릿을 저장하지 못했어요'), { type: 'error' });
          return;
        }
        // 업로드가 템플릿으로 소비됐다 — 다음 저장은 새 세션이어야 한다.
        uploadSessionCacheRef.current = null;
        toast('템플릿을 저장했어요');
        onSaved(result.templateId);
        return;
      }

      if (!uploadToken) return;
      const result = await createSigningTemplateAction({ name: name.trim(), uploadToken, fields });
      if (!result.ok) {
        // 서버는 SNOWSIGN_* 쿼터·검증 등 코드를 구분해 돌려준다 — SSOT 로 옮겨 사용자가
        // 원인과 다음 행동을 알 수 있게 한다(알 수 없는 코드만 일반 문구).
        toast(signingErrorMessage(result.error, '템플릿을 저장하지 못했어요'), { type: 'error' });
        return;
      }
      toast('템플릿을 저장했어요');
      onSaved(result.templateId);
    } catch {
      // reject(네트워크 단절)를 여기서 받지 않으면 finally 가 없어 saving 이 영원히
      // true 로 남는다 — 저장 버튼이 죽은 채 굳는 막다른 길(목록 쪽과 같은 독트린).
      toast('템플릿을 저장하지 못했어요', { type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [mode, uploadToken, canSave, name, fields, fileName, onSaved]);

  const hasPdf = pages.length > 0;
  // 작업물이 있으면 취소는 확인을 거친다. 생성: 올린 PDF·배치 필드가 통째로 사라지는
  // 행동. 수정: 기준선(진입 시 주입한 이름·필드)에서 벗어났을 때만 — 필드 배열은
  // 모든 변경이 새 배열이라 레퍼런스 비교가 곧 "손댔는가"다(PDF 교체는 필드 리셋을
  // 유발해 자동 포착).
  const dirty =
    mode === 'edit'
      ? editBaseline !== null &&
        (name !== editBaseline.name || fields !== editBaseline.fields)
      : !!uploadToken || fields.length > 0;

  return (
    // display:contents — 레이아웃에는 참여하지 않는 순수 이벤트 래퍼. PageHeader 는
    // 본문 스크롤 div의 형제라, 드롭 핸들러가 본문에만 있으면 헤더(제목·취소·저장) 위로
    // 놓은 PDF 는 아무 반응 없이 사라진다("드롭존이든 편집 화면 어디든" 약속을 지키려면
    // 두 형제를 함께 덮는 조상이 필요하다).
    <div
      className="contents"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && !uploading) void handleUpload(file);
      }}
    >
      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title={mode === 'edit' ? '수정을 그만둘까요?' : '작성을 그만둘까요?'}
        description={
          mode === 'edit'
            ? '지금까지 고친 이름과 서명칸이 사라져요.'
            : '올린 계약서 PDF와 배치한 서명칸이 사라져요.'
        }
        confirmLabel="그만둘게요"
        // 기본 '닫기'면 두 버튼이 모두 떠나기로 읽힌다 — 이탈 확인창은 명시적 잔류
        // 라벨을 준다(SigningSendModal '계속 작성하기' 독트린).
        cancelLabel={mode === 'edit' ? '계속 수정하기' : '계속 작성하기'}
        variant="danger"
        onConfirm={onCancel}
      />

      <ConfirmDialog
        open={pendingReplaceFile !== null}
        onOpenChange={(o) => !o && setPendingReplaceFile(null)}
        title="계약서 PDF를 바꿀까요?"
        description={`배치한 서명칸 ${fields.length}개가 사라져요. 새 문서에 다시 배치해야 해요.`}
        confirmLabel="바꿀게요"
        variant="danger"
        onConfirm={() => {
          const file = pendingReplaceFile;
          setPendingReplaceFile(null);
          if (file) void doUpload(file);
        }}
      />

      {/* 에디터로 전환돼도 페이지 셸은 유지된다 — 컨텍스트(제목·설명)와 액션(취소·저장)이
          헤더에 고정돼, 문서가 길어져도 저장이 항상 보인다. */}
      <PageHeader
        title={mode === 'edit' ? '계약서 템플릿 수정' : '새 계약서 템플릿'}
        description={
          mode === 'edit'
            ? '서명칸과 이름을 고치거나 PDF를 교체해요. 저장해야 반영돼요.'
            : '계약서 PDF를 올리고 서명칸을 배치해 두면, 딜룸에서 바로 발송할 수 있어요.'
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="text"
              onClick={() => (dirty ? setConfirmCancelOpen(true) : onCancel())}
            >
              취소
            </Button>
            {/* 교체 업로드 중에는 잠근다 — 이전 문서 기준의 canSave 가 살아 있어,
                이때 저장하면 방금 바꾸기로 한 옛 PDF 로 템플릿이 만들어진다.
                수정 모드의 저장은 멀티 MB 업로드가 낀 시퀀스라 진행 라벨이 없으면
                멈춘 줄 안다(WorkspaceNameForm 등 '저장 중…' 패턴). */}
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saving || uploading}
              aria-describedby={!canSave && hasPdf ? 'save-requirements' : undefined}
              onClick={handleSave}
            >
              {saving ? (uploadPct !== null ? `저장 중… ${uploadPct}%` : '저장 중…') : '저장'}
            </Button>
          </div>
        }
      />

      {/* 드롭은 위 래퍼(display:contents)가 헤더까지 포함해 받는다 — 대시 보더에서
          "여기에 놓아라"를 배운 사용자는 교체 파일도 같은 자리에 놓는다. 업로드 전
          (드롭존)·후(파일 행/페이지) 어느 상태든, 화면 어디든 드롭 = 업로드/교체. */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex max-w-[680px] flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label as="label" htmlFor="tpl-name">
              템플릿 이름
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 표준 PG 이용계약서"
              maxLength={SIGNING_TEMPLATE_NAME_MAX}
              className="max-w-[360px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label as="label" htmlFor="tpl-pdf">
              계약서 PDF
            </Label>
            <input
              ref={fileInputRef}
              id="tpl-pdf"
              type="file"
              accept="application/pdf"
              disabled={uploading}
              // sr-only 는 탭 순서에 남는다 — 보이지 않는 1px 요소에 포커스가 멎지
              // 않게 뺀다(키보드 경로는 드롭존·교체 버튼).
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // 값을 비워야 같은 파일을 다시 골랐을 때도 change 가 발화한다 —
                // 실패 후 재시도가 조용히 무시되는 것을 막는다.
                e.target.value = '';
                if (file) void handleUpload(file);
              }}
              className="sr-only"
            />
            {!hasPdf && mode === 'edit' ? (
              // 수정 진입 파싱 중 — 이미 문서가 있는 템플릿에 "올려 주세요" 드롭존을
              // 보여주면 거짓말이다. 파싱은 로컬 바이트라 짧고, 실패는 fail-closed 로
              // 목록에 돌아가므로 이 상태가 오래 남지 않는다.
              <p
                role="status"
                className="animate-pulse py-10 text-center text-[12.5px] text-[var(--md-sys-color-on-surface-variant)]"
              >
                계약서 PDF를 불러오는 중이에요…
              </p>
            ) : !hasPdf ? (
              // 드롭존 — RfpAttachmentDropzone 과 같은 대시 보더 패턴. 업로드 전
              // 화면의 주인공이라 크게 그린다.
              <button
                type="button"
                disabled={uploading}
                data-dragover={dragOver}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={() => setDragOver(false)}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 border border-dashed px-6 py-10 text-center transition-colors hover:bg-[var(--md-sys-color-surface-container-low)] disabled:cursor-not-allowed disabled:opacity-38 disabled:hover:bg-transparent',
                  dragOver
                    ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-low)]'
                    : 'border-[var(--md-sys-color-outline)]',
                )}
              >
                <span
                  aria-hidden
                  className="mb-1 text-[var(--md-sys-color-on-surface-variant)] [&_svg]:size-7 [&_svg]:stroke-[1.5]"
                >
                  <FileSignatureIcon />
                </span>
                <span className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                  계약서 PDF를 올려 주세요
                </span>
                <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  클릭하거나 끌어다 놓아요 · PDF 1개 · 최대{' '}
                  <span className="md-numeric">{SIGNING_TEMPLATE_PDF_MAX_BYTES / 1024 / 1024}MB</span>
                </span>
              </button>
            ) : (
              // 업로드가 끝나면 드롭존은 파일명·쪽수가 담긴 컴팩트한 행으로 줄어든다.
              <div className="flex max-w-[480px] items-center gap-2.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] py-1.5 pl-3 pr-1.5">
                <span
                  aria-hidden
                  className="shrink-0 text-[var(--md-sys-color-on-surface-variant)] [&_svg]:size-4 [&_svg]:stroke-[1.5]"
                >
                  <FileSignatureIcon />
                </span>
                <span className="min-w-0 truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                  {fileName}
                </span>
                <span className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {pages.length}쪽
                </span>
                <span className="ml-auto shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="text"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    다른 파일로 바꾸기
                  </Button>
                </span>
              </div>
            )}
            {/* 수정 진입 파싱 중에는 위 자리 표시자가 이미 같은 말을 한다 — 중복 상태
                리전 방지. */}
            {uploading && !(mode === 'edit' && !hasPdf) && (
              <p
                role="status"
                className="animate-pulse text-[12.5px] text-[var(--md-sys-color-on-surface-variant)]"
              >
                {uploadPct !== null ? (
                  // 업로드 구간 — 바이트 진행률. 퍼센트는 수치라 mono 로 정렬한다.
                  <>
                    PDF를 올리는 중이에요… <span className="md-numeric">{uploadPct}%</span>
                  </>
                ) : (
                  'PDF를 불러오는 중이에요…'
                )}
              </p>
            )}
          </div>

          {hasPdf && (
            // sticky — 10쪽 문서에서 필드 하나 추가할 때마다 맨 위로 돌아가지 않게
            // 페이지 스택 위에 떠 있는다. z-10 은 Rnd 필드(z-auto)·canvas 를 덮는
            // 최소값. 배경이 없으면 스크롤된 페이지 본문이 툴바 글자와 겹쳐 보인다.
            <div
              data-testid="field-toolbar"
              className="sticky top-0 z-10 -my-2 flex flex-col gap-2 bg-[var(--md-sys-color-surface)] py-2"
            >
              <Label as="p" size="lg" muted={false}>
                서명 필드 추가
              </Label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {FIELD_TOOL_PARTIES.map((party) => (
                  <div key={party} className="flex items-center gap-1.5">
                    <Label>{PARTY_LABELS[party]}</Label>
                    {FIELD_TOOL_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-label={fieldLabel(party, type)}
                        disabled={uploading}
                        onClick={() => handleAddField(type, party)}
                        className="h-7 cursor-pointer rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 text-xs text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 disabled:cursor-not-allowed disabled:opacity-38"
                      >
                        {FIELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                ))}
                {pages.length > 1 && (
                  // currentPage 의 키보드 진입점 — hover/click(마우스 전용)만 있으면
                  // 키보드 사용자는 1페이지 밖에 필드를 놓을 수 없다. 같은 state 를
                  // 보므로 마우스 hover 와도 항상 일치한다.
                  <div className="flex items-center gap-1.5">
                    <Label>페이지</Label>
                    <Select
                      ariaLabel="필드를 추가할 페이지"
                      options={pages.map((_, i) => ({
                        value: String(i + 1),
                        label: `${i + 1}페이지`,
                      }))}
                      value={String(currentPage)}
                      onChange={(v) => setCurrentPage(Number(v))}
                      className="w-28"
                    />
                  </div>
                )}
              </div>
              <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                버튼을 누르면 아래 활성 페이지에 필드가 추가돼요. 드래그로 위치·크기를 조절해요.
              </p>
              {!canSave && (
                // 전체 체크리스트는 페이지 스택 아래라 긴 문서에서 저장 버튼과 동시에
                // 보이지 않는다 — 미충족 항목만 압축한 한 줄이 여기(sticky)에 떠서
                // "왜 저장이 안 눌리는가"가 항상 보인다. 같은 checklist 배열에서
                // 파생한다(판정 SSOT 하나). disabled 버튼은 포커스 불가라
                // aria-describedby 는 보조고, 이 보이는 줄이 주 방어다.
                <p
                  id="save-requirements"
                  data-testid="save-requirements"
                  className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]"
                >
                  저장하려면:{' '}
                  {checklist
                    .filter((item) => !item.done)
                    .map((item) => item.label)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}

          {/* 페이지는 scale 1 고유 폭을 그대로 쓴다(좌표계 1:1) — 컬럼보다 넓은
              가로형 문서는 이 래퍼 안에서 가로 스크롤로 흡수한다. */}
          <div ref={pagesContainerRef} className="flex max-w-full flex-col gap-4 overflow-x-auto">
          {pages.map((p, idx) => {
            const pageNumber = idx + 1;
            return (
              <div key={pageNumber} className="space-y-1">
              {/* 어느 페이지에 필드가 떨어지는지 알 수 있어야 한다 — 번호 라벨 + 활성 표시. */}
              <p className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                {pageNumber}페이지
                {pages.length > 1 && pageNumber === currentPage && (
                  <span className="ml-1.5 text-[var(--md-sys-color-primary)]">— 필드가 여기에 추가돼요</span>
                )}
              </p>
              <div
                data-page={pageNumber}
                style={{ position: 'relative', width: p.width, height: p.height }}
                className={
                  pages.length > 1 && pageNumber === currentPage
                    ? 'border border-[var(--md-sys-color-primary)]'
                    : 'border border-[var(--md-sys-color-outline-variant)]'
                }
                onMouseEnter={() => setCurrentPage(pageNumber)}
                onClick={() => setCurrentPage(pageNumber)}
              >
                {/* 페이지 본문 — 위 렌더 effect 가 여기에 그린다. 필드 오버레이(Rnd)보다
                    먼저 렌더돼 항상 아래 레이어다. */}
                <canvas
                  data-page-canvas={pageNumber}
                  width={p.width}
                  height={p.height}
                  aria-hidden="true"
                  className="absolute inset-0"
                />
                {fields
                  .filter((f) => f.pageNumber === pageNumber)
                  .map((f) => {
                    const selected = f.id === selectedFieldId;
                    return (
                      <Rnd
                        key={f.id}
                        size={{ width: f.width, height: f.height }}
                        position={{ x: f.x, y: f.y }}
                        bounds="parent"
                        onDragStop={(_e, d) => setFields((prev) => moveField(prev, f.id, { x: d.x, y: d.y }, p))}
                        onResizeStop={(_e, _dir, ref, _delta, position) =>
                          // 위/왼쪽 핸들 리사이즈는 위치도 함께 움직인다 — position 을
                          // 무시하면 화면과 저장 좌표가 어긋나 서명칸이 페이지 밖으로
                          // 저장된다. moveField 가 새 크기 기준으로 페이지 안에 클램프.
                          setFields((prev) =>
                            moveField(
                              resizeField(prev, f.id, {
                                width: parseInt(ref.style.width, 10),
                                height: parseInt(ref.style.height, 10),
                              }),
                              f.id,
                              position,
                              p,
                            ),
                          )
                        }
                      >
                        <div
                          data-testid="placed-field"
                          data-selected={selected}
                          // Rnd 드래그는 마우스 전용 — 포커스 가능(role=group) +
                          // 화살표 넛지 + Delete 삭제가 키보드 경로다. role=button 을
                          // 못 쓰는 이유: 내부에 삭제 <button> 이 중첩된다.
                          tabIndex={0}
                          role="group"
                          aria-roledescription="이동 가능한 서명 필드"
                          aria-label={`${fieldLabel(f.party, f.type)} 필드, ${f.pageNumber}페이지`}
                          // onFocus 는 focusin 처럼 버블된다 — 내부 삭제 버튼이
                          // 포커스를 받아도 여기로 올라오므로, 필드 자신이 받은
                          // 포커스일 때만 선택한다(삭제 클릭이 선택을 훔치면 안 된다).
                          onFocus={(e) => {
                            if (e.target === e.currentTarget) setSelectedFieldId(f.id);
                          }}
                          onMouseDown={() => setSelectedFieldId(f.id)}
                          onKeyDown={(e) => {
                            // 내부 삭제 버튼에서 올라온 키는 그 버튼의 몫이다.
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Delete' || e.key === 'Backspace') {
                              e.preventDefault();
                              setFields((prev) => removeField(prev, f.id));
                              setSelectedFieldId((prev) => (prev === f.id ? null : prev));
                              return;
                            }
                            const step = e.shiftKey ? 16 : 4;
                            const delta =
                              e.key === 'ArrowLeft'
                                ? { dx: -step, dy: 0 }
                                : e.key === 'ArrowRight'
                                  ? { dx: step, dy: 0 }
                                  : e.key === 'ArrowUp'
                                    ? { dx: 0, dy: -step }
                                    : e.key === 'ArrowDown'
                                      ? { dx: 0, dy: step }
                                      : null;
                            if (!delta) return;
                            // 화살표가 페이지 스크롤로 새지 않게 막는다.
                            e.preventDefault();
                            // 연타는 배칭될 수 있다 — 클로저의 f 가 아니라 prev 에서
                            // 현재 좌표를 다시 읽는다(moveField 가 페이지 안으로 클램프).
                            setFields((prev) => {
                              const cur = prev.find((x) => x.id === f.id);
                              if (!cur) return prev;
                              return moveField(
                                prev,
                                f.id,
                                { x: cur.x + delta.dx, y: cur.y + delta.dy },
                                p,
                              );
                            });
                          }}
                          className={cn(
                            'relative flex h-full w-full items-center justify-between gap-1 bg-[var(--md-sys-color-surface)]/85 px-1 text-[10px] text-[var(--md-sys-color-on-surface)]',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
                            selected
                              ? 'border-[1.5px] border-[var(--md-sys-color-primary)]'
                              : 'border border-[var(--md-sys-color-outline-variant)]',
                          )}
                        >
                          <span className="truncate">{fieldLabel(f.party, f.type)}</span>
                          <button
                            type="button"
                            aria-label={`${fieldLabel(f.party, f.type)} 필드 삭제`}
                            // mousedown 이 바깥 선택 핸들러로 버블되면 삭제가 다른 필드의
                            // 선택을 빼앗은 채 사라진다 — 삭제는 남은 선택을 건드리지 않는다.
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              setFields((prev) => removeField(prev, f.id));
                              setSelectedFieldId((prev) => (prev === f.id ? null : prev));
                            }}
                            // size-6(24px) 히트 타깃 — 글리프 시절(~14px)은 표적이
                            // 너무 작았다. name/date 필드 높이가 24px 라 -my 로
                            // 행 스트레치를 막는다.
                            className="-my-1 flex size-6 shrink-0 cursor-pointer items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                          >
                            <XIcon size={12} />
                          </button>
                          {selected && (
                            // 리사이즈 핸들의 시각 표지 — 실제 핸들은 Rnd 가 가장자리에
                            // 투명하게 깔아 두므로 이 점은 장식이다.
                            <span
                              aria-hidden
                              className="pointer-events-none absolute -bottom-[3px] -right-[3px] size-[7px] bg-[var(--md-sys-color-primary)]"
                            />
                          )}
                        </div>
                      </Rnd>
                    );
                  })}
              </div>
              </div>
            );
          })}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label as="p" size="lg" muted={false}>
              저장하려면
            </Label>
            <ul className="flex flex-col gap-1.5">
              {checklist.map((item) => (
                <li
                  key={item.label}
                  data-testid="save-checklist-item"
                  data-done={item.done}
                  className={cn(
                    'flex items-center gap-2 text-[12.5px]',
                    item.done
                      ? 'text-[var(--md-sys-color-on-surface)]'
                      : 'text-[var(--md-sys-color-on-surface-variant)]',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full',
                      item.done
                        ? 'bg-[var(--md-sys-color-tertiary)]'
                        : 'border-[1.5px] border-[var(--md-sys-color-outline)]',
                    )}
                  >
                    {item.done && (
                      <Check className="size-2.5 text-[var(--md-sys-color-on-tertiary)]" strokeWidth={3} />
                    )}
                  </span>
                  {item.label}
                  {item.done && <span className="sr-only">— 완료</span>}
                </li>
              ))}
            </ul>
          </div>

          {/* 서명 기한 고지 — 계약이 만료돼서야 처음 알면 늦다(재발송은 처음부터 다시 올려야 한다). */}
          <Note>
            이 템플릿으로 보낸 계약은 발송 후{' '}
            <span className="md-numeric">{SIGNING_DEADLINE_DAYS}일</span> 안에 서명해야 해요. 기한이
            지나면 자동으로 만료돼요.
          </Note>
        </div>
      </div>
    </div>
  );
}
