import { render, screen } from '@testing-library/react';
import App from '../App';
import { describe, it, expect, vi } from 'vitest';

// Mock dependencies of App
vi.mock('../services/geminiService', () => ({
    sendMessageToGemini: vi.fn(),
    createChatSession: vi.fn()
}));

vi.mock('../ConversationHistory', () => ({
    default: () => <div data-testid="history-mock">History</div>
}));

vi.mock('../PromptDrawer', () => ({
    default: () => <div data-testid="drawer-mock">Drawer</div>
}));

describe('App', () => {
    it('renders without crashing', () => {
        render(<App />);
        // Check for some main element
        expect(screen.getByText(/Shukabase/i)).toBeInTheDocument();
    });

    it('shows welcome message initially', () => {
        render(<App />);
        expect(screen.getByPlaceholderText(/Спроси о чем угодно.../i)).toBeInTheDocument();
    });
});
