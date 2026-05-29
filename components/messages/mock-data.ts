// 메시지함 목 데이터 — 렌더 전용(백엔드 미구현).
// RFP별 비공개 스레드 모델: 각 대화 = 한 RFP 내 상대방(구매사↔PG)과의 스레드.
// 상대방은 항상 '보는 사람의 반대편' — 구매사가 보면 PG 목록, PG가 보면 구매사 목록.
import type { WorkspaceType } from '@/lib/types/workspace';
import type { Counterparty, RfpContext } from './types';

export type MockMessage = {
  id: string;
  sender: 'self' | 'other';
  body: string;
  /** 표시용 상대 시각 라벨(목). */
  time: string;
};

export type MockConversation = {
  id: string;
  counterparty: Counterparty;
  rfp: RfpContext;
  preview: string;
  time: string;
  unread: boolean;
  messages: MockMessage[];
};

// 구매사 시점 — 상대는 PG(결제대행사).
const BUYER_VIEW: MockConversation[] = [
  {
    id: 'c1',
    counterparty: { name: '에이페이먼츠', type: 'pg' },
    rfp: { code: 'RFP-2026-001', title: '온라인몰 결제대행 선정' },
    preview: '카드 수수료 관련해서 추가 안내드립니다.',
    time: '2시간 전',
    unread: true,
    messages: [
      { id: 'm1', sender: 'self', body: '제안서 잘 받았습니다. 검토 중입니다.', time: '오전 10:12' },
      { id: 'm2', sender: 'other', body: '감사합니다. 추가 자료 필요하시면 말씀해주세요.', time: '오전 10:20' },
      { id: 'm3', sender: 'other', body: '카드 수수료 관련해서 추가 안내드립니다.', time: '오전 11:05' },
    ],
  },
  {
    id: 'c2',
    counterparty: { name: '비즈페이', type: 'pg' },
    rfp: { code: 'RFP-2026-002', title: '정기결제 PG 전환' },
    preview: '정산 한도 조건 정리해 보냈습니다.',
    time: '어제',
    unread: false,
    messages: [
      { id: 'm1', sender: 'other', body: '요청하신 정산 한도 조건 정리해 보냈습니다.', time: '어제 오후 3:40' },
      { id: 'm2', sender: 'self', body: '확인했습니다. 감사합니다.', time: '어제 오후 4:02' },
    ],
  },
  {
    id: 'c3',
    counterparty: { name: '씨페이먼츠', type: 'pg' },
    rfp: { code: 'RFP-2026-003', title: '해외결제 지원 RFP' },
    preview: '해외 카드 수수료율 안내드립니다.',
    time: '3일 전',
    unread: false,
    messages: [
      { id: 'm1', sender: 'other', body: '해외 카드 수수료율 안내드립니다.', time: '월요일 오전 9:30' },
    ],
  },
];

// PG 시점 — 상대는 구매사(가맹점).
const PG_VIEW: MockConversation[] = [
  {
    id: 'c1',
    counterparty: { name: '(주)샘플테크', type: 'buyer' },
    rfp: { code: 'RFP-2026-001', title: '온라인몰 결제대행 선정' },
    preview: '카드 수수료 관련해서 추가 문의드립니다.',
    time: '2시간 전',
    unread: true,
    messages: [
      { id: 'm1', sender: 'other', body: '안녕하세요, 제안 잘 받았습니다.', time: '오전 10:12' },
      { id: 'm2', sender: 'self', body: '감사합니다. 검토해주셔서 감사합니다.', time: '오전 10:20' },
      { id: 'm3', sender: 'other', body: '카드 수수료 관련해서 추가 문의드립니다.', time: '오전 11:05' },
    ],
  },
  {
    id: 'c2',
    counterparty: { name: '(주)다른상점', type: 'buyer' },
    rfp: { code: 'RFP-2026-002', title: '정기결제 PG 전환' },
    preview: '제안서 확인했습니다. 감사합니다.',
    time: '어제',
    unread: false,
    messages: [
      { id: 'm1', sender: 'self', body: '요청하신 정산 한도 조건 정리해 보냈습니다.', time: '어제 오후 3:40' },
      { id: 'm2', sender: 'other', body: '제안서 확인했습니다. 감사합니다.', time: '어제 오후 4:02' },
    ],
  },
  {
    id: 'c3',
    counterparty: { name: '(주)그린마켓', type: 'buyer' },
    rfp: { code: 'RFP-2026-004', title: '신규 가맹점 PG 계약' },
    preview: '계약 조건 검토 후 회신드리겠습니다.',
    time: '3일 전',
    unread: false,
    messages: [
      { id: 'm1', sender: 'other', body: '계약 조건 검토 후 회신드리겠습니다.', time: '월요일 오전 9:30' },
    ],
  },
];

export function getMockConversations(viewerType: WorkspaceType): MockConversation[] {
  return viewerType === 'buyer' ? BUYER_VIEW : PG_VIEW;
}
