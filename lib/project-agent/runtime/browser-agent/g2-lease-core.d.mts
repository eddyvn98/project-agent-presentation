export interface BrowserLeaseClaim {
  id: string; ownerEmail: string; workerId: string; token: string;
  epoch: number; revision: number;
}
// Mongo driver types vary across Next 14 host and neutral source snapshots.
// Runtime validates return shapes; leave the adapter generic at this boundary.
type Collection = any;
export function claimBrowserLease(coll: Collection, id: string, ownerEmail: string,
  workerId: string, now?: number): Promise<BrowserLeaseClaim | null>;
export function assertBrowserLease(coll: Collection, claim: BrowserLeaseClaim,
  mode?: "agent" | "human", now?: number): Promise<number | undefined>;
export function renewBrowserLease(coll: Collection, claim: BrowserLeaseClaim,
  now?: number): Promise<boolean>;
export function changeBrowserControl(coll: Collection, claim: BrowserLeaseClaim,
  from: "agent" | "human", to: "human" | "agent", now?: number): Promise<number>;
export function finishBrowserLease(coll: Collection, claim: BrowserLeaseClaim): Promise<boolean>;
export function stopBrowserLease(coll: Collection, id: string,
  ownerEmail: string): Promise<boolean>;
export function quarantineExpiredBrowser(coll: Collection, id: string, now?: number): Promise<boolean>;
export function acknowledgeBrowserRecovery(coll: Collection, id: string,
  ownerEmail: string, reviewed: boolean): Promise<boolean>;
