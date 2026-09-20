# Security Specification for waTTson Firestore

## 1. Data Invariants
- A user document `/users/{userId}` can only be read, created, or updated by the authenticated user whose `request.auth.uid == userId`.
- User ID and document ID must be valid alphanumeric IDs (`^[a-zA-Z0-9_\\-]+$`) of maximum 128 characters.
- Incoming data must match the defined schema and size bounds.
- PII and credentials (`email`, `intervalsApiKey`, `intervalsAthleteId`) must only be accessible to the owner (`request.auth.uid == userId`).
- Unauthenticated requests must always be denied.
- Blanket list operations across all users are strictly denied.

## 2. The Dirty Dozen Payloads (Designed to be REJECTED)

1. **Unauthenticated Read**:
   `GET /users/user_123` with `request.auth = null` -> PERMISSION_DENIED.
2. **Impersonated Read (Cross-Tenant PII Snoop)**:
   `GET /users/victim_user` with `request.auth.uid = attacker_user` -> PERMISSION_DENIED.
3. **Impersonated Write (Owner Spoofing)**:
   `SET /users/victim_user` with `{ id: "victim_user", email: "victim@example.com" }` by `attacker_user` -> PERMISSION_DENIED.
4. **ID Mismatch Attack**:
   `SET /users/user_123` with `{ id: "other_user", email: "user@example.com" }` by `user_123` -> PERMISSION_DENIED.
5. **Ghost Field Poisoning**:
   `SET /users/user_123` with `{ id: "user_123", email: "user@example.com", isAdmin: true }` -> PERMISSION_DENIED.
6. **Path Traversal / ID Poisoning**:
   `SET /users/../../system` or oversized ID (>128 chars) -> PERMISSION_DENIED.
7. **Oversized Field Attack (Denial of Wallet)**:
   `UPDATE /users/user_123` with `userGoal` string length > 500 characters -> PERMISSION_DENIED.
8. **Invalid Enum Attack**:
   `UPDATE /users/user_123` with `trainingMethodology: "illegal_methodology"` -> PERMISSION_DENIED.
9. **Invalid Type Injection**:
   `UPDATE /users/user_123` with `ftp: "not_a_number"` -> PERMISSION_DENIED.
10. **Oversized Weekly Briefing Payload**:
    `UPDATE /users/user_123` with `weeklyBriefingJson` string length > 50000 characters -> PERMISSION_DENIED.
11. **Blanket Collection Scrape**:
    `LIST /users` without owner filter -> PERMISSION_DENIED.
12. **Malicious Deletion by Third-Party**:
    `DELETE /users/victim_user` by `attacker_user` -> PERMISSION_DENIED.
