export async function runPresignedUpload<TResult>(input: {
  file: File;
  contentType: string;
  presign: () => Promise<{ id: string; uploadUrl: string }>;
  complete: (id: string) => Promise<TResult>;
}): Promise<TResult> {
  const { id, uploadUrl } = await input.presign();
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: input.file,
    headers: { 'Content-Type': input.contentType },
  });
  if (!response.ok) throw new Error('UPLOAD_TRANSFER_FAILED');
  return input.complete(id);
}
