import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { PartnerOutcomeError } from "../../../lib/agent/partner-outcomes";
import {
  MAX_OUTCOME_FILE_BYTES,
  parseOutcomeCliArgs,
  parseOutcomeFile,
  readOutcomeFile,
  runOutcomesCli,
} from "../outcomes-cli";

const requestId = "11111111-1111-4111-8111-111111111111";
const commandId = "22222222-2222-4222-8222-222222222222";
const providerWorkspaceId = "33333333-3333-4333-8333-333333333333";
const command = [
  "record",
  "--file",
  "example.json",
  "--operator",
  "operator-example",
];
function example() {
  return {
    kind: "commission_confirmed",
    commandId,
    requestId,
    providerWorkspaceId,
    reference: "example/commission",
    evidenceReference: "example/evidence",
    source: "operator_evidence",
    occurredAt: "2026-11-01T12:00:00+09:00",
    amount: "9999999999999999.1234",
    currency: "KRW",
    agreementReference: "example/agreement",
    calculationReference: "example/calculation",
  };
}
function setup(input: unknown = example()) {
  const services = {
    previewPartnerOutcome: vi.fn().mockResolvedValue({ execute: false }),
    recordPartnerOutcome: vi.fn().mockResolvedValue({ idempotent: false }),
    inspectPartnerOutcomes: vi
      .fn()
      .mockResolvedValue({ requestId, entries: [] }),
  };
  return {
    services,
    deps: {
      databaseUrl: "postgres://example.invalid/example",
      loadServices: vi.fn().mockResolvedValue(services),
      readFile: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(input))),
      stdout: vi.fn(),
      stderr: vi.fn(),
    },
  };
}
const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

it("defaults record to preview and preserves exact decimal strings", async () => {
  const { services, deps } = setup();
  expect(await runOutcomesCli(command, deps)).toBe(0);
  expect(services.recordPartnerOutcome).not.toHaveBeenCalled();
  expect(services.previewPartnerOutcome).toHaveBeenCalledExactlyOnceWith(
    example(),
    { channel: "operator_cli", label: "operator-example" },
  );
  expect(JSON.parse(deps.stdout.mock.calls[0][0])).toEqual({
    mode: "preview",
    result: { execute: false },
  });
  expect(deps.stderr).not.toHaveBeenCalled();
});

it("records only with an explicit execute flag and prints canonical amounts unchanged", async () => {
  const { services, deps } = setup({ ...example(), amount: "12.30" });
  services.recordPartnerOutcome.mockResolvedValue({
    entry: { amount: "12.3000" },
  });
  expect(await runOutcomesCli([...command, "--execute"], deps)).toBe(0);
  expect(services.previewPartnerOutcome).not.toHaveBeenCalled();
  expect(services.recordPartnerOutcome).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ amount: "12.3000" }),
    { channel: "operator_cli", label: "operator-example" },
  );
  expect(JSON.parse(deps.stdout.mock.calls[0][0])).toEqual({
    mode: "recorded",
    result: { entry: { amount: "12.3000" } },
  });
});

it("inspect reads the requested ledger without invoking either mutation path", async () => {
  const { services, deps } = setup();
  expect(await runOutcomesCli(["inspect", "--request", requestId], deps)).toBe(
    0,
  );
  expect(services.inspectPartnerOutcomes).toHaveBeenCalledExactlyOnceWith(
    requestId,
  );
  expect(services.previewPartnerOutcome).not.toHaveBeenCalled();
  expect(services.recordPartnerOutcome).not.toHaveBeenCalled();
  expect(deps.readFile).not.toHaveBeenCalled();
  expect(JSON.parse(deps.stdout.mock.calls[0][0]).mode).toBe("inspect");
});

it.each([{ args: [] }, { args: ["--help"] }])(
  "shows help without DB configuration or service loading: $args",
  async ({ args }) => {
    const { deps } = setup();
    expect(
      await runOutcomesCli(args, { ...deps, databaseUrl: undefined }),
    ).toBe(0);
    expect(deps.stdout).toHaveBeenCalledWith(
      expect.stringContaining("인증된 관리자 계정을 뜻하지 않아요"),
    );
    expect(deps.loadServices).not.toHaveBeenCalled();
    expect(deps.readFile).not.toHaveBeenCalled();
  },
);

it("requires an explicitly injected DB connection before reading files or loading services", async () => {
  const { deps } = setup();
  expect(await runOutcomesCli(command, { ...deps, databaseUrl: " " })).toBe(1);
  expect(deps.stderr).toHaveBeenCalledExactlyOnceWith(
    "DATABASE_URL_REQUIRED\n",
  );
  expect(deps.loadServices).not.toHaveBeenCalled();
  expect(deps.readFile).not.toHaveBeenCalled();
  expect(deps.stdout).not.toHaveBeenCalled();
});

it.each(
  [
    ["record"],
    [...command, "--execute=false"],
    [...command, "--execute", "--execute"],
    [...command, "--operator", "other-example"],
    [...command, "--request", requestId],
    [...command, "--unknown", "secret-value"],
    ["inspect", "--request", requestId, "--execute"],
    ["inspect", "--request", "not-a-uuid"],
    ["inspect", "--request", requestId, "--operator", "operator-example"],
    ["--execute"],
  ].map((args) => ({ args })),
)("rejects ambiguous or unrelated arguments: $args", ({ args }) => {
  expect(() => parseOutcomeCliArgs(args)).toThrow();
});

it.each([
  { ...example(), unknown: "private-value" },
  { ...example(), amount: 12.3 },
  { ...example(), amount: "1e3" },
  { ...example(), amount: "01.00" },
  { ...example(), amount: "1.00001" },
  { ...example(), evidenceReference: "https://example.invalid/?token=secret" },
  { ...example(), source: "customer_report" },
])("rejects invalid content before loading services: %j", async (input) => {
  const { deps } = setup(input);
  expect(await runOutcomesCli(command, deps)).toBe(1);
  expect(deps.stderr).toHaveBeenCalledExactlyOnceWith("INVALID_INPUT\n");
  expect(deps.stdout).not.toHaveBeenCalled();
  expect(deps.loadServices).not.toHaveBeenCalled();
});

it("rejects oversize, malformed JSON and invalid UTF-8", () => {
  expect(() =>
    parseOutcomeFile(Buffer.alloc(MAX_OUTCOME_FILE_BYTES + 1)),
  ).toThrow("INPUT_FILE_TOO_LARGE");
  expect(() => parseOutcomeFile(Buffer.from('{"private":'))).toThrow(
    "INVALID_INPUT",
  );
  expect(() => parseOutcomeFile(Uint8Array.from([0xff]))).toThrow(
    "INVALID_INPUT",
  );
});

it("reads bounded regular files and rejects oversized files and directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "b2a-outcomes-cli-"));
  temporaryDirectories.push(directory);
  const valid = join(directory, "example.json");
  const large = join(directory, "too-large.json");
  const text = JSON.stringify(example());
  await writeFile(
    valid,
    text + " ".repeat(MAX_OUTCOME_FILE_BYTES - Buffer.byteLength(text)),
  );
  await writeFile(large, Buffer.alloc(MAX_OUTCOME_FILE_BYTES + 1));
  expect(parseOutcomeFile(await readOutcomeFile(valid))).toEqual(example());
  await expect(readOutcomeFile(large)).rejects.toThrow("INPUT_FILE_TOO_LARGE");
  await expect(readOutcomeFile(directory)).rejects.toThrow(
    "INPUT_FILE_UNREADABLE",
  );
  await expect(readOutcomeFile(join(directory, "absent.json"))).rejects.toThrow(
    "INPUT_FILE_UNREADABLE",
  );
});

it("reports known service codes and never prints database errors or input contents", async () => {
  const { services, deps } = setup();
  services.previewPartnerOutcome.mockRejectedValueOnce(
    new PartnerOutcomeError("REQUEST_NOT_SUBMITTED"),
  );
  expect(await runOutcomesCli(command, deps)).toBe(1);
  expect(deps.stderr).toHaveBeenLastCalledWith("REQUEST_NOT_SUBMITTED\n");
  services.previewPartnerOutcome.mockRejectedValueOnce(
    new Error("database connection rejected: private evidence and password"),
  );
  expect(await runOutcomesCli(command, deps)).toBe(1);
  expect(deps.stderr).toHaveBeenLastCalledWith("OUTCOME_COMMAND_FAILED\n");
  expect(deps.stdout).not.toHaveBeenCalled();
  expect(JSON.stringify(deps.stderr.mock.calls)).not.toMatch(
    /secret|password|private evidence|postgres/,
  );
});
