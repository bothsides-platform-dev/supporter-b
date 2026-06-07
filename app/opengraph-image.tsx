import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'Supporter B — PG사 비교 견적 플랫폼';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  const fontData = await readFile(
    join(process.cwd(), 'public/fonts/PretendardVariable.woff2'),
  );

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px',
          height: '630px',
          background: '#faf7f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '56px' }}>
          {/* Logo icon */}
          <div style={{ display: 'flex', position: 'relative', width: '120px', height: '120px' }}>
            <div
              style={{
                position: 'absolute',
                left: '0px',
                top: '4px',
                width: '28px',
                height: '112px',
                background: '#0a0a0f',
                borderRadius: '14px',
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: '0px',
                top: '10px',
                width: '96px',
                height: '96px',
                background: '#0a0a0f',
                borderRadius: '50%',
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '22px',
                top: '0px',
                width: '18px',
                height: '120px',
                background: '#faf7f0',
                display: 'flex',
              }}
            />
          </div>

          {/* Text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                fontSize: '80px',
                fontWeight: '700',
                color: '#0a0a0f',
                letterSpacing: '-1.5px',
                lineHeight: 1,
                fontFamily: 'Pretendard',
              }}
            >
              Supporter B
            </div>
            <div
              style={{
                fontSize: '26px',
                color: '#999999',
                fontWeight: '400',
                fontFamily: 'Pretendard',
              }}
            >
              결제대행사 비공개 RFQ 플랫폼
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Pretendard',
          data: fontData,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Pretendard',
          data: fontData,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  );
}
