import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';
it.each(['demo-agreement.pdf','demo-audit.pdf'])('공개 %s는 노온과 구매사의 효력 없는 체험용 문서다',async name=>{
 const bytes=new Uint8Array(await readFile(`public/landing/${name}`));
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:bytes.slice(),useSystemFonts:false});
 const doc=await task.promise;let text='';
 for(let i=1;i<=doc.numPages;i++) {const page=await doc.getPage(i);text+=(await page.getTextContent()).items.map(v=>'str'in v?v.str:'').join(' ');}
 await task.destroy();
 expect(text).toContain('주식회사 노온');expect(text).toContain('체험 구매사');expect(text).toContain('효력이 없습니다');expect(text).toContain('SAMPLE');
 const pdf=await PDFDocument.load(bytes);
 const images=pdf.context.enumerateIndirectObjects().filter(([,v])=>'dict'in v&&v.dict instanceof PDFDict&&v.dict.get(PDFName.of('Subtype'))===PDFName.of('Image'));
 expect(images.length).toBeGreaterThan(0);
});
