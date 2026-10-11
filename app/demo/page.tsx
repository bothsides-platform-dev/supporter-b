import type { Metadata } from "next";
import { ToasterProvider } from "@/components/shell/Toaster";
import { BuyerDemo } from "@/components/demo/BuyerDemo";

export const metadata: Metadata = {
  title: "구매사 데모 체험 | 서포트비",
  description:
    "견적 요청부터 메시지 상담, 견적 선정, 전자서명과 계약 보관까지 직접 체험해요.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <ToasterProvider>
      <BuyerDemo />
    </ToasterProvider>
  );
}
