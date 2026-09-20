import { pgTable, uuid, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { signingContracts } from './signing-contracts';
import type { AgreementParties, AgreementRate } from '@/lib/contract-doc/agreement';
import type { SentContractSnapshot } from '@/lib/types/signing';

/** Shared with admin-supporter-b. DDL is owned by this repository. */
export const pgAgreementRates = pgTable('pg_agreement_rates', {
  pgWsId: uuid('pg_ws_id')
    .primaryKey()
    .references(() => workspaces.id),
  version: integer('version').notNull().default(1),
  rates: jsonb('rates').$type<AgreementRate[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const signingAgreementDrafts = pgTable('signing_agreement_drafts', {
  contractId: uuid('contract_id')
    .primaryKey()
    .references(() => signingContracts.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(1),
  parties: jsonb('parties').$type<AgreementParties>().notNull(),
  // Written before provider creation; retained across an ambiguous send outcome.
  prepared: jsonb('prepared').$type<SentContractSnapshot>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
