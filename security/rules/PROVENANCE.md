# Vendored JavaScript security rules

These 83 YAML files are unmodified from GitLab SAST Rules **v2.10.0**,
commit `7051ea7602a210dfb0793916afedc9a0555addb7`, directory
[`rules/lgpl/javascript`](https://gitlab.com/gitlab-org/security-products/sast-rules/-/tree/7051ea7602a210dfb0793916afedc9a0555addb7/rules/lgpl/javascript).
Only the JavaScript rule definitions are vendored; upstream test fixtures and
other language packs are not included. Each rule retains its upstream license,
original-source URL, source hash, and attribution comments.
Scoped Git attributes preserve upstream bytes and whitespace on every platform;
first-party source retains the repository's ordinary whitespace checks.

`LICENSE` is the verbatim upstream `rules/lgpl/LICENSE` (LGPL v3).
`LICENSE.GPL-3.0` contains the incorporated GPL v3 terms, obtained from
<https://www.gnu.org/licenses/gpl-3.0.txt>. Keep both notices and covered source
when redistributing this rule pack. The application being scanned is not part
of this vendored rule library.

`manifest.json` records each original file's SHA-256 and rule identity. The
runner checks all 83 files against this manifest before use. Do not edit or
disable individual vendored rules to clear findings. A rule update must verify
the new upstream immutable source, preserve notices, regenerate the manifest,
and rerun compatibility, positive/negative fixtures, and the full source scan.

The scanner is OpenGrep **v1.30.0**, tag commit
`acf67b45c97c4b63626536605c77064ef536806d`, asset `opengrep_manylinux_x86`:

```text
35779bdd72e92129c8df2a77f0c55e8c08356801ea92591ef32108d6b28d564c
```

The [release API](https://api.github.com/repos/opengrep/opengrep/releases/tags/v1.30.0)
publishes that digest. The downloaded asset was independently hashed before
execution. OpenGrep's [pinned license](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/LICENSE)
is LGPL 2.1; the binary is downloaded into temporary storage and is not vendored.
No scanner service, commercial CodeQL entitlement, or source upload is used.

The pinned engine applies JavaScript rules to TypeScript and TSX. Local fixtures
exercise all three file extensions. This is a baseline rule pack with substantial
Express/Node/Electron coverage, not a comprehensive Next.js or workflow scanner.
Actionlint, dependency audits, secret checks, accounting contracts, and independent
review remain separate gates.

The runner validates schema/pattern compatibility by compiling and executing all
83 rules on a harmless local target under `--strict`, and checks the actual rule
identities in the JSON result. It intentionally does not use OpenGrep's remote
meta-lint validation command: the pinned implementation fetches registry rules.
Every scan runs inside a Linux network namespace with only loopback and a fresh
environment, with version checks explicitly disabled. No ignore comments are
honored, no findings are filtered by severity, and every requested JS/TS source
file must appear in the completed scan. Detailed JSON and scanner logs remain in
private directories under `RUNNER_TEMP`; only severity, rule ID, path, and line
are printed for findings. They are never uploaded as Actions artifacts.
