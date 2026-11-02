import type { Localized } from './blog';

// Domain contracts for later phases. No provider, persistence or access grant is implemented here.
export type PlanId = 'FREE' | 'PRO' | 'BUSINESS';
export type Role = 'customer' | 'affiliate' | 'admin';
export interface BrandScope { brandId: string; }
export interface Money { amountMinor: number; currency: string; }
export interface Price extends BrandScope {
  id: string;
  version: number;
  money: Money;
  interval: 'monthly' | 'annual' | 'one_off';
  providerPriceId: string;
}
export interface User extends BrandScope {
  id: string;
  identitySubject: string;
  emailVerified: boolean;
  status: 'active' | 'suspended' | 'deleted';
  roles: Role[];
}
export interface ProductVersion extends BrandScope {
  productId: string;
  version: string;
  releasedAt: string;
  privateStorageKey: string;
  sha256: string;
  changelog: Localized;
}
export interface DigitalProduct extends BrandScope {
  id: string;
  title: Localized;
  description: Localized;
  kind: 'n8n-template' | 'ai-workflow' | 'python-script' | 'pdf-guide' | 'docker-kit' | 'technical-kit' | 'tool';
  status: 'draft' | 'active' | 'retired';
  priceId: string | null;
  guideSlug: string | null;
  includedInPlans: PlanId[];
  currentVersion: string;
}
export interface Subscription extends BrandScope {
  id: string;
  userId: string;
  planId: PlanId;
  priceId: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}
export interface Purchase extends BrandScope {
  id: string;
  userId: string;
  status: 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'disputed' | 'canceled';
  paid: Money;
  items: Array<{ id: string; productId: string; version: string; priceId: string; total: Money }>;
  providerPaymentId: string | null;
}
export interface Entitlement extends BrandScope {
  userId: string;
  resourceType: 'guide' | 'product' | 'tool';
  resourceId: string;
  source: { kind: 'purchase' | 'subscription'; id: string };
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
}
export interface ExternalProgram extends BrandScope {
  id: string;
  name: string;
  active: boolean;
  allowedHosts: string[];
  disclosure: Localized;
}
export interface AffiliateLink extends BrandScope {
  id: string;
  programId: string;
  active: boolean;
  destination: string;
  label: Localized;
}
export interface AffiliatePartner extends BrandScope {
  id: string;
  userId: string;
  code: string;
  status: 'applied' | 'approved' | 'rejected' | 'suspended';
  approvedBy: string | null;
  approvedAt: string | null;
}
export interface ReferralPolicy extends BrandScope {
  id: string;
  version: number;
  attributionDays: number;
  attributionModel: 'first_click' | 'last_click';
  commission: { kind: 'basis_points'; value: number } | { kind: 'fixed'; money: Money };
  basis: 'net_excluding_tax_and_refunds';
  holdDays: number;
  maxRenewals: number;
}
export interface Commission extends BrandScope {
  id: string;
  partnerId: string;
  orderItemId: string;
  providerInvoiceId: string | null;
  policySnapshot: ReferralPolicy;
  amount: Money;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  reversesId: string | null;
  manualPayoutId: string | null;
}
export interface AuditEvent extends BrandScope {
  id: string;
  actorId: string;
  action: string;
  resourceId: string;
  occurredAt: string;
}

// Future server-only adapters must authenticate and enforce brand scope themselves.
export interface IdentityService {
  currentUser(scope: BrandScope, request: Request): Promise<User | null>;
}
export interface EntitlementService {
  canAccess(scope: BrandScope, userId: string, resource: { type: Entitlement['resourceType']; id: string }): Promise<boolean>;
}
export interface BillingService {
  createSandboxCheckout(scope: BrandScope, userId: string, priceId: string): Promise<{ url: string }>;
  createSandboxPortal(scope: BrandScope, userId: string): Promise<{ url: string }>;
  processSandboxWebhook(scope: BrandScope, rawBody: Uint8Array, signature: string): Promise<'processed' | 'duplicate'>;
}
export interface DownloadService {
  authorizeDownload(scope: BrandScope, request: Request, productId: string, version: string): Promise<{ url: string; expiresAt: string } | null>;
}
export interface AffiliateReporting {
  forCurrentPartner(scope: BrandScope, request: Request): Promise<{
    clicks: number; conversions: number; commissions: Commission[];
  }>;
}

export interface PlatformConfig extends BrandScope {
  schemaVersion: 1;
  features: {
    guides: boolean;
    subscriptions: false;
    products: false;
    externalAffiliates: false;
    referrals: false;
    admin: false;
    ads: false;
    clickTracking: false;
  };
  plans: Array<{ id: PlanId; available: boolean; monthly: null; annual: null }>;
  products: [];
  externalPrograms: [];
  affiliateLinks: [];
  referralPolicy: null;
}

export function validatePlatformConfig(value: unknown): PlatformConfig {
  const require = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`Platform: ${message}`);
  };
  const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!record(value)) throw new Error('Platform: object required');
  const fields = ['schemaVersion', 'brandId', 'features', 'plans', 'products', 'externalPrograms', 'affiliateLinks', 'referralPolicy'];
  require(Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key)), 'unknown or missing field');
  require(value.schemaVersion === 1, 'unsupported schema');
  require(typeof value.brandId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.brandId), 'invalid brand');
  const flags = ['guides', 'subscriptions', 'products', 'externalAffiliates', 'referrals', 'admin', 'ads', 'clickTracking'];
  if (!record(value.features)) throw new Error('Platform: features required');
  require(Object.keys(value.features).length === flags.length, 'unknown or missing flag');
  for (const flag of flags) {
    require(typeof value.features[flag] === 'boolean', `invalid flag ${flag}`);
    require(flag === 'guides' || value.features[flag] === false, `${flag} not implemented`);
  }
  if (!Array.isArray(value.plans)) throw new Error('Platform: plans required');
  require(value.plans.length === 3, 'three plan definitions required');
  for (const id of ['FREE', 'PRO', 'BUSINESS']) {
    const matches = value.plans.filter(plan => record(plan) && plan.id === id);
    require(matches.length === 1, `missing or duplicate plan ${id}`);
    const plan = matches[0] as Record<string, unknown>;
    require(Object.keys(plan).length === 4 && Object.keys(plan).every(key => ['id', 'available', 'monthly', 'annual'].includes(key)), 'unknown or missing plan field');
    require(plan.available === (id === 'FREE'), 'paid plans not implemented');
    require(plan.monthly === null && plan.annual === null, 'prices not implemented');
  }
  for (const name of ['products', 'externalPrograms', 'affiliateLinks']) {
    require(Array.isArray(value[name]) && value[name].length === 0, `${name} not implemented`);
  }
  require(value.referralPolicy === null, 'referrals not implemented');
  return value as unknown as PlatformConfig;
}
