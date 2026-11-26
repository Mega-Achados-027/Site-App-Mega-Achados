/**
 * Phase 0 Security TDD Specification for Mega Achados 027 Firestore Rules.
 * Verifies that all 12 "Dirty Dozen" adversarial payloads are rejected by the ruleset.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'create' | 'update' | 'get' | 'list';
  path: string;
  actor: {
    uid: string;
    email: string;
    emailVerified: boolean;
    isAdmin?: boolean;
  };
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
  blockingRuleClause: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-Assigned Admin Role on Signup',
    operation: 'create',
    path: '/users/memberA',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      uid: 'memberA',
      displayName: 'Cliente',
      role: 'admin',
      preferredCategories: ['Hardware'],
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: "incoming().role == 'member' || (incoming().role == 'admin' && isAdmin())",
  },
  {
    id: 2,
    name: 'Privilege Escalation via Profile Update',
    operation: 'update',
    path: '/users/memberA',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {role: 'admin', updatedAt: 'SERVER_TIMESTAMP'},
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause:
      "incoming().role == existing().role && affectedKeys().hasOnly(['displayName', 'preferredCategories', 'updatedAt'])",
  },
  {
    id: 3,
    name: 'Shadow / Ghost Field Injection',
    operation: 'create',
    path: '/users/memberA',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      uid: 'memberA',
      displayName: 'Cliente',
      role: 'member',
      preferredCategories: [],
      isVip: true,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: "data.keys().hasOnly(['uid', 'displayName', 'role', 'preferredCategories', 'createdAt', 'updatedAt'])",
  },
  {
    id: 4,
    name: 'Email Spoofing (Unverified Admin Email)',
    operation: 'create',
    path: '/admins/attacker1',
    actor: {uid: 'attacker1', email: 'HeitorModder_YT@hotmail.com', emailVerified: false},
    payload: {
      uid: 'attacker1',
      email: 'HeitorModder_YT@hotmail.com',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'isVerified() && request.auth.token.email_verified == true',
  },
  {
    id: 5,
    name: 'Cross-User PII Read',
    operation: 'get',
    path: '/users/memberB/private/info',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'isOwner(userId) || isAdmin()',
  },
  {
    id: 6,
    name: 'Unrestricted Profile List Scraping',
    operation: 'list',
    path: '/users',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'resource.data.uid == request.auth.uid',
  },
  {
    id: 7,
    name: 'Identity Spoofing on SavedDeal',
    operation: 'create',
    path: '/users/memberA/savedDeals/deal-1',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      id: 'deal-1',
      userId: 'memberB',
      dealType: 'product',
      title: 'RTX 4070',
      storeOrAirline: 'KaBuM!',
      price: 4999,
      affiliateUrl: 'https://www.kabum.com.br/produto/rtx',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'data.userId == userId && isOwner(userId)',
  },
  {
    id: 8,
    name: 'Orphaned Subcollection Write Without Parent User',
    operation: 'create',
    path: '/users/ghostUser/savedDeals/deal-1',
    actor: {uid: 'ghostUser', email: 'ghost@exemplo.com', emailVerified: true},
    payload: {
      id: 'deal-1',
      userId: 'ghostUser',
      dealType: 'flight',
      title: 'VIX -> GRU',
      storeOrAirline: 'LATAM',
      price: 737,
      affiliateUrl: 'https://www.latamairlines.com/br/pt/oferta-voos',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'exists(/databases/$(database)/documents/users/$(userId))',
  },
  {
    id: 9,
    name: 'Resource Poisoning (Oversized Document ID)',
    operation: 'create',
    path: `/users/memberA/savedDeals/${'a'.repeat(200)}`,
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      id: 'a'.repeat(200),
      userId: 'memberA',
      dealType: 'product',
      title: 'Oferta',
      storeOrAirline: 'Amazon BR',
      price: 100,
      affiliateUrl: 'https://www.amazon.com.br/dp/123',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'isValidId(dealId) (size() <= 128)',
  },
  {
    id: 10,
    name: 'Value Poisoning on Update (Invalid Type / Length)',
    operation: 'update',
    path: '/users/memberA',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      displayName: 'x'.repeat(250),
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'isValidUserProfile(incoming(), userId) -> displayName.size() <= 80',
  },
  {
    id: 11,
    name: 'Client Timestamp Forgery on Create',
    operation: 'create',
    path: '/users/memberA',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      uid: 'memberA',
      displayName: 'Cliente',
      role: 'member',
      preferredCategories: [],
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'incoming().createdAt == request.time && incoming().updatedAt == request.time',
  },
  {
    id: 12,
    name: 'Unbounded Array Overflow on Preferred Categories',
    operation: 'update',
    path: '/users/memberA',
    actor: {uid: 'memberA', email: 'cliente@exemplo.com', emailVerified: true},
    payload: {
      preferredCategories: Array.from({length: 20}, (_, i) => `cat-${i}`),
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    blockingRuleClause: 'data.preferredCategories.size() <= 8',
  },
];
