'use client';

import { motion } from 'motion/react';

export const FAQ_ITEMS = [
  {
    q: 'SupporterB 도입 수수료가 있나요?',
    a: 'SupporterB는 현재(2026년) 무료로 이용 가능합니다. 추후 유료로 전환될 수 있으며, 전환 2달 전 사전 공유 예정입니다.',
  },
  {
    q: '어떤 PG사 이용이 가능한가요?',
    a: '현재 국내 모든 PG사 수수료 견적을 받을 수 있습니다. 다만, 개별 PG사 사정에 따라 최종 수수료 견적에는 제한이 있을 수 있습니다.',
  },
  {
    q: '기능 건의 / 문의 사항이 있어요.',
    a: '홈페이지 우측 하단 채널톡을 통해 문의 또는 기능 요청을 주시면, 일주일 이내에 내부 검토 후 서비스 업데이트 여부를 안내드리겠습니다.',
  },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// 접지 않고 항상 펼친 상태로 큼직하게 노출한다.
export function FaqList() {
  return (
    <div className="flex flex-col">
      {FAQ_ITEMS.map((item, i) => (
        <motion.div
          key={item.q}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.36, delay: i * 0.08, ease: EASE_OUT }}
          className="flex flex-col gap-[var(--s-3)] border-t border-[var(--md-sys-color-outline-variant)] py-[var(--s-8)] first:border-t-0 first:pt-0"
        >
          <h3 className="text-[clamp(18px,2.4vw,24px)] leading-[1.3] tracking-[-0.014em] font-medium text-[var(--md-sys-color-on-surface)]">
            {item.q}
          </h3>
          <p className="text-[clamp(15px,1.8vw,18px)] leading-[1.7] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
            {item.a}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
