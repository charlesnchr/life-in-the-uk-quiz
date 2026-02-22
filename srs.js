/**
 * Spaced Repetition System (SRS) based on SM-2 algorithm
 * Similar to Anki's implementation
 */

class SpacedRepetitionSystem {
    constructor() {
        this.storageKey = 'lifeuk_srs_data';
        this.maxHistoryEntries = 50;
        this.cards = this.loadCards();
    }

    // Normalize card shape for backward compatibility
    normalizeCard(card, questionId) {
        return {
            ...card,
            id: card?.id || questionId,
            firstSeen: typeof card?.firstSeen === 'number' ? card.firstSeen : null,
            history: Array.isArray(card?.history)
                ? card.history.slice(-this.maxHistoryEntries)
                : []
        };
    }

    // Load cards from localStorage
    loadCards() {
        const data = localStorage.getItem(this.storageKey);
        if (!data) return {};

        try {
            const parsed = JSON.parse(data);
            if (!parsed || typeof parsed !== 'object') return {};

            const cards = {};
            for (const [questionId, card] of Object.entries(parsed)) {
                cards[questionId] = this.normalizeCard(card, questionId);
            }
            return cards;
        } catch (e) {
            console.error('Failed to parse SRS data:', e);
            return {};
        }
    }

    // Save cards to localStorage
    saveCards() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.cards));
    }

    // Get or create a card for a question
    getCard(questionId) {
        if (!this.cards[questionId]) {
            this.cards[questionId] = {
                id: questionId,
                easeFactor: 2.5,      // Default ease factor
                interval: 0,          // Days until next review
                repetitions: 0,       // Number of successful reviews
                nextReview: null,     // Timestamp of next review
                lastReview: null,     // Timestamp of last review
                correctCount: 0,      // Total correct answers
                incorrectCount: 0,    // Total incorrect answers
                lapses: 0,            // Times card was forgotten after learning
                status: 'new',        // new, learning, review, mastered
                firstSeen: Date.now(),
                history: []
            };
        } else {
            this.cards[questionId] = this.normalizeCard(this.cards[questionId], questionId);
        }
        return this.cards[questionId];
    }

    /**
     * Process a response using SM-2 algorithm
     * @param {string} questionId - The question identifier
     * @param {boolean} correct - Whether the answer was correct
     * @param {number} quality - Quality of response (0-5, optional)
     *   0 - Complete blackout
     *   1 - Incorrect, remembered upon seeing answer
     *   2 - Incorrect, easy to recall after seeing answer
     *   3 - Correct with serious difficulty
     *   4 - Correct after hesitation
     *   5 - Perfect response
     * @param {number|null} responseTimeMs - Response time in ms (optional)
     */
    processResponse(questionId, correct, quality = null, responseTimeMs = null) {
        const card = this.getCard(questionId);
        const now = Date.now();

        // Calculate quality if not provided
        if (quality === null) {
            quality = correct ? 4 : 1;
        }

        if (!Array.isArray(card.history)) {
            card.history = [];
        }
        card.history.push({
            timestamp: now,
            correct: Boolean(correct),
            quality: quality,
            responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : null
        });
        if (card.history.length > this.maxHistoryEntries) {
            card.history = card.history.slice(-this.maxHistoryEntries);
        }

        card.lastReview = now;

        if (correct) {
            card.correctCount++;

            if (card.repetitions === 0) {
                card.interval = 1; // First correct: review in 1 day
            } else if (card.repetitions === 1) {
                card.interval = 6; // Second correct: review in 6 days
            } else {
                // Subsequent reviews: interval * ease factor
                card.interval = Math.round(card.interval * card.easeFactor);
            }

            card.repetitions++;

            // Update ease factor based on quality (SM-2 formula)
            card.easeFactor = Math.max(1.3,
                card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
            );

            // Update status
            if (card.repetitions >= 1 && card.interval >= 21) {
                card.status = 'mastered';
            } else if (card.repetitions >= 1) {
                card.status = 'review';
            } else {
                card.status = 'learning';
            }

        } else {
            card.incorrectCount++;

            // On incorrect answer, reset to learning
            if (card.status !== 'new' && card.status !== 'learning') {
                card.lapses++;
            }

            card.repetitions = 0;
            card.interval = 0;
            card.status = 'learning';

            // Decrease ease factor on failure (but not below 1.3)
            card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
        }

        // Calculate next review time
        if (card.interval === 0) {
            // Learning card: review in 10 minutes
            card.nextReview = now + (10 * 60 * 1000);
        } else {
            // Review card: review in 'interval' days
            card.nextReview = now + (card.interval * 24 * 60 * 60 * 1000);
        }

        this.saveCards();
        return card;
    }

    // Get all cards due for review
    getDueCards() {
        const now = Date.now();
        const dueCards = [];

        for (const id in this.cards) {
            const card = this.cards[id];
            if (card.nextReview && card.nextReview <= now) {
                dueCards.push(card);
            }
        }

        // Sort by urgency (most overdue first)
        dueCards.sort((a, b) => a.nextReview - b.nextReview);

        return dueCards;
    }

    // Get cards that are in learning phase
    getLearningCards() {
        return Object.values(this.cards).filter(c => c.status === 'learning');
    }

    // Get mastered cards
    getMasteredCards() {
        return Object.values(this.cards).filter(c => c.status === 'mastered');
    }

    // Get cards in review status
    getReviewCards() {
        return Object.values(this.cards).filter(c => c.status === 'review');
    }

    // Get new cards (never reviewed)
    getNewCards() {
        return Object.values(this.cards).filter(c => c.status === 'new');
    }

    // Get weak cards (low accuracy)
    getWeakCards(threshold = 0.5) {
        return Object.values(this.cards).filter(card => {
            const total = card.correctCount + card.incorrectCount;
            if (total < 2) return false;
            return (card.correctCount / total) < threshold;
        });
    }

    // Get card statistics
    getStats() {
        const cards = Object.values(this.cards);
        const totalAnswered = cards.reduce((sum, c) => sum + c.correctCount + c.incorrectCount, 0);
        const totalCorrect = cards.reduce((sum, c) => sum + c.correctCount, 0);

        return {
            totalCards: cards.length,
            newCount: this.getNewCards().length,
            learningCount: this.getLearningCards().length,
            reviewCount: this.getReviewCards().length,
            masteredCount: this.getMasteredCards().length,
            dueCount: this.getDueCards().length,
            totalAnswered,
            totalCorrect,
            accuracy: totalAnswered > 0 ? (totalCorrect / totalAnswered * 100).toFixed(1) : 0,
            averageEase: cards.length > 0
                ? (cards.reduce((sum, c) => sum + c.easeFactor, 0) / cards.length).toFixed(2)
                : 2.5
        };
    }

    // Get accuracy for a specific question
    getQuestionAccuracy(questionId) {
        const existingCard = this.cards[questionId];
        if (!existingCard) return null;
        const card = this.normalizeCard(existingCard, questionId);
        this.cards[questionId] = card;

        const total = card.correctCount + card.incorrectCount;
        if (total === 0) return null;

        return {
            accuracy: (card.correctCount / total * 100).toFixed(0),
            correct: card.correctCount,
            incorrect: card.incorrectCount,
            total: total,
            firstSeen: card.firstSeen,
            historyLength: Array.isArray(card.history) ? card.history.length : 0
        };
    }

    // Get answer timeline (history) for a specific question
    getAnswerTimeline(questionId) {
        const card = this.cards[questionId];
        if (!card) return [];
        return Array.isArray(card.history) ? [...card.history] : [];
    }

    // Get hardest questions (sorted by error rate)
    getHardestQuestions(limit = 10) {
        const cards = Object.values(this.cards)
            .filter(c => (c.correctCount + c.incorrectCount) >= 2)
            .map(c => ({
                id: c.id,
                accuracy: c.correctCount / (c.correctCount + c.incorrectCount),
                attempts: c.correctCount + c.incorrectCount,
                lapses: c.lapses
            }))
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, limit);

        return cards;
    }

    // Reset all progress
    reset() {
        this.cards = {};
        this.saveCards();
    }

    // Export data for backup
    export() {
        return JSON.stringify(this.cards, null, 2);
    }

    // Import data from backup
    import(jsonData) {
        try {
            const parsed = JSON.parse(jsonData);
            if (!parsed || typeof parsed !== 'object') return false;

            const cards = {};
            for (const [questionId, card] of Object.entries(parsed)) {
                cards[questionId] = this.normalizeCard(card, questionId);
            }
            this.cards = cards;
            this.saveCards();
            return true;
        } catch (e) {
            console.error('Failed to import SRS data:', e);
            return false;
        }
    }
}

// Create global instance
const srs = new SpacedRepetitionSystem();
