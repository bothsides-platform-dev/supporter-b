'use client';

import { useState } from 'react';

import { Button } from '@/components/primitives/Button';
import { Checkbox } from '@/components/primitives/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CONTRACT_CONSENT_TEXTS,
  CONTRACT_CONSENT_TEXT_VERSION,
  type ContractSignatureMethod,
} from '@/lib/types/contract-doc';

import { SignaturePad, type SignaturePadValue } from './SignaturePad';

export type SignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docCode: string;
  docTitle: string;
  signerName: string;
  submitting?: boolean;
  onSubmit: (payload: { imageDataUrl: string; method: ContractSignatureMethod }) => void | Promise<void>;
};

const CONFIRM_ID = 'contract-confirm-read';
const AGREE_ID = 'contract-agree-consent';

function ConsentRow({
  id,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <span className="text-[13px] leading-snug text-[var(--md-sys-color-on-surface-variant)]">
        {children}
      </span>
    </label>
  );
}

export function SignDialog({
  open,
  onOpenChange,
  docCode,
  docTitle,
  signerName,
  submitting = false,
  onSubmit,
}: SignDialogProps) {
  const [value, setValue] = useState<SignaturePadValue>({ imageDataUrl: null, method: 'draw' });
  const [confirmedRead, setConfirmedRead] = useState(false);
  const [agreedConsent, setAgreedConsent] = useState(false);

  const consentText = CONTRACT_CONSENT_TEXTS[CONTRACT_CONSENT_TEXT_VERSION];
  const canSubmit = Boolean(value.imageDataUrl) && confirmedRead && agreedConsent && !submitting;

  const handleSubmit = () => {
    if (!value.imageDataUrl || !confirmedRead || !agreedConsent || submitting) return;
    void onSubmit({ imageDataUrl: value.imageDataUrl, method: value.method });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>전자서명</DialogTitle>
          <DialogDescription>
            <span className="md-numeric">{docCode}</span>
            <span className="mx-1.5">·</span>
            <span>{docTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            계약서 내용을 확인한 뒤 서명해 주세요.
          </p>

          <SignaturePad name={signerName} onChange={setValue} />

          <div className="space-y-3">
            <ConsentRow
              id={CONFIRM_ID}
              checked={confirmedRead}
              onCheckedChange={setConfirmedRead}
            >
              계약서 내용을 모두 확인했어요
            </ConsentRow>

            <div className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3">
              <p className="text-[12px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                {consentText}
              </p>
            </div>

            <ConsentRow id={AGREE_ID} checked={agreedConsent} onCheckedChange={setAgreedConsent}>
              위 내용에 동의해요
            </ConsentRow>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outlined" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button variant="filled" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? '서명 처리 중…' : '서명 완료'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
