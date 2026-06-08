import { Accordion, AccordionItem } from '@/components/ui/accordion';

const FAQ_ITEMS = [
  {
    value: 'fee',
    q: 'SupporterB 도입 수수료가 있나요?',
    a: 'SupporterB는 현재(2026년) 무료로 이용 가능합니다. 추후 유료로 전환될 수 있으며, 전환 2달 전 사전 공유 예정입니다.',
  },
  {
    value: 'pg-coverage',
    q: '어떤 PG사 이용이 가능한가요?',
    a: '현재 국내 모든 PG사 수수료 견적을 받을 수 있습니다. 다만, 개별 PG사 사정에 따라 최종 수수료 견적에는 제한이 있을 수 있습니다.',
  },
  {
    value: 'support',
    q: '기능 건의 / 문의 사항이 있어요.',
    a: '홈페이지 우측 하단 채널톡을 통해 문의 또는 기능 요청을 주시면, 일주일 이내에 내부 검토 후 서비스 업데이트 여부를 안내드리겠습니다.',
  },
] as const;

export function FaqAccordion() {
  return (
    <Accordion>
      {FAQ_ITEMS.map((item) => (
        <AccordionItem key={item.value} value={item.value} title={item.q}>
          <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
            {item.a}
          </p>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
