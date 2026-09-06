import { defineAsyncSingleton } from '@/lib/server/_singleton';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { logger } from '@/lib/observability/logger';
import { captureSigningError } from '@/lib/server/signing/observability';
import {
  ARCHIVE_DOWNLOAD_TTL_SECONDS,
  BACKFILL_BUDGET_PER_RUN,
  HYDRATE_BUDGET_PER_RUN,
  MAX_ARCHIVE_DOC_BYTES,
  MAX_HYDRATE_ATTEMPTS,
} from '@/lib/contract-archive/limits';
import type { Storage } from '@/lib/server/storage';
import type { SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type {
  BidRepo,
  ContractArchiveRepo,
  RfpRepo,
  SigningContractRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import type { ContractArchive } from '@/lib/types/contract-archive';
import type { Actor, ServiceResult } from './types'; // 서비스 레이어 공용 타입 (contract-signing 과 동일)

function signingKeys(signingContractId: string) {
  const base = `contract-archives/signing/${signingContractId}`;
  return { documentKey: `${base}/document.pdf`, auditKey: `${base}/audit.pdf` };
}

/** provider 다운로드 fetch 데드라인 — snowsign-client 의 15초 관례를 미러. */
const ARCHIVE_FETCH_TIMEOUT_MS = 15_000;

function isPrivateAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(normalized) === 6) {
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      (mappedIpv4 !== null && isPrivateAddress(mappedIpv4[1]))
    );
  }
  return true;
}

async function assertArchiveFetchTarget(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('ARCHIVE_INSECURE_URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('ARCHIVE_INSECURE_URL');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) !== 0 && isPrivateAddress(hostname)) {
    throw new Error('ARCHIVE_PRIVATE_ADDRESS');
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('ARCHIVE_PRIVATE_ADDRESS');
  }
  return url;
}

/**
 * content-length 사전 게이트 + 스트리밍 실바이트 캡을 강제하는 fetch.
 *
 * content-length 만으로는 캡이 아니다 — chunked 응답(Transfer-Encoding:
 * chunked)은 헤더 자체가 없어 `declared`가 0으로 사전 게이트를 그냥
 * 통과한다. 그래서 본문을 `arrayBuffer()`로 통째로 받는 대신 reader로
 * 청크 누적하며 매 청크마다 누적 바이트를 캡과 비교, 넘는 순간 즉시
 * `reader.cancel()` 하고 던진다 — 30MB 캡이라도 전체를 다 받은 뒤 잘라내면
 * 그 순간까지 메모리를 무제한으로 먹는 축이 남는다.
 */
async function fetchCapped(url: string, cap: number): Promise<Buffer> {
  // 이 fetch 는 **우리 VM 의 네트워크 위치**에서 나간다(앞선 공급자 문서 경로들은
  // 전부 사용자 브라우저를 302 로 보냈다). 받은 바이트는 R2 에 저장돼 양측에
  // '완료된 계약서'로 제공되므로, 최소한 전송 구간은 신뢰할 수 있어야 한다.
  // 호스트 핀은 걸지 않는다 — 완료본 URL 은 API 호스트가 아니라 S3 presigned 라
  // 열거할 수 없는 호스트다(그래서 템플릿 PDF 도 302 대신 프록시한다).
  const target = await assertArchiveFetchTarget(url);
  const res = await fetch(target, {
    redirect: 'manual',
    signal: AbortSignal.timeout(ARCHIVE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ARCHIVE_FETCH_${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > cap) throw new Error('ARCHIVE_DOC_TOO_LARGE');
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new Error('ARCHIVE_DOC_TOO_LARGE');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export class ContractArchiveService {
  constructor(
    private readonly archiveRepo: ContractArchiveRepo,
    private readonly signingRepo: SigningContractRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly bidRepo: BidRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly snowsign: SnowSignClient,
    // 지연 해석 — 행 생성 경로는 스토리지가 필요 없으므로(R2 env 없는 테스트
    // 환경에서 getStorage() throw 를 피한다) 하이드레이션 시점에만 부른다.
    private readonly getStorageFn: () => Storage,
  ) {}

  /**
   * 완료 계약의 양쪽 워크스페이스 pending 행 생성(멱등 — 유니크 onConflictDoNothing).
   * ensureFinalized 커밋 직후 best-effort 호출 + 백필 스윕이 재호출한다.
   */
  async createPendingForContract(signingContractId: string): Promise<ServiceResult> {
    const found = await this.signingRepo.findById(signingContractId);
    if (!found || found.contract.status !== 'completed') {
      return { ok: false, error: 'NOT_COMPLETED' };
    }
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    if (!rfp?.awardedBidId) return { ok: false, error: 'RFP_NOT_FOUND' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };
    const [buyerWs, pgWs] = await Promise.all([
      this.workspaceRepo.findById(rfp.buyerWsId),
      this.workspaceRepo.findById(bid.pgWsId),
    ]);
    const contractedAt = found.contract.completedAt
      ? new Date(found.contract.completedAt)
      : null;
    await this.archiveRepo.insertPendingSigningPair([
      {
        workspaceId: rfp.buyerWsId,
        signingContractId,
        rfpCode: rfp.code,
        title: rfp.title,
        counterpartyName: pgWs?.name ?? null,
        contractedAt,
      },
      {
        workspaceId: bid.pgWsId,
        signingContractId,
        rfpCode: rfp.code,
        title: rfp.title,
        counterpartyName: buyerWs?.name ?? null,
        contractedAt,
      },
    ]);
    return { ok: true };
  }

  /** cron 스텝 ① — pending(signing) 계약을 오래된 순으로 하이드레이션. */
  async hydratePending(
    limit = HYDRATE_BUDGET_PER_RUN,
  ): Promise<ServiceResult<{ hydrated: number; failed: number; orphanedRows: number }>> {
    // 고아(providerRef 를 영영 회복 못 하는 pending — signing 행이 SET NULL 로
    // 죽은 경우) 정리는 루프 밖에서 한 번에: repo 가 SQL 단에서 처리하는 게
    // 스캔 자체를 아예 하지 않는(findPendingSigningGroups 가 이미 제외) 것보다
    // 싸고, 루프 안에서 매 건 판정하면 정상 건까지 매번 조인 비용을 문다.
    //
    // `orphanedRows` 는 의도적으로 `failed`(계약 단위)와 분리한다 — 고아 행은
    // signing_contract_id 가 이미 NULL(SET NULL FK)이라 "계약 하나당 몇 건"으로
    // 환산할 근거가 없다(정상적으로는 buyer/pg 2행이 짝이지만 한쪽만 고아가 될
    // 수도 있어 짝 가정도 못 한다). 행 단위 그대로 노출하는 것이 정직하다.
    const orphanedRows = await this.archiveRepo.failOrphanedSigningPending(new Date());
    if (orphanedRows > 0) {
      logger.warn('archive.hydrate_orphaned', { orphanedRows });
    }
    const groups = await this.archiveRepo.findPendingSigningGroups(limit);
    let hydrated = 0;
    let failed = 0; // 계약 단위 — orphanedRows 와 합산하지 않는다.
    for (const g of groups) {
      const found = await this.signingRepo.findById(g.signingContractId);
      const providerRef = found?.contract.providerRef;
      if (!providerRef) {
        // 방어적 유지 — 위 스윕과 이 조회 사이의 경합 창에서 signing 행이 막
        // 죽었을 수 있다(그룹 조회 이후 벌어진 SET NULL). 스윕은 루프 진입
        // "직전" 스냅샷일 뿐이라 이 분기 없이는 providerRef undefined 로
        // downloadUrl 을 호출해 정체불명 오류를 낸다.
        await this.archiveRepo.markSigningFailed(g.signingContractId, new Date());
        // 일괄 스윕(`archive.hydrate_orphaned`)과 **다른 사건**이라 이름을 나눈다 —
        // 한 이름에 두 페이로드가 섞이면 Axiom 에서 어느 쪽도 셀 수 없다.
        logger.warn('archive.hydrate_orphaned_race', {
          signingContractId: g.signingContractId,
        });
        failed += 1;
        continue;
      }
      try {
        const storage = this.getStorageFn();
        const keys = signingKeys(g.signingContractId);
        // 완료본을 **받는 즉시 저장하고 참조를 놓는다** — 인증서를 받기 전에 비워야
        // 30MB 버퍼 둘이 동시에 살지 않는다. 단일 fork + max_memory_restart 1G 라
        // 이 피크는 모든 사용자에게 청구된다.
        const doc = await this.snowsign.downloadUrl(providerRef);
        let docSize = 0;
        {
          const docBytes = await fetchCapped(doc.downloadUrl, MAX_ARCHIVE_DOC_BYTES);
          docSize = docBytes.byteLength;
          await storage.save(keys.documentKey, docBytes, 'application/pdf');
        }
        const audit = await this.snowsign.auditCertificateUrl(providerRef);
        const auditBytes = await fetchCapped(audit.downloadUrl, MAX_ARCHIVE_DOC_BYTES);
        await storage.save(keys.auditKey, auditBytes, 'application/pdf');
        await this.archiveRepo.markSigningReady(g.signingContractId, {
          documentKey: keys.documentKey,
          documentName: doc.filename ?? `계약서_${g.rfpCode ?? g.signingContractId}.pdf`,
          documentSize: docSize,
          auditKey: keys.auditKey,
          auditName: audit.filename ?? `감사추적인증서_${g.rfpCode ?? g.signingContractId}.pdf`,
        });
        hydrated += 1;
      } catch (e) {
        const at = new Date();
        if (g.attempts + 1 >= MAX_HYDRATE_ATTEMPTS) {
          await this.archiveRepo.markSigningFailed(g.signingContractId, at);
          captureSigningError('archive.hydrate_failed_final', e, {
            contractId: g.signingContractId,
          });
          failed += 1;
        } else {
          await this.archiveRepo.recordSigningAttempt(g.signingContractId, at);
          logger.warn('archive.hydrate_retry', {
            signingContractId: g.signingContractId,
            attempt: g.attempts + 1,
            err: String(e),
          });
        }
      }
    }
    return { ok: true, hydrated, failed, orphanedRows };
  }

  /** cron 스텝 ② — 행 생성 유실 자가치유 + 과거 완료 건 백필(같은 경로). */
  async backfillMissing(
    limit = BACKFILL_BUDGET_PER_RUN,
  ): Promise<ServiceResult<{ created: number }>> {
    const ids = await this.archiveRepo.findCompletedContractsMissingArchive(limit);
    let created = 0;
    for (const id of ids) {
      // 계약 단위 격리 — 하나가 **던져도** 나머지 배치를 중단시키지 않는다.
      // 후보는 completedAt asc 라, 격리가 없으면 결정적으로 던지는 한 건이 뒤에
      // 줄선 전부를 영구히 막는다(재시도 마커가 없어 스스로 빠지지도 못한다).
      try {
        const r = await this.createPendingForContract(id);
        if (r.ok) created += 1;
        else logger.warn('archive.backfill_skip', { signingContractId: id, error: r.error });
      } catch (e) {
        logger.warn('archive.backfill_threw', { signingContractId: id, err: String(e) });
      }
    }
    return { ok: true, created };
  }

  /** 보관함 목록 — 행 소유 워크스페이스만. */
  async listForWorkspace(actor: Actor): Promise<ServiceResult<{ rows: ContractArchive[] }>> {
    const rows = await this.archiveRepo.listByWorkspace(actor.workspaceId);
    return { ok: true, rows };
  }

  /**
   * 보관 문서 다운로드용 presigned GET URL.
   *
   * ACL 의 SSOT 는 **행 소유 워크스페이스** 하나다(`deleteUpload` 과 같은 규약).
   * 서명 계약의 당사자 판정을 다시 하지 않는 이유: 보관함 행은 이미 당사자별로
   * 갈라 만들어졌고, 판정을 둘로 두면 갈릴 수 있다. 남의 행에는 FORBIDDEN 이
   * 아니라 **NOT_FOUND** 를 낸다 — 상태 코드가 존재 오라클이 되지 않게(`getForActor`
   * 의 ACL-먼저 규율과 같은 이유).
   */
  async getDownloadUrl(
    id: string,
    doc: 'document' | 'audit',
    actor: Actor,
  ): Promise<ServiceResult<{ url: string }>> {
    const row = await this.archiveRepo.findById(id);
    if (!row || row.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    // pending 은 아직 R2 에 바이트가 없다 — URL 을 내주면 404 로 가는 링크가 된다.
    if (row.status !== 'ready') return { ok: false, error: 'ARCHIVE_NOT_READY' };

    const key = doc === 'audit' ? row.auditKey : row.documentKey;
    const name = doc === 'audit' ? row.auditName : row.documentName;
    // 수동 업로드에는 인증서가 없다. 없는 것을 완료본으로 대신 내주면 사용자는
    // 인증서라고 믿는 다른 문서를 받는다 — 폴백 금지.
    if (!key) return { ok: false, error: 'ARCHIVE_DOC_NOT_FOUND' };

    const url = await this.getStorageFn().presignGet(key, {
      filename: name ?? `${doc}.pdf`,
      mime: 'application/pdf',
      expiresInSeconds: ARCHIVE_DOWNLOAD_TTL_SECONDS,
    });
    return { ok: true, url };
  }

  /** 수동 업로드 삭제 — 행 소유 + source='upload' 만. R2 객체도 지운다. */
  async deleteUpload(id: string, actor: Actor): Promise<ServiceResult> {
    const row = await this.archiveRepo.findById(id);
    if (!row || row.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    if (row.source !== 'upload') return { ok: false, error: 'ARCHIVE_NOT_DELETABLE' };
    if (row.documentKey) {
      await this.getStorageFn()
        .delete(row.documentKey)
        .catch(() => {});
    }
    await this.archiveRepo.removeUpload(id);
    return { ok: true };
  }
}

// ─── Factory (lib/server/_singleton.ts) ─────────────────────────────────────
// __setContractArchiveServiceForTest 는 테스트 전용 — ensureFinalized 훅 검증 등에서
// 가짜 서비스를 주입한다. (구조분해 요소 위의 JSDoc 은 타입 선언에서 사라지므로 여기에.)

export const {
  get: getContractArchiveService,
  set: __setContractArchiveServiceForTest,
  reset: __resetContractArchiveServiceForTest,
} = defineAsyncSingleton('contract_archive_service', 'service', async () => {
  const [
    { getContractArchiveRepo, getSigningContractRepo, getRfpRepo, getBidRepo, getWorkspaceRepo },
    { getSnowSignClient },
    { getStorage },
  ] = await Promise.all([
    import('@/lib/server/repositories/factory'),
    import('@/lib/server/signing/snowsign-client'),
    import('@/lib/server/storage'),
  ]);
  const [archiveRepo, signingRepo, rfpRepo, bidRepo, wsRepo] = await Promise.all([
    getContractArchiveRepo(),
    getSigningContractRepo(),
    getRfpRepo(),
    getBidRepo(),
    getWorkspaceRepo(),
  ]);
  return new ContractArchiveService(
    archiveRepo,
    signingRepo,
    rfpRepo,
    bidRepo,
    wsRepo,
    getSnowSignClient(),
    getStorage,
  );
});
