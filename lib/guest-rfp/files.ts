import type { GuestDraft } from "./draft";
import type { RfpMockFile } from "@/lib/stores/rfp-draft";

// Resolve only on transaction commit. IDB request success can precede a quota abort.
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("support-b-guest-rfp-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("다른 탭을 닫고 파일 저장을 다시 시도해요."));
    };
  });
  return new Promise<T>((resolve, reject) => {
    try {
      const tx = db.transaction("files", mode);
      const request = run(tx.objectStore("files"));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(
          tx.error ??
            new Error(
              "파일을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해요.",
            ),
        );
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}
export const guestFiles = {
  put: (id: string, file: File) =>
    transaction("readwrite", (store) => store.put(file, id)),
  get: (id: string): Promise<File | undefined> =>
    transaction("readonly", (store) => store.get(id)),
  remove: (id: string) => transaction("readwrite", (store) => store.delete(id)),
};
export async function prepareGuestFiles(
  draft: GuestDraft,
  read: (id: string) => Promise<File | undefined>,
  upload: (file: File) => Promise<RfpMockFile>,
  save: () => void,
) {
  for (const item of draft.files) {
    if (item.uploaded) continue;
    const file = await read(item.id);
    if (!file)
      throw new Error(
        `${item.name} 원본을 찾지 못했어요. 파일을 제거한 뒤 다시 첨부해요.`,
      );
    try {
      item.uploaded = await upload(
        new File([file], item.name, { type: item.type }),
      );
    } catch {
      throw new Error(
        `${item.name} 업로드를 완료하지 못했어요. 다시 시도하거나 파일을 제거해요.`,
      );
    }
    save();
  }
  draft.data.rfpFiles = draft.files.map((file) => file.uploaded!);
  save();
}
