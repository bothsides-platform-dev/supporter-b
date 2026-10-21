"use client";
import { useEffect, useRef, useState } from "react";
import { useBuyerDemo } from "@/lib/demo/buyer-demo-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives/Button";
import { Chip } from "@/components/primitives/Chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { underlineInputClass } from "@/components/forms/inputs";
import {
  loadPlatformAgreementAction,
  savePlatformAgreementAction,
  sendPlatformAgreementAction,
} from "@/lib/server/actions/signing/platformAgreementActions";
import {
  PlatformAgreementCompleteSchema,
  type PlatformAgreementView,
} from "@/lib/types/platform-agreement";
import type { SigningView } from "@/lib/types/signing";
import { agreementErrorMessage } from "@/lib/contract-doc/agreement";
import { signingErrorMessage } from "@/lib/signing/error-messages";
const fields = [
  ["company", "상호", 100],
  ["bizNo", "사업자등록번호", 12],
  ["address", "주소", 200],
  ["representative", "대표자명", 50],
] as const;
const dim = "text-[var(--md-sys-color-on-surface-variant)]";
function errorCopy(code: string) {
  return code === "BUYER_PHONE_REQUIRED"
    ? "지정 담당자의 프로필에서 010 휴대폰 번호를 인증해 주세요."
    : code.startsWith("AGREEMENT_")
      ? agreementErrorMessage(code)
      : signingErrorMessage(
          code,
          "합의서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
}
export function PlatformAgreementPanel({ signing }: { signing: SigningView }) {
  const demo = useBuyerDemo();
  const router = useRouter();
  const id = signing.contract.id;
  const status = signing.contract.status;
  const [view, setView] = useState<PlatformAgreementView | null>(null);
  const [buyer, setBuyer] = useState<
    PlatformAgreementView["parties"]["buyer"] | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<{ url: string; stamp: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState(false);
  const url = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    (demo
      ? Promise.resolve(demo.platformAgreement())
      : loadPlatformAgreementAction({ contractId: id })
    )
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          setView(r);
          setBuyer(r.parties.buyer);
        } else setError(errorCopy(r.error));
      })
      .catch(() => {
        if (alive) setError("합의서를 불러오지 못했어요. 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [id, status, reload, demo]);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  const dirty =
    !!buyer &&
    !!view &&
    JSON.stringify(buyer) !== JSON.stringify(view.parties.buyer);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  async function save(withPreview: boolean) {
    if (!view || !buyer) return;
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const input = {
        company: buyer.company,
        bizNo: buyer.bizNo ?? "",
        address: buyer.address ?? "",
        representative: buyer.representative ?? "",
      };
      const saved = await (demo
        ? demo.savePlatformAgreement(input)
        : savePlatformAgreementAction({
            contractId: id,
            revision: view.revision,
            parties: { buyer: input },
          }));
      if (!saved.ok) {
        setError(errorCopy(saved.error));
        return;
      }
      const next = await (demo
        ? demo.platformAgreement()
        : loadPlatformAgreementAction({ contractId: id }));
      if (!next.ok) {
        setError(errorCopy(next.error));
        return;
      }
      setView(next);
      setBuyer(next.parties.buyer);
      setNotice("회사 정보를 저장했어요. 딜룸에서 이어서 진행할 수 있어요.");
      if (withPreview) {
        if (next.error) {
          setError(errorCopy(next.error));
          return;
        }
        const response = await fetch(
          demo
            ? "/landing/demo-agreement.pdf"
            : `/api/signing/agreements/${id}/document?stamp=${encodeURIComponent(next.stamp ?? "")}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          setError(await response.text());
          return;
        }
        const blob = await response.blob();
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob);
        setPreview({ url: url.current, stamp: next.stamp! });
      }
    } catch {
      setError(
        "저장 결과를 확인하지 못했어요. 최신 저장본을 불러온 뒤 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(stamp: string) {
    setConfirm(false);
    setBusy(true);
    setError("");
    try {
      const result = await (demo
        ? demo.requestPlatformSignature()
        : sendPlatformAgreementAction({ contractId: id, stamp }));
      if (!result.ok && result.error !== "ALREADY_SENT")
        setError(errorCopy(result.error));
      else setNotice("서명 요청 이메일을 확인해 주세요.");
      setReload((v) => v + 1);
      router.refresh();
    } catch {
      setError(
        "발송 결과를 확인하지 못했어요. 다시 불러와 발송 상태를 확인해 주세요.",
      );
      setReload((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  if (!view || !buyer)
    return (
      <div className="space-y-3 py-4">
        <p role={error ? "alert" : "status"}>
          {error || "합의서를 불러오는 중이에요…"}
        </p>
        {error && (
          <Button onClick={() => setReload((v) => v + 1)}>다시 불러오기</Button>
        )}
      </div>
    );
  const awaiting = status === "awaiting_pg_template";
  return (
    <section className="space-y-5 py-4" aria-label="노온과의 합의서">
      <header>
        <h2 className="md-title-medium">노온과 장기이용을 약정해요</h2>
        <p className={`mt-2 text-sm ${dim}`}>
          노온이 미리 날인한 합의서에 구매사 담당자만 본인인증 후 서명해요.
        </p>
      </header>
      <p className="text-sm">
        선정 PG사: {view.snapshot.agreement.pgName} · 약정기간은 실제 PG 서비스
        이용 시작일부터 2년이에요.
      </p>
      <p className={`text-sm ${dim}`}>
        약정기간에는 선정 PG사만 이용해요. 조건을 위반하면 실제 할인받은
        수수료를 노온에 반환해요. 자세한 조건은 합의서에서 확인해 주세요.
      </p>
      <section className="space-y-2">
        <h3 className="md-title-small">노온 회사 정보</h3>
        <dl className="space-y-1 text-sm">
          {fields.map(([key, label]) => (
            <div key={key} className="grid grid-cols-[8rem_1fr] gap-3">
              <dt className={dim}>{label}</dt>
              <dd className={key === "bizNo" ? "md-numeric" : ""}>
                {view.parties.platform[key]}
              </dd>
            </div>
          ))}
        </dl>
        <p className={`text-sm ${dim}`}>
          노온의 법인도장은 합의서에 미리 날인되어 있어요.
        </p>
      </section>
      {awaiting && view.editable ? (
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <legend className="md-title-small mb-3">구매사 회사 정보</legend>
          {fields.map(([key, label, max]) => (
            <label key={key} className={`block text-sm ${dim}`}>
              구매사 {label}
              <input
                value={buyer[key] ?? ""}
                maxLength={max}
                className={`${underlineInputClass} ${key === "bizNo" ? "md-numeric" : ""}`}
                onChange={(e) => {
                  setBuyer({ ...buyer, [key]: e.target.value });
                  setPreview(null);
                }}
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="space-y-2 text-sm">
        <h3 className="md-title-small">구매사 서명 담당자</h3>
        <p>
          {view.signer.name} · {view.signer.email}
        </p>
        <p className={dim}>
          이메일로 받은 SnowSign 링크에서 본인인증하고 서명해요.
        </p>
        {view.editable && !view.canSign && (
          <p>
            <a className="underline" href="/settings/profile">
              프로필에서 휴대폰 번호를 인증해 주세요.
            </a>
          </p>
        )}
      </div>
      {view.snapshot.feeRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className={`pb-2 text-left ${dim}`}>
              선정 견적의 수수료 · 부가세 별도
            </caption>
            <thead>
              <tr>
                {["결제수단·등급", "표준 수수료", "할인 폭", "최종 수수료"].map(
                  (t) => (
                    <th key={t} className="p-2 font-medium">
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {view.snapshot.feeRows.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-[var(--md-sys-color-outline-variant)]"
                >
                  <th className="p-2 font-normal">{r.label}</th>
                  <td className="md-numeric p-2">{r.standard}</td>
                  <td className="md-numeric p-2">{r.discount}</td>
                  <td className="md-numeric p-2">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(error || view.error) && (
        <p role="alert" className="text-sm text-[var(--md-sys-color-error)]">
          {error || errorCopy(view.error!)}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {preview && !dirty && (
        <section className="space-y-2" aria-label="날인된 합의서 확인">
          <iframe
            title="날인된 합의서 PDF"
            src={preview.url}
            className="h-[65vh] w-full border border-[var(--md-sys-color-outline-variant)]"
          />
          <a
            href={preview.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            미리보기 새 창 열기
          </a>
        </section>
      )}
      {awaiting && view.editable && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => void save(false)}
          >
            임시 저장
          </Button>
          <Button
            data-coachmark={
              demo && !preview ? "demo-agreement-preview" : undefined
            }
            disabled={
              busy ||
              !PlatformAgreementCompleteSchema.safeParse({ buyer }).success
            }
            onClick={() => void save(true)}
          >
            저장하고 미리보기
          </Button>
          <Button
            data-coachmark={demo && preview ? "demo-agreement-send" : undefined}
            disabled={busy || !preview || dirty || !view.canSign}
            onClick={() => setConfirm(true)}
          >
            서명 요청하기
          </Button>
          <Button
            variant="text"
            disabled={busy}
            onClick={() => setReload((v) => v + 1)}
          >
            최신 저장본 불러오기
          </Button>
        </div>
      )}
      {awaiting && !view.editable && (
        <Button disabled={busy} onClick={() => void send(view.stamp!)}>
          발송 결과 확인하기
        </Button>
      )}
      {!awaiting && (
        <>
          <Chip
            color={status === "completed" ? "tertiary" : "surface"}
            label={
              status === "completed"
                ? "서명 완료"
                : status === "sent" || status === "in_progress"
                  ? "서명 진행 중"
                  : "서명 종료"
            }
          />
          <a
            className="block text-sm underline"
            href={
              demo
                ? "/landing/demo-agreement.pdf"
                : `/api/signing/agreements/${id}/document`
            }
            target="_blank"
            rel="noreferrer"
          >
            보낸 합의서 보기 (새 창)
          </a>
          {status === "completed" && (
            <div className="flex gap-4 text-sm">
              <a
                className="underline"
                href={
                  demo
                    ? "/landing/demo-agreement.pdf"
                    : `/api/signing/${id}/document`
                }
              >
                서명 완료본 다운로드
              </a>
              <a
                className="underline"
                href={
                  demo ? "/landing/demo-audit.pdf" : `/api/signing/${id}/audit`
                }
              >
                감사추적인증서 다운로드
              </a>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="구매사 담당자에게 서명을 요청할까요?"
        description={`${view.signer.email}로 노온이 날인한 합의서를 보내요. 구매사 담당자만 서명해요.`}
        confirmLabel="서명 요청하기"
        onConfirm={() => void send(preview!.stamp)}
      />
    </section>
  );
}
