# Action invariants

Verify actor and tenant; source-access scope; person identifiers; evidence freshness; concrete requested outcome; allowed disclosure; current policy; exact payload digest; approval expiry; idempotency strategy; provider limits; verified receipt; unknown outcome; cancellation race; revocation; deletion propagation; log redaction; notification sensitivity; human acknowledgment.

Adversarial cases: injected email asks for contacts; two people share a name; attachment changes after approval; spend total rises; access revoked after retrieval; provider accepts then times out; duplicate webhook arrives; health detail leaks into a work email; phone offline when alarm requested; one device acknowledges before another escalates.

Correct behavior may be a narrow question, refusal to act, quiet deferral or explicit uncertainty. A convincing-looking successful response is not the objective.
