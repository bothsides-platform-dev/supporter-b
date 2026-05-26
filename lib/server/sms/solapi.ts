import { SolapiMessageService } from 'solapi';

let _client: SolapiMessageService | null = null;

function client(): SolapiMessageService {
  if (!_client) {
    _client = new SolapiMessageService(
      process.env.SOLAPI_API_KEY!,
      process.env.SOLAPI_SECRET_KEY!,
    );
  }
  return _client;
}

export async function sendSms(to: string, text: string): Promise<void> {
  await client().send({
    to,
    from: process.env.SOLAPI_SENDER!,
    text,
  });
}
