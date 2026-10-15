export type BusinessTemplate =
  | 'rfpInvited'
  | 'bidSubmitted'
  | 'requoteRequested'
  | 'awarded'
  | 'awaitingContract'
  | 'signingCompleted';
export type BusinessAlimtalk = {
  template: BusinessTemplate;
  /** Immutable event/round identity; recipient workspace and user are appended by the queue. */
  eventKey: string;
  rfpCode: string;
  linkUrl:
    | string
    | ((recipient: {
        userId: string;
        workspaceId: string | null;
        email: string;
      }) => string);
};
