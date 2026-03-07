/**
 * Life in the UK Test - Main Application
 */

class QuizApp {
    constructor() {
        // Question source
        this.currentSource = localStorage.getItem('lifeuk_source') || 'official';

        // Session state
        this.currentMode = 'all';
        this.currentTab = 'practice';
        this.sessionQuestions = [];
        this.sessionAnswers = []; // Track answers: null=unanswered, true=correct, false=incorrect
        this.currentIndex = 0;
        this.sessionCorrect = 0;
        this.sessionTotal = 0;
        this.answered = false;
        this.sessionStartTime = Date.now();
        this.questionShownAt = null;

        // Multi-select state
        this.selectedOptions = [];

        // Review state
        this.isReviewMode = false;
        this.reviewQueue = [];
        this.reviewIndex = 0;
        this.reviewCorrect = 0;
        this.reviewTotal = 0;
        this.currentReviewMode = 'failed';
        this.reviewSelectedOptions = [];

        // Settings
        this.questionsPerSession = 24;

        // Initialize
        this.init();
    }

    init() {
        this.initTheme();
        this.initSource();
        this.bindEvents();
        this.updateFailedCount();
        this.updateDueCount();
        this.loadSession();
        this.updateStats();
    }

    initSource() {
        // Update source button states
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.source === this.currentSource);
        });
        // Update counts
        this.updateSourceCounts();
    }

    updateSourceCounts() {
        const officialCount = document.getElementById('official-count');
        const maxwellitoCount = document.getElementById('maxwellito-count');
        if (officialCount) officialCount.textContent = questions.length;
        if (maxwellitoCount && typeof maxwellitoQuestions !== 'undefined') {
            maxwellitoCount.textContent = maxwellitoQuestions.length;
        }
    }

    getActiveQuestions() {
        if (this.currentSource === 'maxwellito' && typeof maxwellitoQuestions !== 'undefined') {
            return maxwellitoQuestions;
        }
        return questions;
    }

    switchSource(source) {
        if (source === this.currentSource) return;

        this.currentSource = source;
        localStorage.setItem('lifeuk_source', source);

        // Update button states
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.source === source);
        });

        // Start new session with new source
        this.startSession();
    }

    initTheme() {
        const savedTheme = localStorage.getItem('lifeuk_theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.updateThemeIcon(true);
        }
    }

    toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('lifeuk_theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('lifeuk_theme', 'dark');
        }
        this.updateThemeIcon(!isDark);
    }

    updateThemeIcon(isDark) {
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = isDark ? '🌙' : '☀️';
    }

    bindEvents() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Source selection
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const source = e.target.closest('.source-btn').dataset.source;
                this.switchSource(source);
            });
        });

        // Practice mode selection
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchMode(e.target.dataset.mode));
        });

        // Review mode selection
        document.querySelectorAll('.review-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchReviewMode(e.target.dataset.reviewMode));
        });

        // Next buttons
        document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('review-next-btn').addEventListener('click', () => this.nextReviewCard());

        // Restart/Start buttons
        document.getElementById('restart-btn').addEventListener('click', () => this.startSession());
        document.getElementById('start-practice-btn')?.addEventListener('click', () => {
            this.switchTab('practice');
        });

        // Stats actions
        document.getElementById('reset-stats').addEventListener('click', () => this.resetProgress());
        document.getElementById('export-stats').addEventListener('click', () => this.exportData());
        document.getElementById('import-stats').addEventListener('click', () => {
            const fileInput = document.getElementById('import-file');
            fileInput.value = '';
            fileInput.click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));

        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    switchTab(tab) {
        this.currentTab = tab;

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}-tab`);
        });

        if (tab === 'review') {
            this.updateReviewCounts();
            this.loadReviewSession();
        } else if (tab === 'stats') {
            this.updateStats();
        }
    }

    switchMode(mode) {
        this.currentMode = mode;

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.startSession();
    }

    switchReviewMode(mode) {
        this.currentReviewMode = mode;

        document.querySelectorAll('.review-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.reviewMode === mode);
        });

        this.loadReviewSession();
    }

    // Get failed questions (incorrectCount > 0)
    getFailedQuestions() {
        const activeQuestions = this.getActiveQuestions();
        const failed = [];
        for (const id in srs.cards) {
            const card = srs.cards[id];
            if (card.incorrectCount > 0) {
                const question = activeQuestions.find(q => q.id === id);
                if (question) {
                    failed.push({ question, card });
                }
            }
        }
        // Sort by most failures first
        failed.sort((a, b) => b.card.incorrectCount - a.card.incorrectCount);
        return failed.map(f => f.question);
    }

    startSession() {
        this.sessionQuestions = this.getSessionQuestions();
        this.sessionAnswers = new Array(this.sessionQuestions.length).fill(null);
        this.currentIndex = 0;
        this.sessionCorrect = 0;
        this.sessionTotal = 0;
        this.answered = false;
        this.sessionStartTime = Date.now();

        document.getElementById('quiz-container').classList.remove('hidden');
        document.getElementById('session-complete').classList.add('hidden');

        this.renderProgressIndicator();
        this.showQuestion();
    }

    getSessionQuestions() {
        const activeQuestions = this.getActiveQuestions();
        let pool = [...activeQuestions];

        if (this.currentMode === 'failed') {
            pool = this.getFailedQuestions();
            if (pool.length === 0) {
                // No failed questions, show message
                pool = this.shuffleArray([...activeQuestions]).slice(0, this.questionsPerSession);
            }
        } else if (this.currentMode === 'weak') {
            const weakCards = srs.getWeakCards(0.6);
            const weakIds = new Set(weakCards.map(c => c.id));
            pool = activeQuestions.filter(q => weakIds.has(q.id));

            if (pool.length < this.questionsPerSession) {
                const additional = activeQuestions.filter(q => !weakIds.has(q.id));
                pool = [...pool, ...this.shuffleArray(additional).slice(0, this.questionsPerSession - pool.length)];
            }
        } else if (this.currentMode === 'new') {
            const seenIds = new Set(Object.keys(srs.cards));
            pool = activeQuestions.filter(q => !seenIds.has(q.id));
        }

        return this.shuffleArray(pool).slice(0, this.questionsPerSession);
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Render the horizontal progress indicator
    renderProgressIndicator() {
        let container = document.getElementById('progress-indicator');
        if (!container) {
            container = document.createElement('div');
            container.id = 'progress-indicator';
            container.className = 'progress-indicator';
            const quizContainer = document.getElementById('quiz-container');
            quizContainer.insertBefore(container, quizContainer.firstChild);
        }

        container.innerHTML = '';
        for (let i = 0; i < this.sessionQuestions.length; i++) {
            const box = document.createElement('div');
            box.className = 'progress-box';
            box.textContent = i + 1;
            box.dataset.index = i;

            if (this.sessionAnswers[i] === true) {
                box.classList.add('correct');
            } else if (this.sessionAnswers[i] === false) {
                box.classList.add('incorrect');
            }

            if (i === this.currentIndex) {
                box.classList.add('current');
            }

            // Allow clicking to jump to any answered question, or the frontier
            // (first unanswered), even when currentIndex has been moved by browsing back.
            box.addEventListener('click', () => {
                const frontier = this.sessionAnswers.findIndex(a => a === null);
                const isAnswered = this.sessionAnswers[i] !== null;
                const isFrontier = frontier === -1 || i === frontier;
                if (isAnswered || isFrontier) {
                    this.currentIndex = i;
                    this.showQuestion();
                    this.updateProgressIndicator();
                }
            });

            container.appendChild(box);
        }
    }

    updateProgressIndicator() {
        const boxes = document.querySelectorAll('.progress-box');
        boxes.forEach((box, i) => {
            box.classList.remove('current', 'correct', 'incorrect');

            if (this.sessionAnswers[i] === true) {
                box.classList.add('correct');
            } else if (this.sessionAnswers[i] === false) {
                box.classList.add('incorrect');
            }

            if (i === this.currentIndex) {
                box.classList.add('current');
            }
        });
    }

    showQuestion() {
        if (this.currentIndex >= this.sessionQuestions.length) {
            this.showSessionComplete();
            return;
        }

        const question = this.sessionQuestions[this.currentIndex];
        this.answered = this.sessionAnswers[this.currentIndex] !== null;
        this.selectedOptions = [];
        this.questionShownAt = Date.now();

        // Update progress bar
        const progress = ((this.currentIndex) / this.sessionQuestions.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('question-number').textContent = `Question ${this.currentIndex + 1} of ${this.sessionQuestions.length}`;
        document.getElementById('session-score').textContent = `${this.sessionCorrect}/${this.sessionTotal}`;

        // Show question text
        const isMultiSelect = question.correct.length > 1;
        let questionHtml = question.question;
        if (isMultiSelect) {
            questionHtml += `<span class="multi-select-hint">Select ${question.correct.length} answers</span>`;
        }
        document.getElementById('question-text').innerHTML = questionHtml;

        // Show options
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';

        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        question.options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = `
                <span class="option-letter">${letters[index]}</span>
                <span class="option-text">${option}</span>
            `;
            btn.addEventListener('click', () => this.selectOption(index, question));
            optionsContainer.appendChild(btn);
        });

        if (this.answered) {
            // Reviewing a previously-answered question: show correct answers and
            // disable all options so nothing can be re-submitted.
            const optionBtns = optionsContainer.querySelectorAll('.option-btn');
            optionBtns.forEach((btn, idx) => {
                btn.classList.add('disabled');
                if (question.correct.includes(idx)) {
                    btn.classList.add('correct');
                    btn.querySelector('.option-letter').innerHTML = '✓';
                }
            });

            // Restore feedback banner
            const wasCorrect = this.sessionAnswers[this.currentIndex];
            const feedback = document.getElementById('feedback');
            feedback.classList.remove('hidden', 'correct', 'incorrect');
            feedback.classList.add(wasCorrect ? 'correct' : 'incorrect');
            document.getElementById('feedback-icon').textContent = wasCorrect ? '✓' : '✗';
            document.getElementById('feedback-text').textContent = wasCorrect ? 'Correct!' : 'Incorrect';
            const explanation = document.getElementById('explanation');
            if (question.tip) {
                explanation.textContent = question.tip;
                explanation.style.display = 'block';
            } else {
                explanation.style.display = 'none';
            }
            document.getElementById('next-container').classList.remove('hidden');
        } else {
            document.getElementById('feedback').classList.add('hidden');
            document.getElementById('next-container').classList.add('hidden');
        }

        this.updateProgressIndicator();
    }

    selectOption(selectedIndex, question) {
        if (this.answered) return;

        const isMultiSelect = question.correct.length > 1;
        const optionBtns = document.querySelectorAll('#options-container .option-btn');

        if (isMultiSelect) {
            // Toggle selection for multi-select questions
            const idx = this.selectedOptions.indexOf(selectedIndex);
            if (idx > -1) {
                this.selectedOptions.splice(idx, 1);
                optionBtns[selectedIndex].classList.remove('selected');
            } else {
                if (this.selectedOptions.length < question.correct.length) {
                    this.selectedOptions.push(selectedIndex);
                    optionBtns[selectedIndex].classList.add('selected');
                }
            }

            // Check if we have selected the required number of options
            if (this.selectedOptions.length === question.correct.length) {
                this.submitAnswer(question);
            }
        } else {
            // Single-select: submit immediately
            this.selectedOptions = [selectedIndex];
            this.submitAnswer(question);
        }
    }

    submitAnswer(question) {
        this.answered = true;
        this.sessionTotal++;
        const responseTimeMs = this.getResponseTimeMs();

        const optionBtns = document.querySelectorAll('#options-container .option-btn');

        // Check if all selected options are correct and all correct options are selected
        const selectedSet = new Set(this.selectedOptions);
        const correctSet = new Set(question.correct);
        const isCorrect = selectedSet.size === correctSet.size &&
            [...selectedSet].every(idx => correctSet.has(idx));

        this.sessionAnswers[this.currentIndex] = isCorrect;

        optionBtns.forEach((btn, idx) => {
            btn.classList.add('disabled');
            btn.classList.remove('selected');

            if (question.correct.includes(idx)) {
                btn.classList.add('correct');
                btn.querySelector('.option-letter').innerHTML = '✓';
            }

            if (this.selectedOptions.includes(idx) && !question.correct.includes(idx)) {
                btn.classList.add('incorrect');
                btn.querySelector('.option-letter').innerHTML = '✗';
            }
        });

        // Update SRS
        srs.processResponse(question.id, isCorrect, undefined, responseTimeMs);
        this.updateDueCount();
        this.updateFailedCount();
        this.updateDailyActivity({
            questionsAnswered: 1,
            correctCount: isCorrect ? 1 : 0,
            timeSpentMs: responseTimeMs
        });

        if (isCorrect) {
            this.sessionCorrect++;
        }
        document.getElementById('session-score').textContent = `${this.sessionCorrect}/${this.sessionTotal}`;

        // Show feedback
        const feedback = document.getElementById('feedback');
        feedback.classList.remove('hidden', 'correct', 'incorrect');
        feedback.classList.add(isCorrect ? 'correct' : 'incorrect');

        document.getElementById('feedback-icon').textContent = isCorrect ? '✓' : '✗';
        document.getElementById('feedback-text').textContent = isCorrect ? 'Correct!' : 'Incorrect';

        const explanation = document.getElementById('explanation');
        if (question.tip) {
            explanation.textContent = question.tip;
            explanation.style.display = 'block';
        } else {
            explanation.style.display = 'none';
        }

        document.getElementById('next-container').classList.remove('hidden');
        this.updateProgressIndicator();
        this.saveSession();
        if (window.lifeUkSync && typeof window.lifeUkSync.flushNow === 'function') {
            window.lifeUkSync.flushNow();
        }
    }

    nextQuestion() {
        this.currentIndex++;
        this.answered = false;
        this.showQuestion();
    }

    showSessionComplete() {
        document.getElementById('quiz-container').classList.add('hidden');
        document.getElementById('session-complete').classList.remove('hidden');

        const accuracy = this.sessionTotal > 0 ?
            Math.round((this.sessionCorrect / this.sessionTotal) * 100) : 0;

        const passed = accuracy >= 75;
        const incorrectCount = this.sessionAnswers.filter(a => a === false).length;
        const sessionStartTime = Number(this.sessionStartTime);
        const durationMs = Number.isFinite(sessionStartTime)
            ? Math.max(0, Date.now() - sessionStartTime)
            : 0;

        this.appendSessionHistory({
            date: new Date().toISOString(),
            mode: this.currentMode,
            source: this.currentSource,
            questionsTotal: this.sessionTotal,
            correct: this.sessionCorrect,
            accuracy,
            durationMs,
            passed
        });
        this.incrementTotalSessions();
        this.updateDailyActivity({ sessionsCompleted: 1 });
        if (this.sessionTotal > 0) {
            this.recordPracticeForStreak();
        }

        document.getElementById('session-results').innerHTML = `
            <span class="result-stat">Score: <span class="result-value">${this.sessionCorrect}/${this.sessionTotal}</span></span>
            <span class="result-stat">Accuracy: <span class="result-value">${accuracy}%</span></span>
            <span class="result-stat">Result: <span class="result-value" style="color: ${passed ? 'var(--success)' : 'var(--error)'}">${passed ? 'PASS' : 'FAIL'}</span></span>
            ${incorrectCount > 0 ? `<span class="result-stat" style="color: var(--error);">${incorrectCount} question${incorrectCount > 1 ? 's' : ''} to review</span>` : ''}
            <span class="result-stat" style="font-size: 0.9rem; color: var(--text-secondary)">(75% required to pass)</span>
        `;

        localStorage.removeItem('lifeuk_session');
        this.updateStats();
        this.updateFailedCount();
    }

    // ==================== REVIEW MODE ====================

    updateReviewCounts() {
        const failedCount = this.getFailedQuestions().length;
        const dueCount = srs.getDueCards().length;
        const weakCount = srs.getWeakCards(0.6).length;

        const failedBadge = document.getElementById('review-failed-count');
        const dueBadge = document.getElementById('review-due-count');
        const weakBadge = document.getElementById('review-weak-count');

        if (failedBadge) failedBadge.textContent = failedCount;
        if (dueBadge) dueBadge.textContent = dueCount;
        if (weakBadge) weakBadge.textContent = weakCount;
    }

    loadReviewSession() {
        this.updateReviewCounts();

        let reviewQuestions = [];

        if (this.currentReviewMode === 'failed') {
            reviewQuestions = this.getFailedQuestions();
        } else if (this.currentReviewMode === 'due') {
            const dueCards = srs.getDueCards();
            const activeQuestions = this.getActiveQuestions();
            reviewQuestions = dueCards.map(card =>
                activeQuestions.find(q => q.id === card.id)
            ).filter(q => q);
        } else if (this.currentReviewMode === 'weak') {
            const weakCards = srs.getWeakCards(0.6);
            const activeQuestions = this.getActiveQuestions();
            reviewQuestions = weakCards.map(card =>
                activeQuestions.find(q => q.id === card.id)
            ).filter(q => q);
        }

        this.reviewQueue = this.shuffleArray(reviewQuestions);
        this.reviewIndex = 0;
        this.reviewCorrect = 0;
        this.reviewTotal = 0;
        this.isReviewMode = true;

        this.updateReviewStats();

        if (this.reviewQueue.length > 0) {
            document.getElementById('review-container').classList.remove('hidden');
            document.getElementById('no-reviews').classList.add('hidden');
            this.showReviewCard();
        } else {
            document.getElementById('review-container').classList.add('hidden');
            document.getElementById('no-reviews').classList.remove('hidden');

            const messages = {
                'failed': 'No failed questions!',
                'due': 'No cards due for review!',
                'weak': 'No weak areas identified!'
            };
            document.getElementById('no-reviews-message').textContent = messages[this.currentReviewMode] || 'Nothing to review!';
        }
    }

    updateReviewStats() {
        const stats = srs.getStats();
        document.getElementById('due-today').textContent = stats.dueCount;
        document.getElementById('learning-count').textContent = stats.learningCount;
        document.getElementById('mastered-count').textContent = stats.masteredCount;
    }

    showReviewCard() {
        if (this.reviewIndex >= this.reviewQueue.length) {
            document.getElementById('review-container').classList.add('hidden');
            document.getElementById('no-reviews').classList.remove('hidden');

            const accuracy = this.reviewTotal > 0 ?
                Math.round((this.reviewCorrect / this.reviewTotal) * 100) : 0;
            document.getElementById('no-reviews-message').textContent =
                `Review complete! ${this.reviewCorrect}/${this.reviewTotal} correct (${accuracy}%)`;
            return;
        }

        const question = this.reviewQueue[this.reviewIndex];
        this.answered = false;
        this.reviewSelectedOptions = [];
        this.questionShownAt = Date.now();

        // Update progress
        document.getElementById('review-progress-text').textContent =
            `Card ${this.reviewIndex + 1} of ${this.reviewQueue.length}`;
        document.getElementById('review-score').textContent =
            `${this.reviewCorrect}/${this.reviewTotal}`;

        // Show question
        let questionHtml = question.question;
        if (question.correct.length > 1) {
            questionHtml += `<span class="multi-select-hint">Select ${question.correct.length} answers</span>`;
        }
        document.getElementById('review-question-text').innerHTML = questionHtml;

        // Show options
        const optionsContainer = document.getElementById('review-options-container');
        optionsContainer.innerHTML = '';

        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        question.options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = `
                <span class="option-letter">${letters[index]}</span>
                <span class="option-text">${option}</span>
            `;
            btn.addEventListener('click', () => this.selectReviewOption(index, question));
            optionsContainer.appendChild(btn);
        });

        document.getElementById('review-feedback').classList.add('hidden');
        document.getElementById('review-next-container').classList.add('hidden');
    }

    selectReviewOption(selectedIndex, question) {
        if (this.answered) return;

        const isMultiSelect = question.correct.length > 1;
        const optionBtns = document.querySelectorAll('#review-options-container .option-btn');

        if (isMultiSelect) {
            // Toggle selection for multi-select questions
            const idx = this.reviewSelectedOptions.indexOf(selectedIndex);
            if (idx > -1) {
                this.reviewSelectedOptions.splice(idx, 1);
                optionBtns[selectedIndex].classList.remove('selected');
            } else {
                if (this.reviewSelectedOptions.length < question.correct.length) {
                    this.reviewSelectedOptions.push(selectedIndex);
                    optionBtns[selectedIndex].classList.add('selected');
                }
            }

            // Check if we have selected the required number of options
            if (this.reviewSelectedOptions.length === question.correct.length) {
                this.submitReviewAnswer(question);
            }
        } else {
            // Single-select: submit immediately
            this.reviewSelectedOptions = [selectedIndex];
            this.submitReviewAnswer(question);
        }
    }

    submitReviewAnswer(question) {
        this.answered = true;
        this.reviewTotal++;
        const responseTimeMs = this.getResponseTimeMs();

        const optionBtns = document.querySelectorAll('#review-options-container .option-btn');

        // Check if all selected options are correct and all correct options are selected
        const selectedSet = new Set(this.reviewSelectedOptions);
        const correctSet = new Set(question.correct);
        const isCorrect = selectedSet.size === correctSet.size &&
            [...selectedSet].every(idx => correctSet.has(idx));

        if (isCorrect) this.reviewCorrect++;

        optionBtns.forEach((btn, idx) => {
            btn.classList.add('disabled');
            btn.classList.remove('selected');

            if (question.correct.includes(idx)) {
                btn.classList.add('correct');
                btn.querySelector('.option-letter').innerHTML = '✓';
            }

            if (this.reviewSelectedOptions.includes(idx) && !question.correct.includes(idx)) {
                btn.classList.add('incorrect');
                btn.querySelector('.option-letter').innerHTML = '✗';
            }
        });

        // Update SRS
        const quality = isCorrect ? 4 : 1;
        srs.processResponse(question.id, isCorrect, quality, responseTimeMs);
        this.updateDueCount();
        this.updateFailedCount();
        this.updateReviewStats();
        this.updateReviewCounts();
        this.updateDailyActivity({
            questionsAnswered: 1,
            correctCount: isCorrect ? 1 : 0,
            timeSpentMs: responseTimeMs
        });

        // Update score display
        document.getElementById('review-score').textContent =
            `${this.reviewCorrect}/${this.reviewTotal}`;

        // Show feedback
        const feedback = document.getElementById('review-feedback');
        feedback.classList.remove('hidden', 'correct', 'incorrect');
        feedback.classList.add(isCorrect ? 'correct' : 'incorrect');

        document.getElementById('review-feedback-icon').textContent = isCorrect ? '✓' : '✗';
        document.getElementById('review-feedback-text').textContent = isCorrect ? 'Correct!' : 'Incorrect';

        const explanation = document.getElementById('review-explanation');
        if (question.tip) {
            explanation.textContent = question.tip;
            explanation.style.display = 'block';
        } else {
            explanation.style.display = 'none';
        }

        document.getElementById('review-next-container').classList.remove('hidden');
        this.saveSession();
    }

    nextReviewCard() {
        this.reviewIndex++;
        this.showReviewCard();
    }

    // ==================== STATISTICS ====================

    updateStats() {
        const stats = srs.getStats();

        document.getElementById('total-answered').textContent = stats.totalAnswered;
        document.getElementById('accuracy-rate').textContent = `${stats.accuracy}%`;
        document.getElementById('unique-questions').textContent = stats.totalCards;

        this.updateProgressOverview();
        this.updateStreaksAndSessions();
        this.updateActivityHeatmap();
        this.updateSessionHistory();
        this.updateCategoryStats();
        this.updateDifficultQuestions();
    }

    updateProgressOverview() {
        const stats = srs.getStats();
        const activeQuestions = this.getActiveQuestions();
        const activeIds = new Set(activeQuestions.map((q) => q.id));
        const cards = Object.values(srs.cards).filter((card) => activeIds.has(card.id));

        const seenCount = activeQuestions.length > 0 ? cards.length : stats.totalCards;
        const masteredCount = activeQuestions.length > 0
            ? cards.filter((card) => card.status === 'mastered').length
            : stats.masteredCount;

        const masteryPercent = seenCount > 0
            ? Math.round((masteredCount / seenCount) * 100)
            : 0;

        const questionTotal = this.currentSource === 'official'
            ? 960
            : activeQuestions.length;
        const safeTotal = questionTotal > 0 ? questionTotal : activeQuestions.length;
        const displayedSeen = safeTotal > 0 ? Math.min(seenCount, safeTotal) : seenCount;
        const seenPercent = safeTotal > 0
            ? Math.round((displayedSeen / safeTotal) * 100)
            : 0;

        document.getElementById('questions-seen-text').textContent =
            `Questions Seen: ${displayedSeen} / ${safeTotal}`;
        document.getElementById('questions-seen-percent').textContent = `${seenPercent}%`;
        document.getElementById('questions-seen-fill').style.width = `${Math.min(100, seenPercent)}%`;
        document.getElementById('mastery-overview').textContent =
            `Mastery: ${masteryPercent}% of seen questions mastered`;
    }

    updateStreaksAndSessions() {
        const currentStreak = this.calculateStreak();
        const storedBest = parseInt(localStorage.getItem('lifeuk_best_streak') || '0', 10);
        const bestStreak = Number.isFinite(storedBest)
            ? Math.max(storedBest, currentStreak)
            : currentStreak;
        localStorage.setItem('lifeuk_best_streak', String(bestStreak));

        const sessionHistoryParsed = this.readJsonStorage('lifeuk_session_history', []);
        const sessionHistory = Array.isArray(sessionHistoryParsed) ? sessionHistoryParsed : [];
        const storedTotalSessions = parseInt(localStorage.getItem('lifeuk_total_sessions') || '0', 10);
        const totalSessions = Number.isFinite(storedTotalSessions) && storedTotalSessions > 0
            ? storedTotalSessions
            : sessionHistory.length;
        if ((!Number.isFinite(storedTotalSessions) || storedTotalSessions <= 0) && sessionHistory.length > 0) {
            localStorage.setItem('lifeuk_total_sessions', String(totalSessions));
        }

        const accuracyValues = sessionHistory
            .map((session) => {
                const direct = Number(session.accuracy);
                if (Number.isFinite(direct)) return direct;

                const correct = Number(session.correct);
                const total = Number(session.questionsTotal ?? session.total);
                if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
                    return (correct / total) * 100;
                }

                return null;
            })
            .filter((value) => value !== null);
        const avgSessionAccuracy = accuracyValues.length > 0
            ? Math.round(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length)
            : 0;

        document.getElementById('streak-count').textContent =
            `${currentStreak} day${currentStreak === 1 ? '' : 's'}`;
        document.getElementById('best-streak').textContent =
            `${bestStreak} day${bestStreak === 1 ? '' : 's'}`;
        document.getElementById('total-sessions').textContent = String(totalSessions);
        document.getElementById('avg-session-accuracy').textContent = `${avgSessionAccuracy}%`;
    }

    updateActivityHeatmap() {
        const grid = document.getElementById('activity-heatmap-grid');
        if (!grid) return;

        const parsed = this.readJsonStorage('lifeuk_daily_activity', {});
        const activity = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(today);
        const mondayOffset = (startOfWeek.getDay() + 6) % 7; // Monday = 0
        startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);

        const endDate = new Date(startOfWeek);
        endDate.setDate(endDate.getDate() + 6);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - (12 * 7) + 1);

        grid.innerHTML = '';

        for (let i = 0; i < 84; i++) {
            const day = new Date(startDate);
            day.setDate(startDate.getDate() + i);

            const dayKey = this.getLocalDateKey(day);
            const rawValue = activity[dayKey];
            const questionsAnswered = typeof rawValue === 'number'
                ? rawValue
                : Number(rawValue && rawValue.questionsAnswered) || 0;

            let level = 0;
            if (questionsAnswered >= 26) level = 3;
            else if (questionsAnswered >= 11) level = 2;
            else if (questionsAnswered >= 1) level = 1;

            const cell = document.createElement('div');
            cell.className = `heatmap-cell level-${level}`;
            if (day > today) {
                cell.classList.add('future');
            }
            cell.title = `${dayKey}: ${questionsAnswered} question${questionsAnswered === 1 ? '' : 's'} answered`;
            grid.appendChild(cell);
        }
    }

    updateSessionHistory() {
        const container = document.getElementById('session-history-list');
        if (!container) return;

        const parsed = this.readJsonStorage('lifeuk_session_history', []);
        const history = Array.isArray(parsed) ? parsed : [];
        const recentSessions = history.slice(-10).reverse();

        container.innerHTML = '';

        if (recentSessions.length === 0) {
            container.innerHTML = '<p class="session-history-empty">No sessions recorded yet.</p>';
            return;
        }

        recentSessions.forEach((session) => {
            let correct = Number(session.correct);
            let total = Number(session.questionsTotal ?? session.total);
            let hasScore = Number.isFinite(correct) && Number.isFinite(total);
            let score = hasScore ? `${correct}/${total}` : '0/0';

            if (!hasScore && typeof session.score === 'string') {
                const matched = session.score.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
                if (matched) {
                    correct = Number(matched[1]);
                    total = Number(matched[2]);
                    hasScore = true;
                    score = `${correct}/${total}`;
                }
            }

            const explicitAccuracy = Number(session.accuracy);
            const accuracy = Number.isFinite(explicitAccuracy)
                ? Math.round(explicitAccuracy)
                : (hasScore && total > 0 ? Math.round((correct / total) * 100) : 0);

            const passed = typeof session.passed === 'boolean'
                ? session.passed
                : accuracy >= 75;

            const durationMs = Number(session.durationMs);
            const durationSecondsValue = Number(session.durationSeconds ?? session.duration);
            const durationSeconds = Number.isFinite(durationMs)
                ? Math.round(durationMs / 1000)
                : (Number.isFinite(durationSecondsValue) ? Math.round(durationSecondsValue) : 0);

            const date = new Date(session.date);
            const hasDate = !Number.isNaN(date.getTime());
            const dateText = hasDate
                ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Unknown date';

            const item = document.createElement('div');
            item.className = 'session-item';
            item.innerHTML = `
                <div class="session-main">
                    <span class="session-date">${dateText}</span>
                    <span class="session-mode">${this.getSessionModeLabel(session.mode)}</span>
                </div>
                <div class="session-stats">
                    <span class="session-score">${score}</span>
                    <span class="session-accuracy">${accuracy}%</span>
                    <span class="session-badge ${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</span>
                    <span class="session-duration">${this.formatSessionDuration(durationSeconds)}</span>
                </div>
            `;
            container.appendChild(item);
        });
    }

    getSessionModeLabel(mode) {
        const labels = {
            all: 'All Questions',
            failed: 'Failed Questions',
            weak: 'Weak Areas',
            new: 'New Questions'
        };
        return labels[mode] || 'Practice';
    }

    formatSessionDuration(totalSeconds) {
        const seconds = Number(totalSeconds);
        if (!Number.isFinite(seconds) || seconds <= 0) return '--';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
        return `${remainingSeconds}s`;
    }

    updateCategoryStats() {
        const categoryStats = {};

        categories.forEach(cat => {
            categoryStats[cat.id] = { correct: 0, total: 0, seen: 0, mastered: 0 };
        });

        this.getActiveQuestions().forEach(q => {
            const card = srs.cards[q.id];
            if (card) {
                const cat = q.category || 'General';
                if (!categoryStats[cat]) {
                    categoryStats[cat] = { correct: 0, total: 0, seen: 0, mastered: 0 };
                }
                categoryStats[cat].correct += card.correctCount;
                categoryStats[cat].total += card.correctCount + card.incorrectCount;
                categoryStats[cat].seen += 1;
                if (card.status === 'mastered') {
                    categoryStats[cat].mastered += 1;
                }
            }
        });

        const container = document.getElementById('category-stats');
        container.innerHTML = '';

        categories.forEach(cat => {
            const stats = categoryStats[cat.id];
            if (stats.seen === 0) return;

            const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
            const barClass = accuracy >= 75 ? 'good' : accuracy >= 50 ? 'medium' : 'poor';

            const row = document.createElement('div');
            row.className = 'category-row';
            row.innerHTML = `
                <span class="category-name">${cat.icon} ${cat.name}</span>
                <div class="category-details">
                    <div class="category-bar-container">
                        <div class="category-bar ${barClass}" style="width: ${accuracy}%"></div>
                    </div>
                    <span class="category-mastery">${stats.mastered} mastered / ${stats.seen} seen</span>
                </div>
                <span class="category-percent">${accuracy}%</span>
            `;
            container.appendChild(row);
        });

        if (container.children.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No data yet. Start practicing!</p>';
        }
    }

    updateDifficultQuestions() {
        const hardest = srs.getHardestQuestions(5);
        const container = document.getElementById('difficult-list');
        container.innerHTML = '';

        if (hardest.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No difficult questions identified yet.</p>';
            return;
        }

        const activeQuestions = this.getActiveQuestions();
        hardest.forEach(card => {
            const question = activeQuestions.find(q => q.id === card.id);
            if (!question) return;

            const accuracy = Math.round(card.accuracy * 100);
            const item = document.createElement('div');
            item.className = 'difficult-item';
            item.innerHTML = `
                <span class="difficult-question">${question.question}</span>
                <span class="difficult-rate">${accuracy}% (${card.attempts} attempts)</span>
            `;
            container.appendChild(item);
        });
    }

    // Read-only: returns the current streak value without modifying state.
    // Call recordPracticeForStreak() at session end to actually advance the streak.
    calculateStreak() {
        const lastPractice = localStorage.getItem('lifeuk_last_practice');
        const storedStreak = parseInt(localStorage.getItem('lifeuk_streak') || '0', 10);
        return Number.isFinite(storedStreak) ? storedStreak : 0;
    }

    // Write: advances the streak. Must only be called when the user has
    // actually answered questions in the current session.
    recordPracticeForStreak() {
        const lastPractice = localStorage.getItem('lifeuk_last_practice');
        const storedStreak = parseInt(localStorage.getItem('lifeuk_streak') || '0', 10);
        const streak = Number.isFinite(storedStreak) ? storedStreak : 0;

        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (lastPractice === today) {
            return; // Already recorded today's practice — nothing to do
        }

        const newStreak = lastPractice === yesterday ? streak + 1 : 1;
        localStorage.setItem('lifeuk_streak', String(newStreak));
        localStorage.setItem('lifeuk_last_practice', today);

        const storedBest = parseInt(localStorage.getItem('lifeuk_best_streak') || '0', 10);
        const bestStreak = Number.isFinite(storedBest) ? storedBest : 0;
        if (newStreak > bestStreak) {
            localStorage.setItem('lifeuk_best_streak', String(newStreak));
        }
    }

    getResponseTimeMs() {
        const shownAt = Number(this.questionShownAt);
        if (!Number.isFinite(shownAt)) return 0;
        return Math.max(0, Date.now() - shownAt);
    }

    getLocalDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    readJsonStorage(key, fallback) {
        const value = localStorage.getItem(key);
        if (!value) return fallback;

        try {
            const parsed = JSON.parse(value);
            return parsed ?? fallback;
        } catch {
            return fallback;
        }
    }

    appendSessionHistory(record) {
        const parsed = this.readJsonStorage('lifeuk_session_history', []);
        const history = Array.isArray(parsed) ? parsed : [];
        history.push(record);

        const trimmed = history.length > 100
            ? history.slice(history.length - 100)
            : history;
        localStorage.setItem('lifeuk_session_history', JSON.stringify(trimmed));
    }

    updateDailyActivity(delta = {}) {
        const parsed = this.readJsonStorage('lifeuk_daily_activity', {});
        const activity = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};

        const todayKey = this.getLocalDateKey();
        const current = activity[todayKey] && typeof activity[todayKey] === 'object'
            ? activity[todayKey]
            : {};

        const currentQuestionsAnswered = Number(current.questionsAnswered) || 0;
        const currentCorrectCount = Number(current.correctCount) || 0;
        const currentSessionsCompleted = Number(current.sessionsCompleted) || 0;
        const currentTimeSpentMs = Number(current.timeSpentMs) || 0;

        const deltaQuestionsAnswered = Number(delta.questionsAnswered) || 0;
        const deltaCorrectCount = Number(delta.correctCount) || 0;
        const deltaSessionsCompleted = Number(delta.sessionsCompleted) || 0;
        const deltaTimeSpentMs = Number(delta.timeSpentMs) || 0;

        activity[todayKey] = {
            questionsAnswered: Math.max(0, currentQuestionsAnswered + deltaQuestionsAnswered),
            correctCount: Math.max(0, currentCorrectCount + deltaCorrectCount),
            sessionsCompleted: Math.max(0, currentSessionsCompleted + deltaSessionsCompleted),
            timeSpentMs: Math.max(0, currentTimeSpentMs + deltaTimeSpentMs)
        };

        const activityDates = Object.keys(activity)
            .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
            .sort();
        if (activityDates.length > 90) {
            const toRemove = activityDates.slice(0, activityDates.length - 90);
            toRemove.forEach((dateKey) => {
                delete activity[dateKey];
            });
        }

        localStorage.setItem('lifeuk_daily_activity', JSON.stringify(activity));
    }

    incrementTotalSessions() {
        const storedTotal = parseInt(localStorage.getItem('lifeuk_total_sessions') || '0', 10);
        const safeTotal = Number.isFinite(storedTotal) ? storedTotal : 0;
        const nextTotal = safeTotal + 1;
        localStorage.setItem('lifeuk_total_sessions', String(nextTotal));
        return nextTotal;
    }

    updateDueCount() {
        const dueCount = srs.getDueCards().length;
        const badge = document.getElementById('due-count');
        badge.textContent = dueCount;
        badge.style.display = dueCount > 0 ? 'inline-block' : 'none';
    }

    updateFailedCount() {
        const failedCount = this.getFailedQuestions().length;
        const badge = document.getElementById('failed-count');
        if (badge) {
            badge.textContent = failedCount;
            badge.style.display = failedCount > 0 ? 'inline-block' : 'none';
        }
    }

    // ==================== SESSION PERSISTENCE ====================

    saveSession() {
        const session = {
            mode: this.currentMode,
            questions: this.sessionQuestions.map(q => q.id),
            answers: this.sessionAnswers,
            currentIndex: this.currentIndex,
            sessionCorrect: this.sessionCorrect,
            sessionTotal: this.sessionTotal,
            sessionStartTime: this.sessionStartTime
        };
        localStorage.setItem('lifeuk_session', JSON.stringify(session));
    }

    loadSession() {
        const saved = localStorage.getItem('lifeuk_session');
        if (saved) {
            try {
                const session = JSON.parse(saved);
                this.currentMode = session.mode || 'all';
                const activeQuestions = this.getActiveQuestions();
                this.sessionQuestions = session.questions
                    .map(id => activeQuestions.find(q => q.id === id))
                    .filter(q => q);
                this.sessionAnswers = session.answers || new Array(this.sessionQuestions.length).fill(null);
                this.currentIndex = session.currentIndex || 0;
                this.sessionCorrect = session.sessionCorrect || 0;
                this.sessionTotal = session.sessionTotal || 0;
                const savedSessionStartTime = Number(session.sessionStartTime);
                this.sessionStartTime = Number.isFinite(savedSessionStartTime)
                    ? savedSessionStartTime
                    : Date.now();

                if (this.sessionQuestions.length > 0 && this.currentIndex < this.sessionQuestions.length) {
                    this.renderProgressIndicator();
                    this.showQuestion();
                    return;
                }
            } catch (e) {
                console.error('Failed to load session:', e);
            }
        }

        this.startSession();
    }

    // ==================== DATA MANAGEMENT ====================

    async resetProgress() {
        if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
            srs.reset();
            localStorage.removeItem('lifeuk_session');
            localStorage.removeItem('lifeuk_streak');
            localStorage.removeItem('lifeuk_last_practice');
            localStorage.removeItem('lifeuk_session_history');
            localStorage.removeItem('lifeuk_daily_activity');
            localStorage.removeItem('lifeuk_best_streak');
            localStorage.removeItem('lifeuk_total_sessions');
            this.updateStats();
            this.updateDueCount();
            this.updateFailedCount();
            this.startSession();

            let cloudCleared = true;
            if (window.lifeUkSync && typeof window.lifeUkSync.clearRemote === 'function') {
                cloudCleared = await window.lifeUkSync.clearRemote();
            }

            if (cloudCleared) {
                alert('Progress has been reset.');
            } else {
                alert('Progress reset locally, but cloud clear failed. Please try again when online.');
            }
        }
    }

    exportData() {
        const data = {
            srs: JSON.parse(srs.export()),
            exportDate: new Date().toISOString(),
            stats: srs.getStats()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lifeuk-progress-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(reader.result);
                const importedCards = parsed && parsed.srs && typeof parsed.srs === 'object'
                    ? parsed.srs
                    : parsed;

                if (!importedCards || typeof importedCards !== 'object' || Array.isArray(importedCards)) {
                    throw new Error('Invalid backup format');
                }

                const ok = srs.import(JSON.stringify(importedCards));
                if (!ok) {
                    throw new Error('Import failed');
                }

                localStorage.removeItem('lifeuk_session');
                this.updateStats();
                this.updateDueCount();
                this.updateFailedCount();
                this.loadSession();

                let cloudSynced = true;
                if (window.lifeUkSync && typeof window.lifeUkSync.flushNow === 'function') {
                    cloudSynced = await window.lifeUkSync.flushNow();
                }

                if (cloudSynced) {
                    alert('Data imported successfully.');
                } else {
                    alert('Data imported locally. Cloud sync will retry automatically.');
                }
            } catch (error) {
                alert('Could not import this file. Please choose a valid JSON backup.');
            }
        };

        reader.onerror = () => {
            alert('Failed to read file. Please try again.');
        };

        reader.readAsText(file);
    }

    // ==================== KEYBOARD NAVIGATION ====================

    handleKeyboard(e) {
        if (this.currentTab !== 'practice' && this.currentTab !== 'review') return;

        const isReview = this.currentTab === 'review';
        const container = isReview ? 'review-options-container' : 'options-container';
        const optionBtns = document.querySelectorAll(`#${container} .option-btn`);

        const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5 };
        const key = e.key.toLowerCase();

        if (keyMap.hasOwnProperty(key) && !this.answered) {
            const index = keyMap[key];
            if (index < optionBtns.length) {
                optionBtns[index].click();
            }
        }

        if ((e.key === 'Enter' || e.key === ' ') && this.answered) {
            e.preventDefault();
            if (isReview) {
                this.nextReviewCard();
            } else {
                this.nextQuestion();
            }
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new QuizApp();
    (async () => {
        if (window.lifeUkAuth && typeof window.lifeUkAuth.init === 'function') {
            await window.lifeUkAuth.init();
        }
        if (window.lifeUkSync && typeof window.lifeUkSync.init === 'function') {
            await window.lifeUkSync.init();
        }
    })();
});
