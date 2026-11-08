import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  operatorLabel,
  partnerOutcomeInput,
  PartnerOutcomeError,
  type PartnerOutcomeInput,
  type PartnerOutcomeOperator,
} from "../../lib/agent/partner-outcomes";

export const MAX_OUTCOME_FILE_BYTES = 16 * 1024;
export const OUTCOMES_HELP = `B2A 제휴 결과 기록 — DATABASE_URL을 명시적으로 주입한 운영자 환경에서 실행해요.
환경 파일은 자동으로 읽지 않아요. 입력 파일은 UTF-8 JSON이며 최대 16KiB예요.

pnpm b2a:outcomes record --file <json> --operator <label> [--execute]
  기본값은 미리보기예요. --execute를 지정한 경우에만 내부 기록을 저장해요.
pnpm b2a:outcomes inspect --request <uuid>
  요청에 연결된 내부 기록을 JSON으로 조회해요.
pnpm b2a:outcomes --help

--operator는 기록 주체를 남기는 표식이며 인증된 관리자 계정을 뜻하지 않아요.
실행 권한은 DB 접근 권한에 따라 정해져요. 외부 계약 요청·송금·제휴사 연락은 수행하지 않아요.
출력에는 내부 근거와 수수료가 포함될 수 있어요. 고객·에이전트용 응답으로 사용하지 않아요.
`;

type OutcomeCliCommand =
  | { kind: "help" }
  | {
      kind: "record";
      file: string;
      operator: PartnerOutcomeOperator;
      execute: boolean;
    }
  | { kind: "inspect"; requestId: string };

type CliErrorCode =
  | "INVALID_ARGUMENTS"
  | "DATABASE_URL_REQUIRED"
  | "INPUT_FILE_TOO_LARGE"
  | "INPUT_FILE_UNREADABLE";

class OutcomeCliError extends Error {
  constructor(readonly code: CliErrorCode) {
    super(code);
  }
}

export function parseOutcomeCliArgs(args: string[]): OutcomeCliCommand {
  if (!args.length) return { kind: "help" };
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      tokens: true,
      options: {
        help: { type: "boolean" },
        file: { type: "string" },
        operator: { type: "string" },
        execute: { type: "boolean" },
        request: { type: "string" },
      },
    });
  } catch {
    throw new OutcomeCliError("INVALID_ARGUMENTS");
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new OutcomeCliError("INVALID_ARGUMENTS");
    seen.add(token.name);
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: "help" };
  if (positionals.length !== 1) throw new OutcomeCliError("INVALID_ARGUMENTS");
  if (positionals[0] === "record") {
    if (!values.file?.trim() || values.request !== undefined)
      throw new OutcomeCliError("INVALID_ARGUMENTS");
    const operator = operatorLabel.safeParse(values.operator);
    if (!operator.success) throw new PartnerOutcomeError("INVALID_OPERATOR");
    return {
      kind: "record",
      file: values.file,
      operator: { channel: "operator_cli", label: operator.data },
      execute: values.execute === true,
    };
  }
  if (positionals[0] === "inspect") {
    if (
      values.file !== undefined ||
      values.operator !== undefined ||
      values.execute !== undefined ||
      !z.uuid().safeParse(values.request).success
    )
      throw new OutcomeCliError("INVALID_ARGUMENTS");
    return { kind: "inspect", requestId: values.request! };
  }
  throw new OutcomeCliError("INVALID_ARGUMENTS");
}

/** Read a bounded regular file; a file that grows after stat still cannot exceed the cap. */
export async function readOutcomeFile(path: string): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(path, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) throw new OutcomeCliError("INPUT_FILE_UNREADABLE");
    if (stat.size > MAX_OUTCOME_FILE_BYTES)
      throw new OutcomeCliError("INPUT_FILE_TOO_LARGE");
    const buffer = Buffer.alloc(MAX_OUTCOME_FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_OUTCOME_FILE_BYTES)
      throw new OutcomeCliError("INPUT_FILE_TOO_LARGE");
    return buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof OutcomeCliError) throw error;
    throw new OutcomeCliError("INPUT_FILE_UNREADABLE");
  } finally {
    await handle?.close().catch(() => {});
  }
}

export function parseOutcomeFile(bytes: Uint8Array): PartnerOutcomeInput {
  if (bytes.byteLength > MAX_OUTCOME_FILE_BYTES)
    throw new OutcomeCliError("INPUT_FILE_TOO_LARGE");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PartnerOutcomeError("INVALID_INPUT");
  }
  const parsed = partnerOutcomeInput.safeParse(value);
  if (!parsed.success) throw new PartnerOutcomeError("INVALID_INPUT");
  return parsed.data;
}

export type PartnerOutcomeServices = {
  previewPartnerOutcome(
    input: PartnerOutcomeInput,
    operator: PartnerOutcomeOperator,
  ): Promise<unknown>;
  recordPartnerOutcome(
    input: PartnerOutcomeInput,
    operator: PartnerOutcomeOperator,
  ): Promise<unknown>;
  inspectPartnerOutcomes(requestId: string): Promise<unknown>;
};

type OutcomeCliDependencies = {
  databaseUrl?: string;
  loadServices: () => Promise<PartnerOutcomeServices>;
  readFile?: (path: string) => Promise<Uint8Array>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export function outcomeCliFailureCode(error: unknown): string {
  if (error instanceof OutcomeCliError || error instanceof PartnerOutcomeError)
    return error.code;
  return "OUTCOME_COMMAND_FAILED";
}

/** Only the service layer accesses the database. Help and invalid files never load it. */
export async function runOutcomesCli(
  args: string[],
  deps: OutcomeCliDependencies,
): Promise<number> {
  try {
    const command = parseOutcomeCliArgs(args);
    if (command.kind === "help") {
      deps.stdout(OUTCOMES_HELP);
      return 0;
    }
    if (!deps.databaseUrl?.trim())
      throw new OutcomeCliError("DATABASE_URL_REQUIRED");
    if (command.kind === "inspect") {
      const services = await deps.loadServices();
      const result = await services.inspectPartnerOutcomes(command.requestId);
      deps.stdout(`${JSON.stringify({ mode: "inspect", result }, null, 2)}\n`);
      return 0;
    }
    const input = parseOutcomeFile(
      await (deps.readFile ?? readOutcomeFile)(command.file),
    );
    const services = await deps.loadServices();
    const result = command.execute
      ? await services.recordPartnerOutcome(input, command.operator)
      : await services.previewPartnerOutcome(input, command.operator);
    deps.stdout(
      `${JSON.stringify({ mode: command.execute ? "recorded" : "preview", result }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    deps.stderr(`${outcomeCliFailureCode(error)}\n`);
    return 1;
  }
}
