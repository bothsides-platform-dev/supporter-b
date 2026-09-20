import { render } from '@react-email/render';
import { Button, Layout } from './_layout';
import { baseUrlFor } from '@/lib/server/env';

export async function renderMatchingEnded(code: string, pgName: string, reason: string) {
  return render(<Layout preheader="상담 결과를 확인하고 다음 PG사에 요청해주세요." serial={`상담 결과 / ${code}`}>
    <h1 style={{ fontSize: 20 }}>PG사 상담 결과가 도착했어요</h1>
    <p>{pgName}에서 이번 상담을 마쳤어요.</p>
    <p style={{ whiteSpace: 'pre-wrap' }}>{reason}</p>
    <p>다음 PG사 추천 결과를 확인하고 상담을 이어갈 수 있어요.</p>
    <Button href={`${baseUrlFor('buyer')}/rfp/${code}`}>상담 결과 확인하기</Button>
  </Layout>);
}
