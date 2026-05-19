/**
 * Shared editorial shell for the 7 outbox emails.
 *
 * DESIGN.md "Korean Editorial Modernism" rules enforced here:
 *   - Pretendard / JetBrains Mono fallback stack (real woff2 self-hosting is
 *     web-only; mail clients fall back to system mono — that's fine).
 *   - All numerics rendered through `<Mono />` use `font-variant-numeric:
 *     tabular-nums` so RFP ids, currencies, dates align by digit.
 *   - 1px hairlines via `<hr style="border:0;border-top:1px solid #ddd" />`.
 *     No filled status badges, no purple/blue gradients, no glassmorphism,
 *     no rounded corners > 12px.
 *
 * The layout is deliberately plain inline-styled HTML — react-email's
 * components are not imported because mail clients render this anyway and
 * we want a tight token surface. If we add `@react-email/components` later
 * we can refactor without touching template content.
 */
import * as React from 'react';

const SANS_STACK =
  "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";
const MONO_STACK =
  "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

export const HAIRLINE = (
  <hr style={{ border: 0, borderTop: '1px solid #ddd', margin: '20px 0' }} />
);

// Inline numeric — all currencies / RFP ids / dates / counts go through this.
export function Mono({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      style={{
        fontFamily: MONO_STACK,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  );
}

// Editorial section serial — `01 / 14` style.
export function Marker({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      style={{
        fontFamily: MONO_STACK,
        fontSize: '11px',
        letterSpacing: '0.08em',
        color: '#777',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

// Primary action button — solid ink, 5px radius (well under the 12px ceiling).
// Inline styles are duplicated rather than abstracted so mail clients that
// strip <style> tags still render correctly.
export function Button({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        padding: '10px 18px',
        backgroundColor: '#111',
        color: '#fff',
        textDecoration: 'none',
        fontFamily: SANS_STACK,
        fontSize: '14px',
        borderRadius: '5px',
      }}
    >
      {children}
    </a>
  );
}

export interface LayoutProps {
  preheader?: string;
  serial?: string;
  children: React.ReactNode;
}

export function Layout({
  preheader,
  serial,
  children,
}: LayoutProps): React.JSX.Element {
  return (
    // This file renders standalone email HTML, not a Next.js page — the
    // <html>/<head>/<body> tags are the email document, not Next routing.
    <html lang="ko">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>SUPPORTER B</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: '24px',
          backgroundColor: '#fafafa',
          fontFamily: SANS_STACK,
          color: '#222',
          lineHeight: 1.6,
        }}
      >
        {preheader ? (
          // Preheader — shown by some mail clients in the inbox preview but
          // hidden in the rendered body.
          <div
            style={{
              display: 'none',
              overflow: 'hidden',
              maxHeight: 0,
              maxWidth: 0,
              opacity: 0,
            }}
          >
            {preheader}
          </div>
        ) : null}

        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ maxWidth: 560, margin: '0 auto' }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  backgroundColor: '#fff',
                  padding: '32px',
                  border: '1px solid #eee',
                  borderRadius: '5px',
                }}
              >
                {/* Wordmark header */}
                <div
                  style={{
                    fontFamily: MONO_STACK,
                    fontSize: '14px',
                    letterSpacing: '0.18em',
                    fontWeight: 600,
                  }}
                >
                  SUPPORTER B
                </div>
                {serial ? (
                  <div style={{ marginTop: '4px' }}>
                    <Marker>{serial}</Marker>
                  </div>
                ) : null}

                {HAIRLINE}

                {children}

                {HAIRLINE}

              </td>
            </tr>
            <tr>
              <td
                style={{
                  padding: '16px 8px 0',
                  fontFamily: MONO_STACK,
                  fontSize: '11px',
                  color: '#999',
                }}
              >
                SUPPORTER B · 본 메일은 발신 전용입니다.
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
