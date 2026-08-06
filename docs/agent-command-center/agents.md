# Domain agents

Phase 1 contains no active agents. Phase 2 makes five draft-only agents available behind an independent environment gate and disabled-by-default per-agent controls:

- Support: classifies bounded support work and proposes response copy grounded in reviewed support articles.
- Legal intake: summarizes facts, claims, missing information, and escalation needs. It does not give legal advice or draft a final legal position.
- Billing explanation: proposes explanatory copy grounded in reviewed support content and the current billing capability state. It cannot charge, refund, cancel, or change a subscription.
- Product operations: groups feedback signals and recommends internal review priorities. It does not create issues or alter product records.
- Founder brief: summarizes the open queue into review priorities. It does not publish or send the brief.

Privacy, content-action, and knowledge-maintenance agents remain locked off.

Future agents may classify, summarize, draft, find approved knowledge, and recommend escalation. They must not send messages, alter accounts, remove content, fulfill privacy rights, change billing, publish statements, or change policy.

User messages, reports, course content, uploaded material, and external results are untrusted data. They are bounded, delimited as data, and can never override system instructions, approved policies, or tool allowlists. The default Phase 2 profile is `gpt-5.6-terra` with medium reasoning and a versioned structured-output prompt; `OPENAI_COMMAND_CENTER_MODEL` can override it for evaluated releases.
