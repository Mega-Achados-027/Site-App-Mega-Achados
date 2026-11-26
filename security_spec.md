# Mega Achados 027 — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Default Deny**: Every unmatched path is denied (`allow read, write: if false`).
2. **Admin Privilege Isolation**:
   - No client can self-assign `role: 'admin'` on `/users/{userId}`.
   - Only the verified bootstrapped admin (`HeitorModder_YT@hotmail.com` with `email_verified == true`) or an existing admin listed in `/admins/{uid}` can create/read/delete `/admins/{uid}` documents or modify another user's `role`.
3. **PII Isolation (Split Collection)**:
   - Emails and avatar URLs live exclusively in `/users/{userId}/private/info` and are strictly readable/writable only by `isOwner(userId)` or `isAdmin()`.
   - `/users/{userId}` itself is strictly restricted to `isOwner(userId)` or `isAdmin()` (no blanket `isSignedIn()` read or list).
4. **Master Gate on Subcollections**:
   - Creating or accessing `/users/{userId}/private/info` or `/users/{userId}/savedDeals/{dealId}` requires the parent `/users/{userId}` document to exist (`exists(...)`), preventing orphaned subcollection records.
5. **Strict Schema, Boundaries & Timestamps**:
   - All document IDs match `^[a-zA-Z0-9_\-]+$` and `size() <= 128`.
   - Every string field enforces exact `maxLength` matching `firebase-blueprint.json`.
   - Every array (`preferredCategories`) is bounded (`size() <= 8`) with element type checks.
   - `createdAt` and `updatedAt` strictly equal `request.time` on creation; `createdAt`, `uid`, `userId`, and `id` are immutable on updates.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Assigned Admin Role**: Member creates `/users/{uid}` with `role: "admin"`.
2. **Role Escalation Update**: Member updates own `/users/{uid}` setting `role: "admin"`.
3. **Shadow / Ghost Field Injection**: Member creates `/users/{uid}` with extra field `isVip: true`.
4. **Email Spoofing (Unverified Admin Email)**: User with `email: "HeitorModder_YT@hotmail.com"` and `email_verified: false` tries to write `/admins/{uid}`.
5. **Cross-User PII Read**: Member A tries to `get` `/users/memberB/private/info`.
6. **Cross-User Profile List Scraping**: Non-admin tries to `list` `/users`.
7. **Identity Spoofing on SavedDeal**: Member A tries to create `/users/memberA/savedDeals/deal1` with `userId: "memberB"`.
8. **Orphaned Subcollection Write**: Member tries to create `/users/{uid}/savedDeals/deal1` before `/users/{uid}` exists.
9. **Resource Poisoning (Oversized ID)**: Member creates `/users/{uid}/savedDeals/${"a".repeat(200)}`.
10. **Value Poisoning on Update**: Member updates `/users/{uid}` setting `displayName` to a 500-character string or a boolean.
11. **Timestamp Forgery**: Member creates `/users/{uid}` with a client-supplied past timestamp instead of `request.time`.
12. **Array Overflow**: Member updates `/users/{uid}` with `preferredCategories` containing 25 items (> max 8).
