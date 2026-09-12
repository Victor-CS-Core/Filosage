# Home account-isolation review, September 11, 2026

The proposed stale-home-data issue was disproved before any application change. `AuthProvider` keys its child tree by the session revision. Committing a different canonical account or generation advances that revision, so the extracted learner home already remounts with empty state. An additional component key would duplicate the existing boundary and was not added.

The regression first loads A's private course, then changes the managed-session fixture directly to B using a focus refresh. B's account response resolves while B's progress and owned-course responses remain held. The test requires A's course to disappear, the home loading state to remain visible, and only B's course to appear after the held responses finish. It also checks B's canonical account/generation request marker. No sign-out or document navigation substitutes for the direct switch.

This is local browser coverage with mocked identity and data responses. It does not verify a hosted identity-provider session change. The coordinator owns integration and the shared release record; no production code or provider configuration changed.

Validation: the new direct-switch check and existing cross-tab sign-out/delayed-response check passed (2/2 Chromium). TypeScript, focused Oxlint/ESLint, and Git whitespace checks passed.
