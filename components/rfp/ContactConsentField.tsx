import {
  CONTACT_CONSENT_VERSION,
  contactConsentText,
  hasContactConsent,
  type ContactConsent,
} from '@/lib/rfp/assignment';
export function ContactConsentField({
  pg,
  consent,
  onChange,
}: {
  pg: { pgWorkspaceId: string; name: string };
  consent?: ContactConsent;
  onChange: (value?: ContactConsent) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-[14px]">
      <input
        type="checkbox"
        className="mt-1"
        checked={hasContactConsent(consent, pg.pgWorkspaceId)}
        onChange={(e) =>
          onChange(
            e.target.checked ? { pgId: pg.pgWorkspaceId, version: CONTACT_CONSENT_VERSION } : undefined,
          )
        }
      />
      {contactConsentText(pg.name)}
    </label>
  );
}
