import * as React from 'react';
import { render } from '@react-email/render';

import { Layout } from './_layout';
import type { ChatMessageProps } from './types';

export function ChatMessage({
  senderName,
  preview,
  conversationUrl,
  count,
}: ChatMessageProps): React.JSX.Element {
  // Digest phrasing: 2+ unread → "새 메시지 N건". 1 or omitted → single-message
  // copy (preserves the original mail when there's nothing to coalesce).
  const isDigest = typeof count === 'number' && count >= 2;
  return (
    <Layout
      preheader={
        isDigest
          ? `${senderName}님이 새 메시지 ${count}건을 보냈어요.`
          : `${senderName}님이 새 메시지를 보냈어요.`
      }
      serial="메시지"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        새 메시지가 도착했어요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        {isDigest ? (
          <>
            <strong>{senderName}</strong>님이 새 메시지{' '}
            <strong>{count}건</strong>을 보냈어요.
          </>
        ) : (
          <>
            <strong>{senderName}</strong>님이 메시지를 보냈어요.
          </>
        )}
      </p>
      <p
        style={{
          margin: '0 0 24px',
          fontSize: '14px',
          color: '#333',
          padding: '12px 16px',
          background: '#f6f6f6',
          borderRadius: '6px',
        }}
      >
        {preview}
      </p>
      <p style={{ fontSize: '13px', color: '#555' }}>
        <a href={conversationUrl}>메시지함에서 대화를 이어가 보세요.</a>
      </p>
    </Layout>
  );
}

export async function renderChatMessage(props: ChatMessageProps): Promise<string> {
  return render(<ChatMessage {...props} />);
}
