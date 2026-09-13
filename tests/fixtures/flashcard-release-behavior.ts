import test from 'node:test';
import assert from 'node:assert/strict';
import { flashcardFeatureConfiguration } from '../../src/lib/flashcard-feature';
import { capabilitiesForAccount } from '../../src/lib/membership-access';
import { MEMBERSHIP_PLANS } from '../../src/lib/membership-plans';

test('released flags expose lesson decks for active tiers and preserve custom-deck entitlements', () => {
  assert.deepEqual(flashcardFeatureConfiguration(), { decksEnabled: true, generationEnabled: true });
  for (const plan of ['free', 'plus', 'pro'] as const) {
    const active = capabilitiesForAccount({ plan, isOwner: false, accountStatus: 'active' });
    assert.equal(active.flashcardDecksEnabled, true);
    assert.equal(active.createCustomFlashcardDeck, plan !== 'free');
    const suspended = capabilitiesForAccount({ plan, isOwner: false, accountStatus: 'suspended' });
    assert.equal(suspended.flashcardDecksEnabled, false);
    assert.equal(suspended.createCustomFlashcardDeck, false);
  }
  assert.deepEqual(['free', 'plus', 'pro'].map(plan => MEMBERSHIP_PLANS[plan as 'free' | 'plus' | 'pro'].limits.flashcardDeckGenerationsPerMonth), [5, 40, 100]);
});

test('missing production configuration and independent generation shutdown remain fail closed', () => {
  assert.deepEqual(flashcardFeatureConfiguration({ NODE_ENV: 'production' }), { decksEnabled: false, generationEnabled: false });
  assert.deepEqual(flashcardFeatureConfiguration({ NODE_ENV: 'production', FLASHCARD_DECKS_ENABLED: 'true', FLASHCARD_AI_GENERATION_ENABLED: 'false' }), { decksEnabled: true, generationEnabled: false });
});
